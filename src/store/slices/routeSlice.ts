import { GeneratedRoute, SavedRoute } from "../../types/route";
import { safeInvoke } from "../../utils/ipc";

type StoreSet = (partial: any) => void;
type StoreGet = () => {
    savedRoutes: SavedRoute[];
    saveRoute: (
        route: Partial<SavedRoute> & {
            departureIcao: string;
            arrivalIcao: string;
        },
    ) => Promise<SavedRoute | null>;
};

export function hydrateSavedRoute(r: any): SavedRoute {
    let sectors: any[] = [];
    try {
        sectors = JSON.parse(r.sectorsJson || "[]");
    } catch {}
    const intermediateIcaos =
        r.intermediateIcaos ||
        (Array.isArray(sectors) && sectors.length > 1
            ? JSON.stringify(
                  sectors
                      .slice(0, -1)
                      .map((s: any) => s.arrival?.icao)
                      .filter(Boolean),
              )
            : "[]");
    return {
        ...r,
        aircraftName: r.aircraftName || "Aircraft",
        sectorCount:
            r.sectorCount ??
            (Array.isArray(sectors) && sectors.length > 0 ? sectors.length : 1),
        includeGroundTime: r.includeGroundTime ?? true,
        isRoundTrip: r.isRoundTrip ?? false,
        intermediateIcaos,
        sectors: Array.isArray(sectors) ? sectors : [],
    };
}

export function createRouteSlice(set: StoreSet, get: StoreGet) {
    return {
        fetchSavedRoutes: async () => {
            try {
                const list = await safeInvoke<SavedRoute[]>("get_saved_routes");
                if (list && Array.isArray(list)) {
                    const hydrated = list.map(hydrateSavedRoute);
                    if (hydrated.length > 0) {
                        set({ savedRoutes: hydrated });
                        return hydrated;
                    } else if (get().savedRoutes.length > 0) {
                        // Sync existing cached routes to SQLite backend
                        for (const r of get().savedRoutes) {
                            await safeInvoke("save_route", { route: r });
                        }
                        return get().savedRoutes;
                    } else {
                        set({ savedRoutes: [] });
                        return [];
                    }
                }
            } catch (err) {
                console.warn(
                    "[flightStore] Failed to fetch saved routes:",
                    err,
                );
            }
            return get().savedRoutes;
        },

        setCurrentGeneratedRoute: (route: GeneratedRoute | null) => {
            set({ currentGeneratedRoute: route });
        },

        saveRoute: async (
            routeInput: Partial<SavedRoute> & {
                departureIcao: string;
                arrivalIcao: string;
            },
        ) => {
            const existing = get().savedRoutes.find((r) => {
                if (routeInput.id && r.id === routeInput.id) return true;
                return (
                    r.departureIcao === routeInput.departureIcao &&
                    r.arrivalIcao === routeInput.arrivalIcao &&
                    r.aircraftCategory === routeInput.aircraftCategory &&
                    r.totalDistanceNm === routeInput.totalDistanceNm &&
                    (routeInput.intermediateIcaos
                        ? r.intermediateIcaos === routeInput.intermediateIcaos
                        : true)
                );
            });

            const id = routeInput.id || existing?.id || `route-${Date.now()}`;
            const now = new Date().toISOString();
            const sectors = routeInput.sectors || existing?.sectors || [];
            const sectorsJson =
                routeInput.sectorsJson ||
                existing?.sectorsJson ||
                JSON.stringify(sectors);
            const sectorCount =
                routeInput.sectorCount ??
                (sectors.length > 0 ? sectors.length : 1);
            const aircraftName =
                routeInput.aircraftName || existing?.aircraftName || "Aircraft";
            const includeGroundTime =
                routeInput.includeGroundTime ??
                existing?.includeGroundTime ??
                true;
            const isRoundTrip =
                routeInput.isRoundTrip ?? existing?.isRoundTrip ?? false;

            const fullRoute: SavedRoute = {
                id,
                name:
                    routeInput.name ||
                    existing?.name ||
                    `${routeInput.departureIcao} ➔ ${routeInput.arrivalIcao}`,
                aircraftName,
                aircraftCategory:
                    routeInput.aircraftCategory ||
                    existing?.aircraftCategory ||
                    "A",
                departureIcao: routeInput.departureIcao,
                arrivalIcao: routeInput.arrivalIcao,
                intermediateIcaos:
                    routeInput.intermediateIcaos ||
                    existing?.intermediateIcaos ||
                    "[]",
                sectorCount,
                sectorsJson,
                sectors: sectors.length > 0 ? sectors : undefined,
                totalDistanceNm:
                    routeInput.totalDistanceNm ??
                    existing?.totalDistanceNm ??
                    0,
                totalAirborneMinutes:
                    routeInput.totalAirborneMinutes ??
                    existing?.totalAirborneMinutes ??
                    0,
                totalGroundMinutes:
                    routeInput.totalGroundMinutes ??
                    existing?.totalGroundMinutes ??
                    0,
                totalDurationMinutes:
                    routeInput.totalDurationMinutes ??
                    existing?.totalDurationMinutes ??
                    0,
                includeGroundTime,
                isRoundTrip,
                recommendedAltitudeFt:
                    routeInput.recommendedAltitudeFt ??
                    existing?.recommendedAltitudeFt ??
                    null,
                status: routeInput.status || existing?.status || "draft",
                isFavorite:
                    routeInput.isFavorite !== undefined
                        ? routeInput.isFavorite
                        : (existing?.isFavorite ?? false),
                linkedFlightId:
                    routeInput.linkedFlightId ??
                    existing?.linkedFlightId ??
                    null,
                createdAt: existing?.createdAt || routeInput.createdAt || now,
                flownAt: routeInput.flownAt ?? existing?.flownAt ?? null,
            };

            try {
                await safeInvoke("save_route", { route: fullRoute });
            } catch (err) {
                console.warn(
                    "[flightStore] Failed to save route to SQLite:",
                    err,
                );
            }

            const hydrated = hydrateSavedRoute(fullRoute);
            set((state: { savedRoutes: SavedRoute[] }) => ({
                savedRoutes: [
                    hydrated,
                    ...state.savedRoutes.filter((r) => r.id !== id),
                ],
            }));
            return hydrated;
        },

        toggleRouteFavorite: async (id: string) => {
            let newFav = false;
            try {
                const res = await safeInvoke<boolean>("toggle_route_favorite", {
                    id,
                });
                if (typeof res === "boolean") {
                    newFav = res;
                } else {
                    const existing = get().savedRoutes.find((r) => r.id === id);
                    newFav = !existing?.isFavorite;
                }
            } catch {
                const existing = get().savedRoutes.find((r) => r.id === id);
                newFav = !existing?.isFavorite;
            }

            set((state: { savedRoutes: SavedRoute[] }) => ({
                savedRoutes: state.savedRoutes.map((r) =>
                    r.id === id ? { ...r, isFavorite: newFav } : r,
                ),
            }));
            return newFav;
        },

        updateRouteStatus: async (
            id: string,
            status: "draft" | "flown",
            linkedFlightId?: string,
        ) => {
            try {
                await safeInvoke("update_route_status", {
                    id,
                    status,
                    linkedFlightId,
                });
            } catch (err) {
                console.warn(
                    "[flightStore] Failed to update route status in SQLite:",
                    err,
                );
            }

            const flownAt =
                status === "flown" ? new Date().toISOString() : null;
            set((state: { savedRoutes: SavedRoute[] }) => ({
                savedRoutes: state.savedRoutes.map((r) =>
                    r.id === id
                        ? {
                              ...r,
                              status,
                              flownAt: flownAt ?? r.flownAt,
                              linkedFlightId:
                                  linkedFlightId ?? r.linkedFlightId,
                          }
                        : r,
                ),
            }));
        },

        deleteSavedRoute: async (id: string) => {
            try {
                await safeInvoke("delete_saved_route", { id });
            } catch (err) {
                console.warn(
                    "[flightStore] Failed to delete route from SQLite:",
                    err,
                );
            }

            set((state: { savedRoutes: SavedRoute[] }) => ({
                savedRoutes: state.savedRoutes.filter((r) => r.id !== id),
            }));
        },

        updateSavedRoute: async (id: string, updates: Partial<SavedRoute>) => {
            const existing = get().savedRoutes.find((r) => r.id === id);
            if (!existing) return null;
            const merged: Partial<SavedRoute> & {
                departureIcao: string;
                arrivalIcao: string;
            } = {
                ...existing,
                ...updates,
                id,
                departureIcao: updates.departureIcao || existing.departureIcao,
                arrivalIcao: updates.arrivalIcao || existing.arrivalIcao,
            };
            return await get().saveRoute(merged);
        },
    };
}
