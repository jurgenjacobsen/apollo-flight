import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFlightStore } from './flightStore';

describe('flightStore flight state machine', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));

    // Reset module-level and store state cleanly before each test
    useFlightStore.setState({
      activeFlight: null,
      flightStage: 'BOARDING',
      flights: [],
      selectedFlightId: null,
      nearestAirport: null,
      autoStartRecording: true,
      isSyncingAirports: false,
      showEndFlightPrompt: false,
      detectedMultiSectorRoute: null,
      savedRoutes: [],
    });
    await useFlightStore.getState().updateTelemetry({ simConnected: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets telemetry and stage to BOARDING on disconnect or menu', async () => {
    const store = useFlightStore.getState();

    await store.updateTelemetry({
      simConnected: true,
      isInMenu: true,
      latitude: 51.47,
      longitude: -0.45,
    });
    expect(useFlightStore.getState().currentTelemetry.isInMenu).toBe(true);
    expect(useFlightStore.getState().flightStage).toBe('BOARDING');

    await store.updateTelemetry({ simConnected: false });
    expect(useFlightStore.getState().currentTelemetry.simConnected).toBe(false);
    expect(useFlightStore.getState().flightStage).toBe('BOARDING');
  });

  it('tracks BOARDING and TAXI_OUT when autoStartRecording is disabled', async () => {
    useFlightStore.setState({ autoStartRecording: false });
    const { updateTelemetry } = useFlightStore.getState();

    await updateTelemetry({
      simConnected: true,
      isInMenu: false,
      latitude: 51.47,
      longitude: -0.45,
      isOnGround: true,
      groundSpeed: 0,
    });
    expect(useFlightStore.getState().flightStage).toBe('BOARDING');

    await updateTelemetry({
      simConnected: true,
      isInMenu: false,
      latitude: 51.4701,
      longitude: -0.4501,
      isOnGround: true,
      groundSpeed: 12,
    });
    expect(useFlightStore.getState().flightStage).toBe('TAXI_OUT');
  });

  it('transitions through takeoff, cruise, shallow descent, go-around, touchdown, rollout, taxi-in, and arrival', async () => {
    const { updateTelemetry } = useFlightStore.getState();

    // 1. Auto-start on takeoff roll (GS > 20 kt)
    await updateTelemetry({
      simConnected: true,
      isInMenu: false,
      aircraftTitle: 'Cessna 172 Skyhawk',
      latitude: 51.47,
      longitude: -0.45,
      altitudeMsl: 100,
      altitudeAgl: 0,
      groundSpeed: 25,
      indicatedAirspeed: 25,
      verticalSpeed: 0,
      isOnGround: true,
      isEngineRunning: true,
      simTimeSeconds: 1000,
    });
    expect(useFlightStore.getState().activeFlight).not.toBeNull();
    expect(useFlightStore.getState().flightStage).toBe('TAKEOFF_CLIMB');

    // 2. Climb to cruise altitude (>= 9,000 ft sets hasReachedCruiseOrHighAlt)
    for (let i = 1; i <= 5; i++) {
      vi.advanceTimersByTime(1000);
      await updateTelemetry({
        simConnected: true,
        latitude: 51.48 + i * 0.01,
        longitude: -0.45,
        altitudeMsl: 10500,
        altitudeAgl: 10000,
        groundSpeed: 115,
        indicatedAirspeed: 100,
        verticalSpeed: 0,
        isOnGround: false,
        simTimeSeconds: 1000 + i,
      });
    }
    expect(useFlightStore.getState().flightStage).toBe('ENROUTE_CRUISE');

    // 3. Shallow approach glideslope (-250 fpm below 3,500 ft AGL) -> DESCENT_APPROACH
    for (let i = 6; i <= 15; i++) {
      vi.advanceTimersByTime(1000);
      await updateTelemetry({
        simConnected: true,
        latitude: 51.55 + i * 0.005,
        longitude: -0.45,
        altitudeMsl: 1800,
        altitudeAgl: 1500,
        groundSpeed: 65,
        indicatedAirspeed: 62,
        verticalSpeed: -250,
        isOnGround: false,
        simTimeSeconds: 1000 + i,
      });
    }
    expect(useFlightStore.getState().flightStage).toBe('DESCENT_APPROACH');

    // 4. Go-around: strong climb from low approach altitude
    for (let i = 16; i <= 25; i++) {
      vi.advanceTimersByTime(1000);
      await updateTelemetry({
        simConnected: true,
        latitude: 51.68 + i * 0.002,
        longitude: -0.45,
        altitudeMsl: 1200,
        altitudeAgl: 900,
        groundSpeed: 85,
        indicatedAirspeed: 80,
        verticalSpeed: 1200,
        pitch: 12,
        bank: 0,
        isOnGround: false,
        simTimeSeconds: 1000 + i,
      });
    }
    expect(useFlightStore.getState().flightStage).toBe('GO_AROUND');
    expect(useFlightStore.getState().activeFlight?.goAroundsCount).toBeGreaterThanOrEqual(1);

    // 6. Touchdown (air -> ground)
    vi.advanceTimersByTime(1000);
    await updateTelemetry({
      simConnected: true,
      latitude: 51.75,
      longitude: -0.45,
      altitudeMsl: 100,
      altitudeAgl: 0,
      groundSpeed: 55,
      indicatedAirspeed: 52,
      verticalSpeed: -180,
      touchdownNormalVelocity: -180,
      isOnGround: true,
      simTimeSeconds: 1036,
    });
    expect(useFlightStore.getState().flightStage).toBe('TOUCHDOWN_ROLLOUT');
    expect(useFlightStore.getState().activeFlight?.touchdowns).toHaveLength(1);
    expect(useFlightStore.getState().activeFlight?.touchdowns?.[0]?.gForce).toBe(1.16);

    // 7. Decelerate below 35 kt -> TAXI_IN
    vi.advanceTimersByTime(2000);
    await updateTelemetry({
      simConnected: true,
      latitude: 51.751,
      longitude: -0.45,
      altitudeMsl: 100,
      altitudeAgl: 0,
      groundSpeed: 20,
      verticalSpeed: 0,
      isOnGround: true,
      simTimeSeconds: 1038,
    });
    expect(useFlightStore.getState().flightStage).toBe('TAXI_IN');

    // 8. Stop and cut engines -> Arrival after 30s timeout
    await updateTelemetry({
      simConnected: true,
      latitude: 51.751,
      longitude: -0.45,
      groundSpeed: 0,
      isOnGround: true,
      isEngineRunning: false,
      allEnginesStopped: true,
      simTimeSeconds: 1039,
    });
    expect(useFlightStore.getState().activeFlight).not.toBeNull();

    vi.advanceTimersByTime(31000);
    await updateTelemetry({
      simConnected: true,
      latitude: 51.751,
      longitude: -0.45,
      groundSpeed: 0,
      isOnGround: true,
      isEngineRunning: false,
      allEnginesStopped: true,
      simTimeSeconds: 1070,
    });

    expect(useFlightStore.getState().activeFlight).toBeNull();
    expect(useFlightStore.getState().flightStage).toBe('ARRIVED');
    expect(useFlightStore.getState().flights).toHaveLength(1);
    expect(useFlightStore.getState().flights[0].status).toBe('COMPLETED');
  });
});
