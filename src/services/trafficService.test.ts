import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    VatsimTrafficProvider,
    IvaoTrafficProvider,
    fetchLiveTraffic,
    filterTrafficWithinRadius,
    getTrafficProvider,
    registerTrafficProvider,
} from "./trafficService";
import { useFlightStore } from "../store/flightStore";

describe("trafficService", () => {
    beforeEach(() => {
        useFlightStore.setState({ liveTrafficNetwork: "off" });
    });

    it("normalizes VATSIM v3 JSON feed payloads", () => {
        const provider = new VatsimTrafficProvider();
        const aircraft = provider.normalize({
            pilots: [
                {
                    cid: 1234567,
                    name: "Jane Pilot",
                    callsign: "BAW123",
                    latitude: 51.47,
                    longitude: -0.45,
                    altitude: 35000,
                    groundspeed: 452,
                    heading: 274,
                    transponder: "2201",
                    last_updated: "2026-11-25T11:00:00Z",
                    flight_plan: {
                        aircraft_short: "A320",
                        departure: "egll",
                        arrival: "kjfk",
                    },
                },
                {
                    callsign: "INVALID",
                    latitude: 999,
                    longitude: 0,
                },
            ],
        });

        expect(aircraft).toHaveLength(1);
        expect(aircraft[0]).toMatchObject({
            network: "vatsim",
            callsign: "BAW123",
            aircraftType: "A320",
            latitude: 51.47,
            longitude: -0.45,
            altitudeFt: 35000,
            groundSpeedKt: 452,
            headingDeg: 274,
            departureIcao: "EGLL",
            arrivalIcao: "KJFK",
            squawk: "2201",
            pilotName: "Jane Pilot",
        });
    });

    it("normalizes IVAO v2 whazzup JSON feed payloads", () => {
        const provider = new IvaoTrafficProvider();
        const aircraft = provider.normalize({
            clients: {
                pilots: [
                    {
                        userId: 554433,
                        callsign: "DLH400",
                        lastTrack: {
                            latitude: 50.03,
                            longitude: 8.57,
                            altitude: 1200,
                            groundSpeed: 145,
                            heading: 250,
                            onGround: false,
                            transponder: 4512,
                            timestamp: "2026-11-25T11:05:00Z",
                        },
                        flightPlan: {
                            aircraftId: "B748",
                            departureId: "eddf",
                            arrivalId: "kjfk",
                        },
                    },
                ],
            },
        });

        expect(aircraft).toHaveLength(1);
        expect(aircraft[0]).toMatchObject({
            network: "ivao",
            callsign: "DLH400",
            aircraftType: "B748",
            altitudeFt: 1200,
            groundSpeedKt: 145,
            headingDeg: 250,
            departureIcao: "EDDF",
            arrivalIcao: "KJFK",
            squawk: "4512",
            onGround: false,
        });
    });

    it("returns empty aircraft without network calls when network is off", async () => {
        const mockFetch = vi.fn();
        const res = await fetchLiveTraffic("off", {
            fetcher: mockFetch as unknown as typeof fetch,
        });

        expect(mockFetch).not.toHaveBeenCalled();
        expect(res.network).toBe("off");
        expect(res.aircraft).toEqual([]);
    });

    it("fetches and normalizes via the adaptable provider registry", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                pilots: [
                    {
                        callsign: "UAL1",
                        latitude: 40.64,
                        longitude: -73.78,
                        altitude: 10000,
                        groundspeed: 280,
                        heading: 180,
                    },
                ],
            }),
        });

        const res = await fetchLiveTraffic("vatsim", {
            fetcher: mockFetch as unknown as typeof fetch,
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(res.network).toBe("vatsim");
        expect(res.aircraft).toHaveLength(1);
        expect(res.aircraft[0].callsign).toBe("UAL1");
    });

    it("supports registering custom provider adapters", () => {
        const original = getTrafficProvider("ivao");
        const custom = new IvaoTrafficProvider();
        registerTrafficProvider(custom);
        expect(getTrafficProvider("ivao")).toBe(custom);
        registerTrafficProvider(original);
    });

    it("filters aircraft within a nautical-mile radius", () => {
        const nearby = filterTrafficWithinRadius(
            [
                {
                    id: "1",
                    network: "vatsim",
                    callsign: "NEAR",
                    latitude: 51.5,
                    longitude: -0.4,
                    altitudeFt: 5000,
                    groundSpeedKt: 200,
                    headingDeg: 90,
                    updatedAt: "2026-11-25T11:00:00Z",
                },
                {
                    id: "2",
                    network: "vatsim",
                    callsign: "FAR",
                    latitude: 40.64,
                    longitude: -73.78,
                    altitudeFt: 35000,
                    groundSpeedKt: 450,
                    headingDeg: 270,
                    updatedAt: "2026-11-25T11:00:00Z",
                },
            ],
            51.47,
            -0.45,
            50,
        );

        expect(nearby.map((a) => a.callsign)).toEqual(["NEAR"]);
    });

    it("updates liveTrafficNetwork in flightStore", async () => {
        await useFlightStore.getState().setLiveTrafficNetwork("vatsim");
        expect(useFlightStore.getState().liveTrafficNetwork).toBe("vatsim");

        await useFlightStore.getState().setLiveTrafficNetwork("ivao");
        expect(useFlightStore.getState().liveTrafficNetwork).toBe("ivao");
    });
});
