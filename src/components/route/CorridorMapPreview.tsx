import React, { useEffect } from "react";
import {
    MapContainer,
    TileLayer,
    Polyline,
    Marker,
    Popup,
    Circle,
    Polygon,
    useMap,
    useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { Maximize2 } from "lucide-react";
import { GeneratedRoute, GeographicAreaType } from "../../types/route";
import { formatFlightLevelOrAltitude } from "../../data/aircraftCategories";

export interface MapFocusTarget {
    id: number;
    bounds?: L.LatLngBoundsExpression;
    center?: [number, number];
    zoom?: number;
}

export function MapController({
    focusTarget,
}: {
    focusTarget: MapFocusTarget | null;
}) {
    const map = useMap();
    const lastHandledIdRef = React.useRef<number | null>(null);

    useEffect(() => {
        if (!focusTarget || focusTarget.id === lastHandledIdRef.current) return;
        lastHandledIdRef.current = focusTarget.id;

        if (focusTarget.bounds) {
            map.fitBounds(focusTarget.bounds, {
                padding: [60, 60],
                maxZoom: 10,
            });
        } else if (focusTarget.center) {
            map.setView(focusTarget.center, focusTarget.zoom ?? map.getZoom());
        }
    }, [focusTarget, map]);

    return null;
}

export function MapFitRouteControl({ onFit }: { onFit: () => void }) {
    return (
        <div className="leaflet-top leaflet-left !top-[74px]">
            <div className="leaflet-control leaflet-bar">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onFit();
                    }}
                    title="Fit Entire Route / Reset Zoom"
                    className="w-[30px] h-[30px] flex items-center justify-center bg-white dark:bg-[#1a1a1a] hover:bg-neutral-100 dark:hover:bg-[#262626] text-neutral-700 dark:text-neutral-200 cursor-pointer transition-colors border-0 select-none shadow-xs"
                >
                    <Maximize2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}

export function MapAreaClickHandler({
    areaType,
    onMapClick,
}: {
    areaType: GeographicAreaType;
    onMapClick: (lat: number, lon: number) => void;
}) {
    useMapEvents({
        click(e) {
            if (areaType !== "preset") {
                onMapClick(e.latlng.lat, e.latlng.lng);
            }
        },
    });
    return null;
}

export function MapViewportTracker({
    onViewportChange,
}: {
    onViewportChange: (
        center: [number, number],
        bounds: L.LatLngBounds,
        zoom: number,
    ) => void;
}) {
    const map = useMap();

    useEffect(() => {
        const c = map.getCenter();
        const b = map.getBounds();
        onViewportChange([c.lat, c.lng], b, map.getZoom());
    }, [map, onViewportChange]);

    useMapEvents({
        moveend(e) {
            const c = e.target.getCenter();
            const b = e.target.getBounds();
            onViewportChange([c.lat, c.lng], b, e.target.getZoom());
        },
        zoomend(e) {
            const c = e.target.getCenter();
            const b = e.target.getBounds();
            onViewportChange([c.lat, c.lng], b, e.target.getZoom());
        },
    });

    return null;
}

export const createAirportMarkerIcon = (
    icao: string,
    type: "dep" | "arr" | "waypoint",
) => {
    const bgColor =
        type === "dep" ? "#10b981" : type === "arr" ? "#8b5cf6" : "#f59e0b";
    const label = type === "dep" ? "DEP" : type === "arr" ? "ARR" : "WPT";
    return L.divIcon({
        className: "custom-route-marker",
        html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
        <div style="background: ${bgColor}; color: #ffffff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; border: 1.5px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); white-space: nowrap; display: flex; align-items: center; gap: 3px;">
          <span style="font-size: 8px; opacity: 0.9; text-transform: uppercase;">${label}</span>
          <span>${icao}</span>
        </div>
        <div style="width: 2px; height: 6px; background: ${bgColor};"></div>
        <div style="width: 6px; height: 6px; border-radius: 50%; background: ${bgColor}; border: 1.5px solid #ffffff;"></div>
      </div>
    `,
        iconSize: [52, 30],
        iconAnchor: [26, 30],
        popupAnchor: [0, -30],
    });
};

export const createWaypointMarkerIcon = (ident: string, airway?: string) => {
    return L.divIcon({
        className: "custom-wpt-marker",
        html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
        <div style="background: #0f172a; color: #38bdf8; font-size: 8px; font-weight: 700; padding: 1px 3px; border-radius: 2px; border: 1px solid #0284c7; white-space: nowrap; line-height: 1; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">
          ▲ ${ident}${airway ? ` (${airway})` : ""}
        </div>
      </div>
    `,
        iconSize: [42, 14],
        iconAnchor: [21, 7],
    });
};

export const createMountainPeakMarkerIcon = (peakFt: number) => {
    return L.divIcon({
        className: "custom-peak-marker",
        html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
        <div style="background: #171717; color: #f59e0b; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; border: 1px solid #f59e0b; box-shadow: 0 2px 4px rgba(0,0,0,0.4); white-space: nowrap;">
          ▲ ${(peakFt / 1000).toFixed(1)}k ft
        </div>
      </div>
    `,
        iconSize: [44, 18],
        iconAnchor: [22, 9],
    });
};

export const createAreaCenterMarkerIcon = (radiusNm: number) => {
    return L.divIcon({
        className: "custom-area-marker",
        html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto; cursor: grab; user-select: none;">
        <div style="background: #0284c7; color: #ffffff; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1.5px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.4); white-space: nowrap;">
          ● Center (${radiusNm} NM)
        </div>
      </div>
    `,
        iconSize: [84, 20],
        iconAnchor: [42, 10],
    });
};

export const createVertexMarkerIcon = (index: number) => {
    return L.divIcon({
        className: "custom-vertex-marker",
        html: `
      <div oncontextmenu="event.preventDefault();" title="Drag to move · Right-click to delete" style="display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: #7c3aed; color: #ffffff; font-size: 9px; font-weight: 700; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: grab; user-select: none;">
        ${index}
      </div>
    `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
    });
};

export const createMidpointMarkerIcon = () => {
    return L.divIcon({
        className: "custom-midpoint-marker",
        html: `
      <div oncontextmenu="event.preventDefault();" style="display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; background: #9333ea; color: #ffffff; font-size: 11px; font-weight: 700; border-radius: 50%; border: 1.5px solid #ffffff; box-shadow: 0 1px 4px rgba(0,0,0,0.4); cursor: grab; user-select: none; opacity: 0.9;" title="Drag or click to insert a vertex on this border">
        +
      </div>
    `,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
};

interface CorridorMapPreviewProps {
    route: GeneratedRoute;
    initialDep: any;
    finalLeg: any;
    theme: string;
    mapFocusTarget: MapFocusTarget | null;
    handleFocusRoute: () => void;
    handleViewportChange: (center: [number, number], bounds: L.LatLngBounds, zoom: number) => void;
    areaType: GeographicAreaType;
    circleCenter: [number, number];
    circleRadiusNm: number;
    polygonCoords: [number, number][];
    showCircleCenterBadge: boolean;
    setCircleCenter: React.Dispatch<React.SetStateAction<[number, number]>>;
    setPolygonCoords: React.Dispatch<React.SetStateAction<[number, number][]>>;
    handleMapClick: (lat: number, lon: number) => void;
    handleDeletePolygonVertex: (index: number) => void;
    handleAddPolygonVertexAt: (index: number, lat: number, lon: number) => void;
}

export const CorridorMapPreview: React.FC<CorridorMapPreviewProps> = ({
    route,
    initialDep,
    finalLeg,
    theme,
    mapFocusTarget,
    handleFocusRoute,
    handleViewportChange,
    areaType,
    circleCenter,
    circleRadiusNm,
    polygonCoords,
    showCircleCenterBadge,
    setCircleCenter,
    setPolygonCoords,
    handleMapClick,
    handleDeletePolygonVertex,
    handleAddPolygonVertexAt,
}) => {
    return (
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-1 shadow-sm overflow-hidden">
            <div className="h-[420px] w-full rounded-sm overflow-hidden relative z-0">
                <MapContainer
                    center={circleCenter}
                    zoom={6}
                    style={{
                        height: "100%",
                        width: "100%",
                    }}
                    className={theme === "dark" ? "dark-tiles" : ""}
                >
                    <MapController focusTarget={mapFocusTarget} />
                    <MapViewportTracker onViewportChange={handleViewportChange} />
                    <MapFitRouteControl onFit={handleFocusRoute} />
                    <MapAreaClickHandler areaType={areaType} onMapClick={handleMapClick} />
                    <TileLayer
                        attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                        url="https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={19}
                    />

                    {/* Area Boundary Overlay if custom geographic area */}
                    {areaType === "circle" && circleCenter && (
                        <>
                            <Circle
                                center={circleCenter}
                                radius={circleRadiusNm * 1852}
                                pathOptions={{
                                    color: "#0284c7",
                                    fillColor: "#38bdf8",
                                    fillOpacity: 0.12,
                                    weight: 2,
                                    dashArray: "5, 5",
                                }}
                            />
                            {showCircleCenterBadge && (
                                <Marker
                                    position={circleCenter}
                                    draggable={true}
                                    eventHandlers={{
                                        dragend: (e) => {
                                            const marker = e.target;
                                            const pos = marker.getLatLng();
                                            setCircleCenter([pos.lat, pos.lng]);
                                        },
                                    }}
                                    icon={createAreaCenterMarkerIcon(circleRadiusNm)}
                                >
                                    <Popup>
                                        <div className="text-xs space-y-1">
                                            <strong className="text-sky-600 block">Search Area Center</strong>
                                            <div>Lat: {circleCenter[0].toFixed(4)}°, Lon: {circleCenter[1].toFixed(4)}°</div>
                                            <div className="text-[10px] text-neutral-400">Radius: {circleRadiusNm} NM · Drag to reposition</div>
                                        </div>
                                    </Popup>
                                </Marker>
                            )}
                        </>
                    )}

                    {areaType === "polygon" && polygonCoords.length >= 3 && (
                        <>
                            <Polygon
                                positions={polygonCoords}
                                pathOptions={{
                                    color: "#7c3aed",
                                    fillColor: "#a855f7",
                                    fillOpacity: 0.14,
                                    weight: 2,
                                    dashArray: "6, 4",
                                }}
                            />
                            {polygonCoords.map((coord, idx) => {
                                const nextCoord = polygonCoords[(idx + 1) % polygonCoords.length];
                                const midLat = (coord[0] + nextCoord[0]) / 2;
                                const midLon = (coord[1] + nextCoord[1]) / 2;
                                return (
                                    <React.Fragment key={`poly-wpt-${idx}`}>
                                        <Marker
                                            position={coord}
                                            draggable={true}
                                            eventHandlers={{
                                                dragend: (e) => {
                                                    const marker = e.target;
                                                    const pos = marker.getLatLng();
                                                    setPolygonCoords((prev) => {
                                                        const copy = [...prev];
                                                        copy[idx] = [pos.lat, pos.lng];
                                                        return copy;
                                                    });
                                                },
                                                contextmenu: (e) => {
                                                    if (e.originalEvent) {
                                                        e.originalEvent.preventDefault();
                                                        e.originalEvent.stopPropagation();
                                                    }
                                                    handleDeletePolygonVertex(idx);
                                                },
                                            }}
                                            icon={createVertexMarkerIcon(idx + 1)}
                                        >
                                            <Popup>
                                                <div className="text-xs space-y-1">
                                                    <strong className="text-purple-600 block">Polygon Vertex #{idx + 1}</strong>
                                                    <div>Lat: {coord[0].toFixed(4)}°, Lon: {coord[1].toFixed(4)}°</div>
                                                    <div className="text-[10px] text-neutral-400">Drag to move · Right-click to delete</div>
                                                    <button
                                                        type="button"
                                                        onClick={(ev) => {
                                                            ev.stopPropagation();
                                                            handleDeletePolygonVertex(idx);
                                                        }}
                                                        className="mt-1 text-[10px] text-red-600 hover:text-red-700 hover:underline flex items-center gap-1 font-medium"
                                                    >
                                                        Delete vertex #{idx + 1}
                                                    </button>
                                                </div>
                                            </Popup>
                                        </Marker>
                                        <Marker
                                            position={[midLat, midLon]}
                                            draggable={true}
                                            eventHandlers={{
                                                dragend: (e) => {
                                                    const marker = e.target;
                                                    const pos = marker.getLatLng();
                                                    handleAddPolygonVertexAt(idx + 1, pos.lat, pos.lng);
                                                },
                                                click: () => {
                                                    handleAddPolygonVertexAt(idx + 1, midLat, midLon);
                                                },
                                            }}
                                            icon={createMidpointMarkerIcon()}
                                        />
                                    </React.Fragment>
                                );
                            })}
                        </>
                    )}

                    {/* Sector Polylines */}
                    {route.sectors.map((sector, idx) => {
                        const positions: [number, number][] = [
                            [sector.departure.latitude, sector.departure.longitude],
                            ...(sector.waypoints || []).map((w): [number, number] => [w.latitude, w.longitude]),
                            [sector.arrival.latitude, sector.arrival.longitude],
                        ];
                        const colors = ["#10b981", "#0284c7", "#f59e0b", "#ec4899", "#8b5cf6"];
                        const legColor = colors[idx % colors.length];

                        return (
                            <Polyline
                                key={`leg-polyline-${idx}`}
                                positions={positions}
                                pathOptions={{
                                    color: legColor,
                                    weight: 3.5,
                                    opacity: 0.9,
                                }}
                            />
                        );
                    })}

                    {/* Departure Airport Marker */}
                    {initialDep && (
                        <Marker
                            position={[initialDep.latitude, initialDep.longitude]}
                            icon={createAirportMarkerIcon(initialDep.icao, "dep")}
                        >
                            <Popup>
                                <div className="text-xs space-y-1">
                                    <strong className="text-emerald-600 block text-sm">Departure: {initialDep.icao}</strong>
                                    <div>{initialDep.name}</div>
                                    <div className="text-neutral-500">{initialDep.countryName} · Elev. {initialDep.elevationFt || 0} ft</div>
                                    <div className="text-[10px] text-neutral-400">Type: {initialDep.airportType || "Airport"}</div>
                                </div>
                            </Popup>
                        </Marker>
                    )}

                    {/* Intermediate Waypoint Markers */}
                    {route.sectors.slice(0, -1).map((s, idx) => (
                        <Marker
                            key={`mid-${idx}`}
                            position={[s.arrival.latitude, s.arrival.longitude]}
                            icon={createAirportMarkerIcon(s.arrival.icao, "waypoint")}
                        >
                            <Popup>
                                <div className="text-xs space-y-1">
                                    <strong className="text-amber-600 block text-sm">Waypoint {idx + 1}: {s.arrival.icao}</strong>
                                    <div>{s.arrival.name}</div>
                                    <div className="text-neutral-500">{s.arrival.countryName} · Elev. {s.arrival.elevationFt || 0} ft</div>
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    {/* Final Arrival Airport Marker */}
                    {finalLeg && (
                        <Marker
                            position={[finalLeg.arrival.latitude, finalLeg.arrival.longitude]}
                            icon={createAirportMarkerIcon(finalLeg.arrival.icao, "arr")}
                        >
                            <Popup>
                                <div className="text-xs space-y-1">
                                    <strong className="text-purple-600 block text-sm">Destination: {finalLeg.arrival.icao}</strong>
                                    <div>{finalLeg.arrival.name}</div>
                                    <div className="text-neutral-500">{finalLeg.arrival.countryName} · Elev. {finalLeg.arrival.elevationFt || 0} ft</div>
                                </div>
                            </Popup>
                        </Marker>
                    )}

                    {/* Airway Waypoint Markers */}
                    {route.sectors.flatMap((sector, sIdx) =>
                        (sector.waypoints || []).map((wpt, wIdx) => (
                            <Marker
                                key={`airway-wpt-${sIdx}-${wIdx}-${wpt.ident}`}
                                position={[wpt.latitude, wpt.longitude]}
                                icon={createWaypointMarkerIcon(wpt.ident, wpt.airway)}
                            >
                                <Popup>
                                    <div className="text-xs space-y-1">
                                        <strong className="text-sky-600 dark:text-sky-400 block font-bold">Fix: {wpt.ident}</strong>
                                        {wpt.airway && <div>Airway: {wpt.airway}</div>}
                                    </div>
                                </Popup>
                            </Marker>
                        )),
                    )}

                    {/* Limiting Terrain Peak Markers */}
                    {route.sectors.map((sector, idx) => {
                        if (!sector.limitingCoord || (sector.peakTerrainFt || 0) < 4000) return null;
                        return (
                            <Marker
                                key={`peak-${idx}`}
                                position={sector.limitingCoord}
                                icon={createMountainPeakMarkerIcon(sector.peakTerrainFt || 0)}
                            >
                                <Popup>
                                    <div className="text-xs space-y-1">
                                        <strong className="text-amber-600 block">Corridor Terrain Peak (Leg {idx + 1})</strong>
                                        <div>Highest Relief: ~{sector.peakTerrainFt?.toLocaleString()} ft MSL</div>
                                        <div>Sector MORA: {formatFlightLevelOrAltitude(sector.corridorMsaFt || 0)} ({sector.corridorMsaFt?.toLocaleString()} ft)</div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );
};
