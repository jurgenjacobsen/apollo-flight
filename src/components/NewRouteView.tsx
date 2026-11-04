import React, { useState, useEffect, useMemo } from 'react';
import { useFlightStore } from '../store/flightStore';
import { Select } from './ui/Select';
import { 
  AircraftCategory, 
  AirportTypePreference, 
  RunwaySurfacePreference,
  RouteLimitType, 
  GeneratedRoute, 
  RouteSearchParams,
  GeographicAreaType,
  GeographicAreaFilter
} from '../types/route';
import { AIRCRAFT_CATEGORIES, formatDurationHoursMinutes, formatFlightLevelOrAltitude } from '../data/aircraftCategories';
import { generateRouteSuggestion } from '../services/routeGenerator';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, Circle, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { 
  Route, 
  Plane, 
  MapPin, 
  Compass, 
  Clock, 
  Sliders, 
  RotateCw, 
  ArrowRight, 
  Sparkles, 
  ArrowLeftRight, 
  Check, 
  Copy, 
  Play, 
  AlertTriangle, 
  Info,
  Globe2,
  Navigation,
  Milestone,
  Gauge,
  ChevronDown,
  Mountain,
  CircleDot,
  Scan,
  Crosshair,
  Trash2,
  Undo2,
  Bookmark,
  Heart
} from 'lucide-react';

interface MapFocusTarget {
  bounds?: L.LatLngBoundsExpression;
  center?: [number, number];
  zoom?: number;
  id: number;
}

// Leaflet map controller: Only pans/fits when explicitly triggered by focusTarget.id change
function MapController({ focusTarget }: { focusTarget: MapFocusTarget | null }) {
  const map = useMap();
  const lastHandledIdRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (!focusTarget || focusTarget.id === lastHandledIdRef.current) return;
    lastHandledIdRef.current = focusTarget.id;

    if (focusTarget.bounds) {
      map.fitBounds(focusTarget.bounds, { padding: [50, 50], maxZoom: 10 });
    } else if (focusTarget.center) {
      map.setView(focusTarget.center, focusTarget.zoom ?? map.getZoom());
    }
  }, [focusTarget, map]);

  return null;
}

// Map click event listener for custom area definition
function MapAreaClickHandler({
  areaType,
  onMapClick,
}: {
  areaType: GeographicAreaType;
  onMapClick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (areaType !== 'preset') {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// Tracks current map viewport center and bounds without causing global re-renders
function MapViewportTracker({
  onViewportChange,
}: {
  onViewportChange: (center: [number, number], bounds: L.LatLngBounds, zoom: number) => void;
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

// Custom Leaflet waypoint marker icons
const createAirportMarkerIcon = (icao: string, type: 'dep' | 'arr' | 'waypoint') => {
  const bgColor = type === 'dep' ? '#10b981' : type === 'arr' ? '#8b5cf6' : '#f59e0b';
  return L.divIcon({
    className: 'custom-route-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
        <div style="background: ${bgColor}; color: #ffffff; font-family: monospace; font-size: 10px; font-weight: 700; padding: 2px 5px; border-radius: 3px; border: 1.5px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); white-space: nowrap;">
          ${icao}
        </div>
        <div style="width: 2px; height: 6px; background: ${bgColor};"></div>
        <div style="width: 6px; height: 6px; border-radius: 50%; background: ${bgColor}; border: 1.5px solid #ffffff;"></div>
      </div>
    `,
    iconSize: [40, 30],
    iconAnchor: [20, 30],
    popupAnchor: [0, -30],
  });
};

const createMountainPeakMarkerIcon = (peakFt: number) => {
  return L.divIcon({
    className: 'custom-peak-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
        <div style="background: #171717; color: #f59e0b; font-family: monospace; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; border: 1px solid #f59e0b; box-shadow: 0 2px 4px rgba(0,0,0,0.4); white-space: nowrap;">
          ▲ ${(peakFt / 1000).toFixed(1)}k ft
        </div>
      </div>
    `,
    iconSize: [44, 18],
    iconAnchor: [22, 9],
  });
};

const createAreaCenterMarkerIcon = (radiusNm: number) => {
  return L.divIcon({
    className: 'custom-area-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto; cursor: grab; user-select: none;">
        <div style="background: #0284c7; color: #ffffff; font-family: monospace; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1.5px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.4); white-space: nowrap;">
          ● Center (${radiusNm} NM)
        </div>
      </div>
    `,
    iconSize: [84, 20],
    iconAnchor: [42, 10],
  });
};

const createVertexMarkerIcon = (index: number) => {
  return L.divIcon({
    className: 'custom-vertex-marker',
    html: `
      <div oncontextmenu="event.preventDefault();" title="Drag to move · Right-click to delete" style="display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: #7c3aed; color: #ffffff; font-family: monospace; font-size: 9px; font-weight: 700; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: grab; user-select: none;">
        ${index}
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const createMidpointMarkerIcon = () => {
  return L.divIcon({
    className: 'custom-midpoint-marker',
    html: `
      <div oncontextmenu="event.preventDefault();" style="display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; background: #9333ea; color: #ffffff; font-family: monospace; font-size: 11px; font-weight: 700; border-radius: 50%; border: 1.5px solid #ffffff; box-shadow: 0 1px 4px rgba(0,0,0,0.4); cursor: grab; user-select: none; opacity: 0.9;" title="Drag or click to insert a vertex on this border">
        +
      </div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
};

const CONTINENT_OPTIONS = [
  { value: 'random', label: 'Worldwide / Random' },
  { value: 'EU', label: 'Europe (EU)' },
  { value: 'NA', label: 'North America (NA)' },
  { value: 'SA', label: 'South America (SA)' },
  { value: 'AS', label: 'Asia & Middle East (AS)' },
  { value: 'AF', label: 'Africa (AF)' },
  { value: 'OC', label: 'Oceania & Australia (OC)' },
];

const POPULAR_COUNTRIES = [
  { value: 'US', label: 'United States' },
  { value: 'DE', label: 'Germany' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'FR', label: 'France' },
  { value: 'AT', label: 'Austria' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'JP', label: 'Japan' },
  { value: 'BR', label: 'Brazil' },
];

export const NewRouteView: React.FC = () => {
  const {
    currentTelemetry,
    startManualFlight,
    setActiveView,
    theme,
    nearestAirport,
    fetchNearestAirport,
    saveRoute,
    savedRoutes,
    currentGeneratedRoute,
    setCurrentGeneratedRoute,
  } = useFlightStore();

  // Form State
  const [category, setCategory] = useState<AircraftCategory>('C');
  const [airportType, setAirportType] = useState<AirportTypePreference>('all');
  const [runwaySurface, setRunwaySurface] = useState<RunwaySurfacePreference>('any');
  const [runwayUnit, setRunwayUnit] = useState<'ft' | 'm'>('ft');
  const [customMinRunway, setCustomMinRunway] = useState<number | ''>('');
  const [customMaxRunway, setCustomMaxRunway] = useState<number | ''>('');
  const [region, setRegion] = useState<string>('random');
  const [areaType, setAreaType] = useState<GeographicAreaType>('preset');
  const [circleCenter, setCircleCenter] = useState<[number, number]>([47.2602, 11.344]); // Default to Innsbruck / Alps
  const [circleRadiusNm, setCircleRadiusNm] = useState<number>(150);
  const [polygonCoords, setPolygonCoords] = useState<[number, number][]>([]);
  const [mapZoom, setMapZoom] = useState<number>(6);

  // Track map viewport center, bounds, and zoom level without causing global re-renders
  const mapViewportRef = React.useRef<{
    center: [number, number];
    bounds: L.LatLngBounds | null;
    zoom: number;
  }>({
    center: [47.2602, 11.344],
    bounds: null,
    zoom: 6,
  });

  const handleViewportChange = React.useCallback((center: [number, number], bounds: L.LatLngBounds, zoom: number) => {
    mapViewportRef.current = { center, bounds, zoom };
    setMapZoom((prev) => (prev !== zoom ? zoom : prev));
  }, []);

  // Hide the center text badge when zooming out past regional scale (zoom < 5) to keep map view clean
  const showCircleCenterBadge = mapZoom >= 5;

  const handleSelectAreaType = (newType: GeographicAreaType) => {
    setAreaType(newType);

    const currentCenter = mapViewportRef.current.center;
    const currentBounds = mapViewportRef.current.bounds;

    if (newType === 'circle') {
      // Position circle directly where the user is currently looking on the map
      setCircleCenter(currentCenter);

      // Adjust circle radius to fit comfortably in view if needed
      if (currentBounds) {
        const dLatDeg = Math.abs(currentBounds.getNorth() - currentBounds.getSouth()) / 2;
        const viewMaxNm = Math.round(dLatDeg * 60 * 0.7);
        if (circleRadiusNm > viewMaxNm * 1.5 && viewMaxNm >= 30) {
          const clamped = Math.max(20, Math.min(600, Math.round(viewMaxNm / 10) * 10));
          setCircleRadiusNm(clamped);
        }
      }
    } else if (newType === 'polygon') {
      // If polygon has no vertices, create an initial 4-point bounding box in current view
      if (polygonCoords.length === 0) {
        if (currentBounds) {
          const dLat = (currentBounds.getNorth() - currentBounds.getSouth()) * 0.22;
          const dLon = (currentBounds.getEast() - currentBounds.getWest()) * 0.22;
          setPolygonCoords([
            [currentCenter[0] + dLat, currentCenter[1] - dLon],
            [currentCenter[0] + dLat, currentCenter[1] + dLon],
            [currentCenter[0] - dLat, currentCenter[1] + dLon],
            [currentCenter[0] - dLat, currentCenter[1] - dLon],
          ]);
        } else {
          const dLat = 0.8;
          const dLon = 1.2;
          setPolygonCoords([
            [currentCenter[0] + dLat, currentCenter[1] - dLon],
            [currentCenter[0] + dLat, currentCenter[1] + dLon],
            [currentCenter[0] - dLat, currentCenter[1] + dLon],
            [currentCenter[0] - dLat, currentCenter[1] - dLon],
          ]);
        }
      }
    }
  };

  const handleMapClick = (lat: number, lon: number) => {
    if (areaType === 'circle') {
      setCircleCenter([lat, lon]);
    } else if (areaType === 'polygon') {
      setPolygonCoords((prev) => [...prev, [lat, lon]]);
    }
  };

  const handleQuickBoxPolygon = () => {
    const currentCenter = mapViewportRef.current.center;
    const currentBounds = mapViewportRef.current.bounds;

    if (currentBounds) {
      const dLat = (currentBounds.getNorth() - currentBounds.getSouth()) * 0.25;
      const dLon = (currentBounds.getEast() - currentBounds.getWest()) * 0.25;
      setPolygonCoords([
        [currentCenter[0] + dLat, currentCenter[1] - dLon],
        [currentCenter[0] + dLat, currentCenter[1] + dLon],
        [currentCenter[0] - dLat, currentCenter[1] + dLon],
        [currentCenter[0] - dLat, currentCenter[1] - dLon],
      ]);
    } else {
      const center = currentCenter;
      const dLat = 0.8;
      const dLon = 1.2;
      setPolygonCoords([
        [center[0] + dLat, center[1] - dLon],
        [center[0] + dLat, center[1] + dLon],
        [center[0] - dLat, center[1] + dLon],
        [center[0] - dLat, center[1] - dLon],
      ]);
    }
  };

  const handleCenterCircleOnTelemetry = () => {
    const target: [number, number] | null = nearestAirport
      ? [nearestAirport.latitude, nearestAirport.longitude]
      : currentTelemetry.latitude !== 0 || currentTelemetry.longitude !== 0
      ? [currentTelemetry.latitude, currentTelemetry.longitude]
      : null;

    if (target) {
      setCircleCenter(target);
      setMapFocusTarget({
        center: target,
        zoom: 8,
        id: Date.now(),
      });
    }
  };

  const handleUpdatePolygonVertex = (index: number, lat: number, lon: number) => {
    setPolygonCoords((prev) => {
      const updated = [...prev];
      if (index >= 0 && index < updated.length) {
        updated[index] = [lat, lon];
      }
      return updated;
    });
  };

  const handleDeletePolygonVertex = (index: number) => {
    setPolygonCoords((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInsertVertexAtIndex = (insertIndex: number, lat: number, lon: number) => {
    setPolygonCoords((prev) => {
      const updated = [...prev];
      updated.splice(insertIndex, 0, [lat, lon]);
      return updated;
    });
  };

  const handleInsertPolygonVertexOnBorder = (lat: number, lon: number) => {
    if (polygonCoords.length < 2) {
      setPolygonCoords((prev) => [...prev, [lat, lon]]);
      return;
    }

    const N = polygonCoords.length;
    const isClosed = N >= 3;
    const segmentsCount = isClosed ? N : N - 1;

    let bestSegmentIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < segmentsCount; i++) {
      const A = polygonCoords[i];
      const B = polygonCoords[(i + 1) % N];

      const midLatRad = ((A[0] + B[0]) / 2) * (Math.PI / 180);
      const cosLat = Math.cos(midLatRad);

      const dx = (B[1] - A[1]) * cosLat;
      const dy = B[0] - A[0];
      const lenSq = dx * dx + dy * dy;

      let t = 0;
      if (lenSq > 1e-12) {
        const px = (lon - A[1]) * cosLat;
        const py = lat - A[0];
        t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
      }

      const projLat = A[0] + t * (B[0] - A[0]);
      const projLon = A[1] + t * (B[1] - A[1]);

      const dist = Math.hypot((lon - projLon) * cosLat, lat - projLat);
      if (dist < minDistance) {
        minDistance = dist;
        bestSegmentIdx = i;
      }
    }

    handleInsertVertexAtIndex(bestSegmentIdx + 1, lat, lon);
  };

  const [limitBy, setLimitBy] = useState<RouteLimitType>('none');
  const [limitScope, setLimitScope] = useState<'total' | 'sector'>('total');
  const [minLimitValue, setMinLimitValue] = useState<number>(30);
  const [maxLimitValue, setMaxLimitValue] = useState<number>(120);
  const [sectorCount, setSectorCount] = useState<number>(1);
  const [departureIcao, setDepartureIcao] = useState<string>('');
  const [arrivalIcao, setArrivalIcao] = useState<string>('');
  const [includeGroundTime, setIncludeGroundTime] = useState<boolean>(true);

  // Collapsible section states
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    airportType: false,
    runway: false,
    region: false,
    limitations: false,
    fixedAerodromes: false,
  });

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Unit conversion helper
  const handleToggleRunwayUnit = (newUnit: 'ft' | 'm') => {
    if (newUnit === runwayUnit) return;
    setRunwayUnit(newUnit);
    if (customMinRunway !== '') {
      setCustomMinRunway(newUnit === 'm' ? Math.round(Number(customMinRunway) * 0.3048) : Math.round(Number(customMinRunway) * 3.28084));
    }
    if (customMaxRunway !== '') {
      setCustomMaxRunway(newUnit === 'm' ? Math.round(Number(customMaxRunway) * 0.3048) : Math.round(Number(customMaxRunway) * 3.28084));
    }
  };

  // Generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [route, setRoute] = useState<GeneratedRoute | null>(currentGeneratedRoute);
  const [copied, setCopied] = useState<boolean>(false);
  const [draftSavedNotice, setDraftSavedNotice] = useState<boolean>(false);
  const currentSavedRoute = useMemo(() => {
    if (!route || route.sectors.length === 0) return null;
    const firstLeg = route.sectors[0];
    const finalLeg = route.sectors[route.sectors.length - 1];
    return savedRoutes.find((r) => {
      if (r.id === route.id) return true;
      return (
        r.departureIcao === firstLeg.departure.icao &&
        r.arrivalIcao === finalLeg.arrival.icao &&
        r.aircraftCategory === route.aircraftCategory &&
        r.totalDistanceNm === route.totalDistanceNm
      );
    });
  }, [route, savedRoutes]);

  const isFavorite = Boolean(currentSavedRoute?.isFavorite);
  const isDraftSaved = Boolean(currentSavedRoute);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [mapFocusTarget, setMapFocusTarget] = useState<MapFocusTarget | null>(null);

  useEffect(() => {
    if (currentTelemetry.latitude !== 0 || currentTelemetry.longitude !== 0) {
      fetchNearestAirport(currentTelemetry.latitude, currentTelemetry.longitude);
    }
  }, [currentTelemetry.latitude, currentTelemetry.longitude, fetchNearestAirport]);

  const selectedProfile = AIRCRAFT_CATEGORIES[category];

  // Auto-generate an initial route on first mount
  useEffect(() => {
    if (!currentGeneratedRoute) {
      handleGenerateRoute();
    }
  }, []);

  const handleGenerateRoute = async () => {
    setIsGenerating(true);
    setGenerationError(null);

    try {
      if (areaType === 'polygon' && polygonCoords.length < 3) {
        throw new Error('Please click on the map to define at least 3 boundary vertices for your polygon, or click "Box Current View".');
      }

      const minRunwayFt = customMinRunway !== ''
        ? (runwayUnit === 'm' ? Math.round(Number(customMinRunway) * 3.28084) : Number(customMinRunway))
        : undefined;
      const maxRunwayFt = customMaxRunway !== ''
        ? (runwayUnit === 'm' ? Math.round(Number(customMaxRunway) * 3.28084) : Number(customMaxRunway))
        : undefined;

      const searchParams: RouteSearchParams = {
        category,
        airportType,
        runwaySurface,
        customMinRunwayFt: minRunwayFt && minRunwayFt > 0 ? minRunwayFt : undefined,
        customMaxRunwayFt: maxRunwayFt && maxRunwayFt > 0 ? maxRunwayFt : undefined,
        region,
        limitBy,
        limitScope,
        minLimitValue: limitBy !== 'none' ? minLimitValue : undefined,
        maxLimitValue: limitBy !== 'none' ? maxLimitValue : undefined,
        sectorCount,
        departureIcao: departureIcao.trim() || undefined,
        arrivalIcao: arrivalIcao.trim() || undefined,
        includeGroundTime,
        areaFilter: {
          type: areaType,
          circleCenter: areaType === 'circle' ? circleCenter : undefined,
          circleRadiusNm: areaType === 'circle' ? circleRadiusNm : undefined,
          polygonCoords: areaType === 'polygon' && polygonCoords.length >= 3 ? polygonCoords : undefined,
        },
      };

      const result = await generateRouteSuggestion(searchParams);
      setRoute(result);
      setCurrentGeneratedRoute(result);
      setDraftSavedNotice(false);

      // Only trigger a map auto-fit when a route is actually generated
      if (result && result.sectors.length > 0) {
        const coords: [number, number][] = [
          [result.sectors[0].departure.latitude, result.sectors[0].departure.longitude],
          ...result.sectors.map((s): [number, number] => [s.arrival.latitude, s.arrival.longitude]),
        ];
        if (coords.length > 1) {
          setMapFocusTarget({
            bounds: L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1]))),
            id: Date.now(),
          });
        }
      }
    } catch (err: any) {
      console.error('[NewRouteView] Route generation error:', err);
      setGenerationError(err?.message || 'Failed to generate route matching constraints. Try adjusting filters.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFocusRoute = () => {
    if (!route || route.sectors.length === 0) return;
    const coords: [number, number][] = [
      [route.sectors[0].departure.latitude, route.sectors[0].departure.longitude],
      ...route.sectors.map((s): [number, number] => [s.arrival.latitude, s.arrival.longitude]),
    ];
    if (coords.length > 1) {
      setMapFocusTarget({
        bounds: L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1]))),
        id: Date.now(),
      });
    }
  };

  const handleFocusArea = () => {
    if (areaType === 'circle') {
      setMapFocusTarget({
        center: circleCenter,
        zoom: 7,
        id: Date.now(),
      });
    } else if (areaType === 'polygon' && polygonCoords.length >= 2) {
      setMapFocusTarget({
        bounds: L.latLngBounds(polygonCoords.map((c) => L.latLng(c[0], c[1]))),
        id: Date.now(),
      });
    }
  };

  const handleSwapAirports = () => {
    const temp = departureIcao;
    setDepartureIcao(arrivalIcao);
    setArrivalIcao(temp);
  };

  const handleSetNearestDep = () => {
    if (nearestAirport) {
      setDepartureIcao(nearestAirport.icao);
    }
  };

  const handleCopyBriefing = () => {
    if (!route) return;
    const waypointsStr = [route.sectors[0].departure.icao, ...route.sectors.map((s) => s.arrival.icao)].join(' ➔ ');
    const briefing = `Apollo Flight Route Briefing:
Airframe: ${route.aircraftName} (Category ${route.aircraftCategory})
Routing: ${waypointsStr}
Sectors: ${route.sectors.length} (${route.isRoundTrip ? 'Round-Trip' : 'Direct/Multi-Hop'})
Total Distance: ${route.totalDistanceNm} NM
Airborne Duration: ${formatDurationHoursMinutes(route.totalAirborneMinutes)}
Total Duration: ${formatDurationHoursMinutes(route.totalDurationMinutes)} ${route.includeGroundTime ? '(Includes Taxi)' : '(Airborne Only)'}
Recommended Altitudes: ${route.sectors.map((s, i) => `Leg ${i + 1}: ${formatFlightLevelOrAltitude(s.cruiseAltitudeFt)} (${s.distanceNm} NM, MORA ${formatFlightLevelOrAltitude(s.corridorMsaFt || 0)}${s.isMountainous ? ' - Mountainous' : ''})`).join(' · ')}`;

    navigator.clipboard.writeText(briefing);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveDraft = async () => {
    if (!route || route.sectors.length === 0) return;
    const firstLeg = route.sectors[0];
    const finalLeg = route.sectors[route.sectors.length - 1];
    const intermediateIcaos = route.sectors.slice(0, -1).map((s) => s.arrival.icao);

    await saveRoute({
      id: route.id,
      name: `${firstLeg.departure.icao} ➔ ${finalLeg.arrival.icao}`,
      aircraftName: route.aircraftName,
      departureIcao: firstLeg.departure.icao,
      arrivalIcao: finalLeg.arrival.icao,
      intermediateIcaos: JSON.stringify(intermediateIcaos),
      sectorCount: route.sectors.length,
      aircraftCategory: route.aircraftCategory,
      sectorsJson: JSON.stringify(route.sectors),
      sectors: route.sectors,
      totalDistanceNm: route.totalDistanceNm,
      totalAirborneMinutes: route.totalAirborneMinutes,
      totalGroundMinutes: route.totalGroundMinutes,
      totalDurationMinutes: route.totalDurationMinutes,
      includeGroundTime: route.includeGroundTime,
      isRoundTrip: route.isRoundTrip,
      recommendedAltitudeFt: route.sectors[0]?.cruiseAltitudeFt || null,
      status: 'draft',
      isFavorite: isFavorite,
    });

    setDraftSavedNotice(true);
    setTimeout(() => setDraftSavedNotice(false), 2000);
  };

  const handleSaveFavorite = async () => {
    if (!route || route.sectors.length === 0) return;
    const firstLeg = route.sectors[0];
    const finalLeg = route.sectors[route.sectors.length - 1];
    const intermediateIcaos = route.sectors.slice(0, -1).map((s) => s.arrival.icao);

    const nextFav = !isFavorite;
    await saveRoute({
      id: route.id,
      name: `${firstLeg.departure.icao} ➔ ${finalLeg.arrival.icao}`,
      aircraftName: route.aircraftName,
      departureIcao: firstLeg.departure.icao,
      arrivalIcao: finalLeg.arrival.icao,
      intermediateIcaos: JSON.stringify(intermediateIcaos),
      sectorCount: route.sectors.length,
      aircraftCategory: route.aircraftCategory,
      sectorsJson: JSON.stringify(route.sectors),
      sectors: route.sectors,
      totalDistanceNm: route.totalDistanceNm,
      totalAirborneMinutes: route.totalAirborneMinutes,
      totalGroundMinutes: route.totalGroundMinutes,
      totalDurationMinutes: route.totalDurationMinutes,
      includeGroundTime: route.includeGroundTime,
      isRoundTrip: route.isRoundTrip,
      recommendedAltitudeFt: route.sectors[0]?.cruiseAltitudeFt || null,
      status: 'draft',
      isFavorite: nextFav,
    });
  };

  const handleFlyRoute = () => {
    if (!route || route.sectors.length === 0) return;
    const firstLeg = route.sectors[0];
    const finalLeg = route.sectors[route.sectors.length - 1];
    startManualFlight(firstLeg.departure.icao, finalLeg.arrival.icao, route.aircraftName);
    setActiveView('dashboard');
  };

  // Build map coordinates and bounds
  const mapCoordinates: [number, number][] = route
    ? [
        [route.sectors[0].departure.latitude, route.sectors[0].departure.longitude],
        ...route.sectors.map((s): [number, number] => [s.arrival.latitude, s.arrival.longitude]),
      ]
    : areaType === 'polygon' && polygonCoords.length > 0
    ? polygonCoords
    : [circleCenter];


  // Category suitability safeguard checks
  const isLocalAirportRestricted = ['C', 'D', 'E', 'F'].includes(category);
  const finalLeg = route && route.sectors.length > 0 ? route.sectors[route.sectors.length - 1] : null;
  const initialDep = route && route.sectors.length > 0 ? route.sectors[0].departure : null;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 dark:border-geist-hairline gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-sm bg-blue-50 dark:bg-[#0c182b] border border-blue-200 dark:border-blue-900/50 text-blue-600 dark:text-blue-400">
            <Route className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
              Route Generator & Flight Suggester
            </h1>
            <p className="text-xs text-neutral-500 dark:text-geist-muted">
              Discover tailored IFR and VFR flight routes based on aircraft category performance, sector duration, and aerodrome suitability.
            </p>
          </div>
        </div>

        <button
          onClick={handleGenerateRoute}
          disabled={isGenerating}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-xs font-semibold bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors disabled:opacity-50 shadow-sm shrink-0"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Generating...' : 'Generate New Route'}</span>
        </button>
      </div>

      {generationError && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 p-3 rounded-sm text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{generationError}</span>
        </div>
      )}

      {/* Main Grid: Form Left, Results & Map Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: Route Configuration Form (lg:col-span-4) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 pb-2.5 border-b border-neutral-200 dark:border-geist-hairline">
              <Sliders className="w-4 h-4 text-neutral-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Route Search Filters
              </h2>
            </div>

            {/* 1. Aircraft Category (A to F with examples) */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                1. Aircraft Category & Airframe
              </label>
              <Select
                value={category}
                onChange={(newCat) => {
                  setCategory(newCat as AircraftCategory);
                  // Auto-adjust airport type if local was selected on heavy
                  if (['C', 'D', 'E', 'F'].includes(newCat) && airportType === 'small_airport') {
                    setAirportType('all');
                  }
                }}
                options={(Object.keys(AIRCRAFT_CATEGORIES) as AircraftCategory[]).map((cat) => {
                  const prof = AIRCRAFT_CATEGORIES[cat];
                  return {
                    value: cat,
                    label: `Cat ${cat} - ${prof.examples.slice(0, 3).join(', ')}`,
                  };
                })}
                className="w-full"
                triggerClassName="bg-neutral-50 dark:bg-black"
              />
              <div className="p-2 rounded bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline text-[11px] text-neutral-600 dark:text-neutral-400 space-y-0.5">
                <div className="flex justify-between font-mono">
                  <span>Cruise TAS: {selectedProfile.cruiseSpeedTasKt} kt</span>
                  <span>Typical Level: {formatFlightLevelOrAltitude(selectedProfile.typicalCruiseAltFt)}</span>
                </div>
                <div className="text-[10px] text-neutral-500 truncate" title={selectedProfile.examples.join(', ')}>
                  Examples: {selectedProfile.examples.join(', ')}
                </div>
              </div>
            </div>

            {/* 2. Airport Type Filter */}
            <div className="space-y-1.5 pt-2 border-t border-neutral-200 dark:border-geist-hairline">
              <button
                type="button"
                onClick={() => toggleSection('airportType')}
                className="w-full flex items-center justify-between text-left group cursor-pointer select-none py-0.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                    2. Airport Type (Optional)
                  </span>
                  {isLocalAirportRestricted && airportType === 'small_airport' && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                      (Restricted)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {collapsedSections.airportType && (
                    <span className="text-[10px] font-mono text-neutral-500 capitalize">
                      {airportType === 'all' ? 'All' : airportType.replace('_', ' ')}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-transform duration-200 ${
                      collapsedSections.airportType ? '-rotate-90' : ''
                    }`}
                  />
                </div>
              </button>

              <div
                className={`collapse-accordion ${
                  collapsedSections.airportType ? 'collapse-accordion-closed' : 'collapse-accordion-open'
                }`}
              >
                <div className="collapse-accordion-inner">
                  <div className="space-y-1.5 pt-1">
                    <Select
                      value={airportType}
                      onChange={(val) => setAirportType(val as AirportTypePreference)}
                      options={[
                        { value: 'all', label: 'All Compatible Types (Category Recommended)' },
                        { value: 'large_airport', label: 'International Hubs (Large Aerodromes)' },
                        {
                          value: 'medium_airport',
                          label: `Regional Airports (Medium Aerodromes)${['D', 'E', 'F'].includes(category) ? ' — Incompatible' : ''}`,
                          disabled: category === 'D' || category === 'E' || category === 'F',
                        },
                        {
                          value: 'small_airport',
                          label: `Local / General Aviation Airports${isLocalAirportRestricted ? ' — Restricted for Transport Airframes' : ''}`,
                          disabled: isLocalAirportRestricted,
                        },
                      ]}
                      className="w-full"
                      triggerClassName="bg-neutral-50 dark:bg-black"
                    />
                    {isLocalAirportRestricted && (
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">Runway Guard:</span> Small unpaved / local airfields are excluded for Cat {category} airframes to ensure adequate runway length and pavement strength.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Runway Surface & Length Filter */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-geist-hairline">
              <button
                type="button"
                onClick={() => toggleSection('runway')}
                className="w-full flex items-center justify-between text-left group cursor-pointer select-none py-0.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                    3. Runway Surface & Length
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                    Req: ≥ {runwayUnit === 'm' ? Math.round(selectedProfile.minRunwayFt * 0.3048).toLocaleString() : selectedProfile.minRunwayFt.toLocaleString()} {runwayUnit}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-transform duration-200 ${
                      collapsedSections.runway ? '-rotate-90' : ''
                    }`}
                  />
                </div>
              </button>

              <div
                className={`collapse-accordion ${
                  collapsedSections.runway ? 'collapse-accordion-closed' : 'collapse-accordion-open'
                }`}
              >
                <div className="collapse-accordion-inner">
                  <div className="space-y-2.5 pt-1">
                    {/* Surface toggle buttons & Unit switch */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                        Surface Requirement
                      </span>
                      {/* Unit Switcher: FT / M */}
                      <div className="flex items-center p-0.5 bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 text-[10px] font-mono">
                        <button
                          type="button"
                          onClick={() => handleToggleRunwayUnit('ft')}
                          className={`px-2 py-0.5 rounded transition-colors ${
                            runwayUnit === 'ft'
                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold shadow-xs'
                              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                          }`}
                        >
                          FT
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleRunwayUnit('m')}
                          className={`px-2 py-0.5 rounded transition-colors ${
                            runwayUnit === 'm'
                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold shadow-xs'
                              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                          }`}
                        >
                          M
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { value: 'any', label: 'Any Surface' },
                        { value: 'paved', label: 'Paved Only' },
                        { value: 'unpaved', label: 'Unpaved Only' },
                      ].map((s) => {
                        const isUnpavedRestricted = s.value === 'unpaved' && ['C', 'D', 'E', 'F'].includes(category);
                        return (
                          <button
                            key={s.value}
                            type="button"
                            disabled={isUnpavedRestricted}
                            onClick={() => setRunwaySurface(s.value as RunwaySurfacePreference)}
                            title={isUnpavedRestricted ? `Unpaved runways incompatible with Category ${category}` : undefined}
                            className={`h-7 rounded-sm text-[11px] font-medium border transition-colors ${
                              runwaySurface === s.value
                                ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white'
                                : isUnpavedRestricted
                                ? 'bg-neutral-100 dark:bg-neutral-900/40 text-neutral-400 dark:text-neutral-600 border-neutral-200 dark:border-neutral-800 cursor-not-allowed'
                                : 'bg-neutral-50 dark:bg-geist-card text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100'
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Runway Length: Min & Max side-by-side (both optional) */}
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <label className="block text-[10px] text-neutral-600 dark:text-neutral-400">
                            Min Length ({runwayUnit})
                          </label>
                          <span className="text-[9px] text-neutral-400">Optional</span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={runwayUnit === 'm' ? 50 : 100}
                          value={customMinRunway}
                          onChange={(e) => setCustomMinRunway(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                          placeholder={`Req: ${runwayUnit === 'm' ? Math.round(selectedProfile.minRunwayFt * 0.3048).toLocaleString() : selectedProfile.minRunwayFt.toLocaleString()}`}
                          className="w-full h-7 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-geist-hairline rounded-sm px-2 text-xs font-mono text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <label className="block text-[10px] text-neutral-600 dark:text-neutral-400">
                            Max Length ({runwayUnit})
                          </label>
                          <span className="text-[9px] text-neutral-400">Optional</span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={runwayUnit === 'm' ? 50 : 100}
                          value={customMaxRunway}
                          onChange={(e) => setCustomMaxRunway(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                          placeholder="No max limit"
                          className="w-full h-7 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-geist-hairline rounded-sm px-2 text-xs font-mono text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-neutral-400 dark:text-geist-muted leading-tight">
                      Verified via OurAirports runway dataset. Aerodromes with all runways closed are automatically excluded.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Region or Country (Area Filter) */}
            <div className="space-y-1.5 pt-2 border-t border-neutral-200 dark:border-geist-hairline">
              <button
                type="button"
                onClick={() => toggleSection('region')}
                className="w-full flex items-center justify-between text-left group cursor-pointer select-none py-0.5"
              >
                <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  4. Region or Country (Area Filter)
                </span>
                <div className="flex items-center gap-1.5">
                  {collapsedSections.region && (
                    <span className="text-[10px] font-mono text-neutral-500 capitalize">
                      {areaType === 'preset'
                        ? (region === 'random' ? 'Any Region' : region)
                        : areaType === 'circle'
                        ? `Circle (${circleRadiusNm} NM)`
                        : `Polygon (${polygonCoords.length} pts)`}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-transform duration-200 ${
                      collapsedSections.region ? '-rotate-90' : ''
                    }`}
                  />
                </div>
              </button>

              <div
                className={`collapse-accordion ${
                  collapsedSections.region ? 'collapse-accordion-closed' : 'collapse-accordion-open'
                }`}
              >
                <div className="collapse-accordion-inner">
                  <div className="space-y-2.5 pt-1">
                    {/* Area Type Segmented Switcher */}
                    <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-[#141414] p-0.5 rounded-sm border border-neutral-200 dark:border-geist-hairline">
                      <button
                        type="button"
                        onClick={() => handleSelectAreaType('preset')}
                        className={`flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium rounded-sm transition-colors ${
                          areaType === 'preset'
                            ? 'bg-white dark:bg-geist-surface text-neutral-900 dark:text-white shadow-sm font-semibold'
                            : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300'
                        }`}
                      >
                        <Globe2 className="w-3 h-3" />
                        <span>Preset</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAreaType('circle')}
                        className={`flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium rounded-sm transition-colors ${
                          areaType === 'circle'
                            ? 'bg-sky-600 text-white shadow-sm font-semibold'
                            : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300'
                        }`}
                      >
                        <CircleDot className="w-3 h-3" />
                        <span>Circle</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAreaType('polygon')}
                        className={`flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium rounded-sm transition-colors ${
                          areaType === 'polygon'
                            ? 'bg-purple-600 text-white shadow-sm font-semibold'
                            : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300'
                        }`}
                      >
                        <Scan className="w-3 h-3" />
                        <span>Polygon</span>
                      </button>
                    </div>

                    {/* Preset Region Dropdown */}
                    {areaType === 'preset' && (
                      <div className="space-y-1">
                        <Select
                          value={region}
                          onChange={(val) => setRegion(String(val))}
                          groups={[
                            {
                              label: 'Continents & Global',
                              options: CONTINENT_OPTIONS.map((c) => ({
                                value: c.value,
                                label: c.label,
                              })),
                            },
                            {
                              label: 'Prominent Countries',
                              options: POPULAR_COUNTRIES.map((ctry) => ({
                                value: ctry.value,
                                label: `${ctry.label} (${ctry.value})`,
                              })),
                            },
                          ]}
                          className="w-full"
                          triggerClassName="bg-neutral-50 dark:bg-black"
                        />
                        <p className="text-[10px] text-neutral-400 dark:text-geist-muted">
                          Searches airfields across standard continental airspace or national boundaries.
                        </p>
                      </div>
                    )}

                    {/* Circle Area Controls */}
                    {areaType === 'circle' && (
                      <div className="space-y-2 p-2 rounded bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/50">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-sky-900 dark:text-sky-200">
                            Circle Radius:
                          </span>
                          <span className="font-mono font-bold text-sky-700 dark:text-sky-300">
                            {circleRadiusNm} NM ({Math.round(circleRadiusNm * 1.852)} km)
                          </span>
                        </div>

                        {/* Radius Slider */}
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={20}
                            max={600}
                            step={10}
                            value={circleRadiusNm}
                            onChange={(e) => setCircleRadiusNm(Number(e.target.value))}
                            className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-sky-600"
                          />
                        </div>

                        {/* Quick Radius Presets */}
                        <div className="flex items-center gap-1.5 text-[10px] font-mono">
                          <span className="text-neutral-500">Presets:</span>
                          {[50, 100, 150, 250, 400].map((nm) => (
                            <button
                              key={nm}
                              type="button"
                              onClick={() => setCircleRadiusNm(nm)}
                              className={`px-1.5 py-0.5 rounded border transition-colors ${
                                circleRadiusNm === nm
                                  ? 'bg-sky-600 text-white border-sky-600 font-semibold'
                                  : 'bg-white dark:bg-black text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:border-sky-400'
                              }`}
                            >
                              {nm} NM
                            </button>
                          ))}
                        </div>

                        {/* Center Point Info & Actions */}
                        <div className="pt-1.5 border-t border-sky-200/60 dark:border-sky-900/40 flex items-center justify-between text-[10px]">
                          <div className="font-mono text-neutral-600 dark:text-neutral-300 truncate">
                            Center: {circleCenter[0].toFixed(2)}°, {circleCenter[1].toFixed(2)}°
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setCircleCenter(mapViewportRef.current.center)}
                              className="text-sky-700 dark:text-sky-400 font-medium hover:underline flex items-center gap-1"
                              title="Center circle on your current map view"
                            >
                              <Scan className="w-3 h-3" />
                              <span>Center on View</span>
                            </button>
                            {(nearestAirport || currentTelemetry.latitude !== 0) && (
                              <button
                                type="button"
                                onClick={handleCenterCircleOnTelemetry}
                                className="text-sky-700 dark:text-sky-400 font-medium hover:underline flex items-center gap-1"
                              >
                                <Crosshair className="w-3 h-3" />
                                <span>GPS</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-[10px] text-sky-800 dark:text-sky-300 leading-tight">
                          💡 <strong>Click map or drag center marker</strong> to reposition circle area.
                        </p>
                      </div>
                    )}

                    {/* Polygon Area Controls */}
                    {areaType === 'polygon' && (
                      <div className="space-y-2 p-2 rounded bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-purple-900 dark:text-purple-200">
                            Custom Polygon Boundary:
                          </span>
                          <span className={`font-mono text-[10px] font-semibold ${
                            polygonCoords.length >= 3 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                          }`}>
                            {polygonCoords.length} {polygonCoords.length === 1 ? 'vertex' : 'vertices'} {polygonCoords.length < 3 ? '(min 3)' : '✓ Ready'}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleQuickBoxPolygon}
                            className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded bg-white dark:bg-black text-[11px] font-medium border border-neutral-200 dark:border-neutral-800 hover:border-purple-400 text-neutral-700 dark:text-neutral-300 transition-colors"
                          >
                            <Scan className="w-3 h-3 text-purple-600" />
                            <span>Box Region</span>
                          </button>
                          <button
                            type="button"
                            disabled={polygonCoords.length === 0}
                            onClick={() => setPolygonCoords((prev) => prev.slice(0, -1))}
                            className="flex items-center justify-center gap-1 py-1 px-2 rounded bg-white dark:bg-black text-[11px] font-medium border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 text-neutral-600 dark:text-neutral-400 transition-colors disabled:opacity-40"
                            title="Undo last added vertex"
                          >
                            <Undo2 className="w-3 h-3" />
                            <span>Undo</span>
                          </button>
                          <button
                            type="button"
                            disabled={polygonCoords.length === 0}
                            onClick={() => setPolygonCoords([])}
                            className="flex items-center justify-center gap-1 py-1 px-2 rounded bg-white dark:bg-black text-[11px] font-medium border border-neutral-200 dark:border-neutral-800 hover:border-red-400 text-red-600 dark:text-red-400 transition-colors disabled:opacity-40"
                            title="Clear all vertices"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Clear</span>
                          </button>
                        </div>

                        <p className="text-[10px] text-purple-800 dark:text-purple-300 leading-tight">
                          💡 <strong>Click or drag border</strong> to add a vertex · <strong>Drag</strong> to move · <strong>Right-click</strong> vertex to delete.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Limit Route By & Sectors */}
            <div className="space-y-2.5 pt-2 border-t border-neutral-200 dark:border-geist-hairline">
              <button
                type="button"
                onClick={() => toggleSection('limitations')}
                className="w-full flex items-center justify-between text-left group cursor-pointer select-none py-0.5"
              >
                <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  5. Route Limitation & Sectors
                </span>
                <div className="flex items-center gap-1.5">
                  {collapsedSections.limitations && (
                    <span className="text-[10px] font-mono text-neutral-500">
                      {sectorCount === -1 ? 'Round-Trip' : `${sectorCount} Leg`} · {limitBy === 'none' ? 'No limit' : `${limitBy} (${limitScope})`}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-transform duration-200 ${
                      collapsedSections.limitations ? '-rotate-90' : ''
                    }`}
                  />
                </div>
              </button>

              <div
                className={`collapse-accordion ${
                  collapsedSections.limitations ? 'collapse-accordion-closed' : 'collapse-accordion-open'
                }`}
              >
                <div className="collapse-accordion-inner">
                  <div className="space-y-2.5 pt-1">
                    {/* Number of sectors */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { value: 1, label: '1 Sector' },
                        { value: 2, label: '2 Sectors' },
                        { value: 3, label: '3 Sectors' },
                        { value: -1, label: 'Round-Trip' },
                      ].map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setSectorCount(s.value)}
                          className={`h-7 rounded-sm text-[11px] font-medium border transition-colors ${
                            sectorCount === s.value
                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white'
                              : 'bg-neutral-50 dark:bg-geist-card text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>

                    {/* Limit Type Selector */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      {[
                        { id: 'none', label: 'No Limit' },
                        { id: 'time', label: 'By Duration' },
                        { id: 'distance', label: 'By Distance' },
                      ].map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setLimitBy(l.id as RouteLimitType)}
                          className={`h-7 rounded-sm text-[11px] font-medium border transition-colors ${
                            limitBy === l.id
                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white'
                              : 'bg-neutral-50 dark:bg-geist-card text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100'
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>

                    {/* Limit Scope Switcher (Total Whole Flight vs Per Sector) */}
                    {limitBy !== 'none' && (
                      <div className="flex items-center justify-between p-1.5 bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline rounded-sm">
                        <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                          Apply Limitation To:
                        </span>
                        <div className="flex items-center p-0.5 bg-neutral-200/60 dark:bg-neutral-800 rounded text-[10px] font-mono">
                          <button
                            type="button"
                            onClick={() => setLimitScope('total')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              limitScope === 'total'
                                ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold shadow-xs'
                                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                            }`}
                          >
                            Total Flight
                          </button>
                          <button
                            type="button"
                            onClick={() => setLimitScope('sector')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              limitScope === 'sector'
                                ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold shadow-xs'
                                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                            }`}
                          >
                            Per Sector
                          </button>
                        </div>
                      </div>
                    )}

                    {limitBy === 'time' && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-[10px] text-neutral-500 mb-0.5">
                            Min Flight Time ({limitScope === 'total' ? 'Total' : 'Per Leg'})
                          </label>
                          <Select
                            value={minLimitValue}
                            onChange={(val) => setMinLimitValue(Number(val))}
                            options={[
                              { value: 15, label: '15 min' },
                              { value: 30, label: '30 min' },
                              { value: 45, label: '45 min' },
                              { value: 60, label: '1h 00m' },
                              { value: 90, label: '1h 30m' },
                              { value: 120, label: '2h 00m' },
                              { value: 180, label: '3h 00m' },
                              { value: 240, label: '4h 00m' },
                            ]}
                            className="w-full"
                            triggerClassName="h-7 text-xs bg-neutral-50 dark:bg-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-500 mb-0.5">
                            Max Flight Time ({limitScope === 'total' ? 'Total' : 'Per Leg'})
                          </label>
                          <Select
                            value={maxLimitValue}
                            onChange={(val) => setMaxLimitValue(Number(val))}
                            options={[
                              { value: 30, label: '30 min' },
                              { value: 45, label: '45 min' },
                              { value: 60, label: '1h 00m' },
                              { value: 90, label: '1h 30m' },
                              { value: 120, label: '2h 00m' },
                              { value: 180, label: '3h 00m' },
                              { value: 240, label: '4h 00m' },
                              { value: 360, label: '6h 00m' },
                              { value: 480, label: '8h 00m' },
                            ]}
                            className="w-full"
                            triggerClassName="h-7 text-xs bg-neutral-50 dark:bg-black"
                          />
                        </div>
                      </div>
                    )}

                    {limitBy === 'distance' && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-[10px] text-neutral-500 mb-0.5">
                            Min Distance NM ({limitScope === 'total' ? 'Total' : 'Per Leg'})
                          </label>
                          <input
                            type="number"
                            value={minLimitValue}
                            onChange={(e) => setMinLimitValue(Number(e.target.value))}
                            step={25}
                            min={15}
                            className="w-full h-7 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-geist-hairline rounded-sm px-2 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-500 mb-0.5">
                            Max Distance NM ({limitScope === 'total' ? 'Total' : 'Per Leg'})
                          </label>
                          <input
                            type="number"
                            value={maxLimitValue}
                            onChange={(e) => setMaxLimitValue(Number(e.target.value))}
                            step={50}
                            min={30}
                            className="w-full h-7 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-geist-hairline rounded-sm px-2 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 6. Fixed / Optional Departure & Arrival */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-geist-hairline">
              <button
                type="button"
                onClick={() => toggleSection('fixedAerodromes')}
                className="w-full flex items-center justify-between text-left group cursor-pointer select-none py-0.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                    6. Fixed Aerodromes (ICAO Only)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {collapsedSections.fixedAerodromes && (
                    <span className="text-[10px] font-mono text-neutral-500">
                      {departureIcao || arrivalIcao ? `${departureIcao || 'Any'} ➔ ${arrivalIcao || 'Any'}` : 'Random / Any'}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-transform duration-200 ${
                      collapsedSections.fixedAerodromes ? '-rotate-90' : ''
                    }`}
                  />
                </div>
              </button>

              <div
                className={`collapse-accordion ${
                  collapsedSections.fixedAerodromes ? 'collapse-accordion-closed' : 'collapse-accordion-open'
                }`}
              >
                <div className="collapse-accordion-inner">
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                        Leave empty for procedural route generation
                      </span>
                      {nearestAirport && (
                        <button
                          type="button"
                          onClick={handleSetNearestDep}
                          className="text-[10px] font-mono text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Nearest ({nearestAirport.icao})
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          type="text"
                          maxLength={4}
                          value={departureIcao}
                          onChange={(e) => setDepartureIcao(e.target.value.toUpperCase())}
                          placeholder="Dep ICAO (e.g. LOWI)"
                          className="w-full h-8 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-geist-hairline rounded-sm px-2.5 text-xs font-mono uppercase text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleSwapAirports}
                        title="Swap Departure and Destination"
                        className="p-1.5 rounded-sm hover:bg-neutral-100 dark:hover:bg-[#222] border border-neutral-200 dark:border-geist-hairline text-neutral-500 transition-colors"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex-1">
                        <input
                          type="text"
                          maxLength={4}
                          value={arrivalIcao}
                          onChange={(e) => setArrivalIcao(e.target.value.toUpperCase())}
                          placeholder="Arr ICAO (e.g. EDDM)"
                          className="w-full h-8 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-geist-hairline rounded-sm px-2.5 text-xs font-mono uppercase text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-neutral-400 dark:text-geist-muted">
                      Standard 4-letter ICAO designators only. Local non-ICAO codes (e.g. PT-02313) and helipads are excluded.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 7. Ground Time Calculation Option */}
            <div className="pt-2 border-t border-neutral-200 dark:border-geist-hairline">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeGroundTime}
                  onChange={(e) => setIncludeGroundTime(e.target.checked)}
                  className="rounded border-neutral-300 dark:border-neutral-700 text-neutral-900 focus:ring-0"
                />
                <span className="text-xs text-neutral-700 dark:text-neutral-300 font-medium">
                  Include Ground / Taxi Time in Total Duration
                </span>
              </label>
              <p className="text-[10px] text-neutral-400 dark:text-geist-muted mt-1 pl-5 leading-normal">
                Accounts for realistic airport taxi-out ({selectedProfile.taxiOutMinutes}m) and taxi-in ({selectedProfile.taxiInMinutes}m) per sector.
              </p>
            </div>

            <button
              onClick={handleGenerateRoute}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-sm text-xs font-semibold bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors shadow-sm disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Computing Optimal Route...' : 'Find New Route'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Route Map & Sector Breakdown Deck (lg:col-span-8) */}
        <div className="lg:col-span-8 space-y-4">
          
          {generationError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-sm text-xs text-red-700 dark:text-red-300 flex items-start gap-2 shadow-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">Route Generation Notice:</strong> {generationError}
              </div>
            </div>
          )}

          {route ? (
            <>
              {/* Route Summary Ribbon */}
              <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-geist-muted">
                      Suggested Route:
                    </span>
                    <span className="text-sm font-bold font-mono text-neutral-900 dark:text-white">
                      {[route.sectors[0].departure.icao, ...route.sectors.map((s) => s.arrival.icao)].join(' ➔ ')}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-mono">
                      Cat {route.aircraftCategory}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-geist-muted">
                    {route.sectors.length} {route.sectors.length === 1 ? 'Sector' : 'Sectors'} · {route.aircraftName} · {route.isRoundTrip ? 'Round-Trip' : 'Point-to-Point'}
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-2 self-stretch sm:self-center">
                  <button
                    onClick={handleCopyBriefing}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium border transition-colors ${
                      copied
                        ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-600 dark:border-emerald-600'
                        : 'border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-200'
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={handleSaveDraft}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium border transition-colors ${
                      isDraftSaved || draftSavedNotice
                        ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-600 dark:border-emerald-600'
                        : 'border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-200'
                    }`}
                  >
                    {isDraftSaved || draftSavedNotice ? <Check className="w-3.5 h-3.5 text-white" /> : <Bookmark className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />}
                    <span>{draftSavedNotice ? 'Draft Saved' : isDraftSaved ? 'Saved in Routes' : 'Draft'}</span>
                  </button>

                  <button
                    onClick={handleSaveFavorite}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-sm text-xs font-medium border transition-colors ${
                      isFavorite
                        ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-600 dark:border-emerald-600'
                        : 'border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-200'
                    }`}
                  >
                    {isFavorite ? (
                      <Check className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20" />
                    )}
                    <span>{isFavorite ? 'Favorited' : 'Favorite'}</span>
                  </button>
                </div>
              </div>

              {/* Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                  <div className="flex items-center justify-between text-neutral-500 text-[10px] font-medium mb-0.5">
                    <span>Total Distance</span>
                    <Milestone className="w-3 h-3 text-neutral-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                    {route.totalDistanceNm} <span className="text-xs font-normal text-neutral-500">NM</span>
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">
                    {Math.round(route.totalDistanceNm * 1.852)} km
                  </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                  <div className="flex items-center justify-between text-neutral-500 text-[10px] font-medium mb-0.5">
                    <span>Airborne Flight Time</span>
                    <Clock className="w-3 h-3 text-neutral-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                    {formatDurationHoursMinutes(route.totalAirborneMinutes)}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">
                    Pure flight time
                  </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                  <div className="flex items-center justify-between text-neutral-500 text-[10px] font-medium mb-0.5">
                    <span>Total Block Time</span>
                    <Gauge className="w-3 h-3 text-neutral-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                    {formatDurationHoursMinutes(route.totalDurationMinutes)}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">
                    {route.includeGroundTime ? `Includes ${route.totalGroundMinutes}m taxi` : 'Taxi excluded'}
                  </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                  <div className="flex items-center justify-between text-neutral-500 text-[10px] font-medium mb-0.5">
                    <span>Max Cruise Level</span>
                    <Plane className="w-3 h-3 text-neutral-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                    {formatFlightLevelOrAltitude(Math.max(...route.sectors.map((s) => s.cruiseAltitudeFt)))}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">
                    Speed: {route.sectors[0].cruiseSpeedKt} kt TAS
                  </div>
                </div>
              </div>

              {/* Interactive Route Map */}
              <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-1 shadow-sm overflow-hidden space-y-1">
                {areaType !== 'preset' && (
                  <div className="px-2 py-1 text-[11px] flex items-center justify-between text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-geist-hairline rounded-t-sm">
                    <div className="flex items-center gap-1.5 font-medium">
                      {areaType === 'circle' ? (
                        <>
                          <CircleDot className="w-3.5 h-3.5 text-sky-600" />
                          <span>Circle Area Active: {circleRadiusNm} NM radius</span>
                        </>
                      ) : (
                        <>
                          <Scan className="w-3.5 h-3.5 text-purple-600" />
                          <span>Polygon Area Active: {polygonCoords.length} vertices</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-400">
                        {areaType === 'circle' ? 'Click map to reposition center' : 'Click map to add boundary points'}
                      </span>
                      {route && (
                        <button
                          type="button"
                          onClick={handleFocusRoute}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
                          title="Recenter map on current route"
                        >
                          Focus Route
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleFocusArea}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
                        title="Recenter map on search area"
                      >
                        Focus Area
                      </button>
                    </div>
                  </div>
                )}
                <div className="h-[360px] w-full rounded-sm overflow-hidden relative z-0">
                  <MapContainer
                    center={mapCoordinates[0] || [47.26, 11.34]}
                    zoom={6}
                    style={{ height: '100%', width: '100%' }}
                    className={theme === 'dark' ? 'dark-tiles' : ''}
                  >
                    <MapController focusTarget={mapFocusTarget} />
                    <MapViewportTracker onViewportChange={handleViewportChange} />
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Area Click Handler */}
                    <MapAreaClickHandler areaType={areaType} onMapClick={handleMapClick} />

                    {/* Area Filter Overlay: Circle */}
                    {areaType === 'circle' && circleCenter && (
                      <>
                        <Circle
                          center={circleCenter}
                          radius={circleRadiusNm * 1852}
                          pathOptions={{
                            color: '#0284c7',
                            fillColor: '#38bdf8',
                            fillOpacity: 0.12,
                            weight: 2,
                            dashArray: '5, 5',
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
                                <div>Radius: {circleRadiusNm} NM ({Math.round(circleRadiusNm * 1.852)} km)</div>
                                <div className="text-[10px] text-neutral-400">Drag marker to move circle center</div>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                      </>
                    )}

                    {areaType === 'polygon' && (
                      <>
                        {polygonCoords.length >= 3 ? (
                          <Polygon
                            positions={polygonCoords}
                            pathOptions={{
                              color: '#7c3aed',
                              fillColor: '#a855f7',
                              fillOpacity: 0.12,
                              weight: 2,
                              dashArray: '5, 5',
                            }}
                          />
                        ) : polygonCoords.length === 2 ? (
                          <Polyline
                            positions={polygonCoords}
                            color="#7c3aed"
                            weight={2}
                            dashArray="5, 5"
                          />
                        ) : null}

                        {/* Interactive border hit-area to insert new vertex on click */}
                        {polygonCoords.length >= 2 && (
                          <Polyline
                            positions={polygonCoords.length >= 3 ? [...polygonCoords, polygonCoords[0]] : polygonCoords}
                            pathOptions={{
                              color: '#7c3aed',
                              weight: 16,
                              opacity: 0.001,
                              lineCap: 'round',
                              lineJoin: 'round',
                            }}
                            eventHandlers={{
                              click: (e) => {
                                if (e.originalEvent) {
                                  e.originalEvent.stopPropagation();
                                }
                                handleInsertPolygonVertexOnBorder(e.latlng.lat, e.latlng.lng);
                              },
                            }}
                          />
                        )}

                        {/* Midpoint '+' handles to drag or click to split segment */}
                        {polygonCoords.length >= 2 &&
                          polygonCoords.map((coord, idx) => {
                            const isClosed = polygonCoords.length >= 3;
                            if (!isClosed && idx === polygonCoords.length - 1) return null;
                            const nextCoord = polygonCoords[(idx + 1) % polygonCoords.length];
                            const midLat = (coord[0] + nextCoord[0]) / 2;
                            const midLon = (coord[1] + nextCoord[1]) / 2;

                            return (
                              <Marker
                                key={`route-midpoint-${idx}`}
                                position={[midLat, midLon]}
                                draggable={true}
                                eventHandlers={{
                                  dragend: (e) => {
                                    const marker = e.target;
                                    const pos = marker.getLatLng();
                                    handleInsertVertexAtIndex(idx + 1, pos.lat, pos.lng);
                                  },
                                  click: (e) => {
                                    if (e.originalEvent) {
                                      e.originalEvent.stopPropagation();
                                    }
                                    handleInsertVertexAtIndex(idx + 1, midLat, midLon);
                                  },
                                }}
                                icon={createMidpointMarkerIcon()}
                              >
                                <Popup>
                                  <div className="text-xs space-y-0.5">
                                    <strong className="text-purple-600 block">Border Segment Handle</strong>
                                    <div className="text-[10px] text-neutral-400">Drag or click to insert a vertex here</div>
                                  </div>
                                </Popup>
                              </Marker>
                            );
                          })}

                        {polygonCoords.map((coord, idx) => (
                          <Marker
                            key={`route-poly-vertex-${idx}`}
                            position={coord}
                            draggable={true}
                            eventHandlers={{
                              dragend: (e) => {
                                const marker = e.target;
                                const pos = marker.getLatLng();
                                handleUpdatePolygonVertex(idx, pos.lat, pos.lng);
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
                                  <span>Delete vertex #{idx + 1}</span>
                                </button>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                      </>
                    )}

                    {/* Sector Polylines */}
                    {route.sectors.map((sector, idx) => {
                      const positions: [number, number][] = [
                        [sector.departure.latitude, sector.departure.longitude],
                        [sector.arrival.latitude, sector.arrival.longitude],
                      ];
                      const colors = ['#0070f3', '#10b981', '#f59e0b', '#ec4899'];
                      const legColor = colors[idx % colors.length];

                      return (
                        <Polyline
                          key={`leg-${idx}`}
                          positions={positions}
                          color={legColor}
                          weight={4}
                          opacity={0.85}
                          dashArray={route.isRoundTrip && idx === 1 ? '6, 6' : undefined}
                        />
                      );
                    })}

                    {/* Departure Airport Marker */}
                    {initialDep && (
                      <Marker
                        position={[initialDep.latitude, initialDep.longitude]}
                        icon={createAirportMarkerIcon(initialDep.icao, 'dep')}
                      >
                        <Popup>
                          <div className="text-xs space-y-1">
                            <strong className="text-emerald-600 block text-sm">
                              Departure: {initialDep.icao}
                            </strong>
                            <div>{initialDep.name}</div>
                            <div className="text-neutral-500">
                              {initialDep.countryName} · Elev. {initialDep.elevationFt || 0} ft
                            </div>
                            <div className="text-[10px] text-neutral-400 font-mono">
                              Type: {initialDep.airportType || 'Airport'}
                            </div>
                            {initialDep.maxRunwayLengthFt && (
                              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                                Longest Runway: {initialDep.maxRunwayLengthFt.toLocaleString()} ft ({initialDep.hasPaved ? 'Paved' : initialDep.hasUnpaved ? 'Unpaved' : 'Standard'})
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    )}

                    {/* Intermediate Waypoint Markers */}
                    {route.sectors.slice(0, -1).map((s, idx) => (
                      <Marker
                        key={`mid-${idx}`}
                        position={[s.arrival.latitude, s.arrival.longitude]}
                        icon={createAirportMarkerIcon(s.arrival.icao, 'waypoint')}
                      >
                        <Popup>
                          <div className="text-xs space-y-1">
                            <strong className="text-amber-600 block text-sm">
                              Waypoint {idx + 1}: {s.arrival.icao}
                            </strong>
                            <div>{s.arrival.name}</div>
                            <div className="text-neutral-500">
                              {s.arrival.countryName} · Elev. {s.arrival.elevationFt || 0} ft
                            </div>
                            <div className="text-[10px] text-neutral-400 font-mono">
                              Type: {s.arrival.airportType || 'Airport'}
                            </div>
                            {s.arrival.maxRunwayLengthFt && (
                              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                                Longest Runway: {s.arrival.maxRunwayLengthFt.toLocaleString()} ft ({s.arrival.hasPaved ? 'Paved' : s.arrival.hasUnpaved ? 'Unpaved' : 'Standard'})
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    ))}

                    {/* Final Arrival Airport Marker */}
                    {finalLeg && (
                      <Marker
                        position={[finalLeg.arrival.latitude, finalLeg.arrival.longitude]}
                        icon={createAirportMarkerIcon(finalLeg.arrival.icao, 'arr')}
                      >
                        <Popup>
                          <div className="text-xs space-y-1">
                            <strong className="text-purple-600 block text-sm">
                              Destination: {finalLeg.arrival.icao}
                            </strong>
                            <div>{finalLeg.arrival.name}</div>
                            <div className="text-neutral-500">
                              {finalLeg.arrival.countryName} · Elev. {finalLeg.arrival.elevationFt || 0} ft
                            </div>
                            <div className="text-[10px] text-neutral-400 font-mono">
                              Type: {finalLeg.arrival.airportType || 'Airport'}
                            </div>
                            {finalLeg.arrival.maxRunwayLengthFt && (
                              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                                Longest Runway: {finalLeg.arrival.maxRunwayLengthFt.toLocaleString()} ft ({finalLeg.arrival.hasPaved ? 'Paved' : finalLeg.arrival.hasUnpaved ? 'Unpaved' : 'Standard'})
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
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
                              {sector.isMountainous && (
                                <div className="text-amber-600 dark:text-amber-400 font-medium">Mountainous terrain corridor</div>
                              )}
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                </div>
              </div>

              {/* Sector-by-Sector Breakdown Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                    Sector Flight Dispatch & Climb Profile
                  </h3>
                  <span className="text-[11px] text-neutral-500 dark:text-geist-muted">
                    Calculated using standard climb/descent gradients and common cruise TAS
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {route.sectors.map((sector) => (
                    <div
                      key={sector.sectorIndex}
                      className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-neutral-200 dark:border-geist-hairline gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black flex items-center justify-center text-[10px] font-mono font-bold">
                            {sector.sectorIndex}
                          </span>
                          <span className="text-sm font-bold font-mono text-neutral-900 dark:text-white">
                            {sector.departure.icao} ➔ {sector.arrival.icao}
                          </span>
                          <span className="text-xs text-neutral-500 dark:text-geist-muted truncate max-w-[500px]">
                            ({sector.departure.name} to {sector.arrival.name})
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-neutral-600 dark:text-neutral-300">
                            TRK {String(sector.initialBearingDeg).padStart(3, '0')}°
                          </span>
                          <span>·</span>
                          <span className="text-neutral-900 dark:text-white font-semibold">
                            {sector.distanceNm} NM
                          </span>
                        </div>
                      </div>

                      {/* Aerodrome Runway Specifications */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-geist-card/50 px-2.5 py-1.5 rounded border border-neutral-100 dark:border-geist-hairline">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-neutral-700 dark:text-neutral-300">Dep Rwy ({sector.departure.icao}):</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-200">
                            {sector.departure.maxRunwayLengthFt ? `${sector.departure.maxRunwayLengthFt.toLocaleString()} ft` : 'Length N/A'}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            sector.departure.hasPaved
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : sector.departure.hasUnpaved
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                          }`}>
                            {sector.departure.hasPaved ? 'Paved' : sector.departure.hasUnpaved ? 'Unpaved' : 'Standard'}
                          </span>
                        </div>

                        <span className="text-neutral-300 dark:text-neutral-700 hidden sm:inline">|</span>

                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-neutral-700 dark:text-neutral-300">Arr Rwy ({sector.arrival.icao}):</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-200">
                            {sector.arrival.maxRunwayLengthFt ? `${sector.arrival.maxRunwayLengthFt.toLocaleString()} ft` : 'Length N/A'}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            sector.arrival.hasPaved
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : sector.arrival.hasUnpaved
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                          }`}>
                            {sector.arrival.hasPaved ? 'Paved' : sector.arrival.hasUnpaved ? 'Unpaved' : 'Standard'}
                          </span>
                        </div>
                      </div>

                      {/* Physics Breakdown Badges */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2 rounded bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                          <span className="text-[10px] text-neutral-500 block mb-0.5">Recommended Altitude</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-semibold text-neutral-900 dark:text-white">
                              {formatFlightLevelOrAltitude(sector.cruiseAltitudeFt)} ({sector.cruiseAltitudeFt.toLocaleString()} ft)
                            </span>
                          </div>
                        </div>

                        <div className="p-2 rounded bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                          <span className="text-[10px] text-neutral-500 block mb-0.5">Climb & Descent</span>
                          <span className="font-mono font-semibold text-neutral-900 dark:text-white">
                            {sector.climbMinutes}m climb · {sector.descentMinutes}m desc
                          </span>
                        </div>

                        <div className="p-2 rounded bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                          <span className="text-[10px] text-neutral-500 block mb-0.5">Cruise Segment</span>
                          <span className="font-mono font-semibold text-neutral-900 dark:text-white">
                            {sector.cruiseMinutes}m @ {sector.cruiseSpeedKt} kt
                          </span>
                        </div>

                        <div className="p-2 rounded bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                          <span className="text-[10px] text-neutral-500 block mb-0.5">
                            {route.includeGroundTime ? 'Total Block Time' : 'Airborne Time'}
                          </span>
                          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatDurationHoursMinutes(sector.totalMinutes)}
                          </span>
                        </div>
                      </div>

                      {/* Terrain & Corridor Minimum Safe Altitude (MSA / Grid MORA) Card */}
                      {sector.corridorMsaFt !== undefined && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded bg-neutral-50 dark:bg-geist-card/60 border border-neutral-200 dark:border-geist-hairline text-xs">
                          <div className="flex items-center gap-2">
                            <div className="p-1 rounded bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                              <Mountain className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                                  Corridor Minimum Safe Altitude:
                                </span>
                                <span className="font-mono font-bold text-neutral-900 dark:text-white">
                                  {formatFlightLevelOrAltitude(sector.corridorMsaFt)} ({sector.corridorMsaFt.toLocaleString()} ft MORA)
                                </span>
                              </div>
                              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                10 NM corridor · {sector.isMountainous ? 'Mountainous terrain (variation ≥ 3,000 ft within 10 NM) · 2,000 ft clearance margin' : 'Non-mountainous terrain (variation < 3,000 ft within 10 NM) · 1,000 ft clearance margin'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-neutral-600 dark:text-neutral-400 font-mono">
                            {sector.peakTerrainFt !== undefined && (
                              <span className="tabular-nums">Peak: ~{sector.peakTerrainFt.toLocaleString()} ft MSL</span>
                            )}
                            {sector.maxTerrainVariation10Nm !== undefined && (
                              <span className="tabular-nums">Δh: {sector.maxTerrainVariation10Nm.toLocaleString()} ft / 10 NM</span>
                            )}
                            <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                              Margin: +{(sector.cruiseAltitudeFt - (sector.peakTerrainFt || 0)).toLocaleString()} ft (Req: {sector.requiredMarginFt || 1000} ft)
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Mountainous Terrain Warning Banner */}
                      {sector.isMountainous && (
                        <div className="flex items-start gap-2 p-2.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                          <div>
                            <strong className="font-semibold">Mountainous Terrain Advisory:</strong>{' '}
                            This sector traverses mountainous terrain (elevation variation ≥ 3,000 ft within 10 NM). A 2,000 ft clearance margin is applied over peak terrain (~{(sector.peakTerrainFt || 0).toLocaleString()} ft MSL), recommending {formatFlightLevelOrAltitude(sector.cruiseAltitudeFt)}.
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    {areaType === 'circle'
                      ? 'Circle Search Area Planning'
                      : areaType === 'polygon'
                      ? 'Polygon Search Boundary Planning'
                      : 'Interactive Route Planning Map'}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                    {areaType === 'circle'
                      ? 'Click anywhere on the map to set circle center or adjust radius in the sidebar, then click "Find New Route".'
                      : areaType === 'polygon'
                      ? 'Click points on the map to draw your search border (min 3) or click "Box Region", then click "Find New Route".'
                      : 'Configure your search options and click "Find New Route" to generate an optimal flight path.'}
                  </p>
                </div>

                <button
                  onClick={handleGenerateRoute}
                  disabled={isGenerating}
                  className="px-4 py-2 rounded-sm text-xs font-semibold bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors shadow-sm disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>{isGenerating ? 'Computing Optimal Route...' : 'Find New Route'}</span>
                </button>
              </div>

              <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-1 shadow-sm overflow-hidden">
                <div className="h-[420px] w-full rounded-sm overflow-hidden relative z-0">
                  <MapContainer
                    center={circleCenter}
                    zoom={6}
                    style={{ height: '100%', width: '100%' }}
                    className={theme === 'dark' ? 'dark-tiles' : ''}
                  >
                    <MapController focusTarget={mapFocusTarget} />
                    <MapViewportTracker onViewportChange={handleViewportChange} />
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <MapAreaClickHandler areaType={areaType} onMapClick={handleMapClick} />

                    {areaType === 'circle' && circleCenter && (
                      <>
                        <Circle
                          center={circleCenter}
                          radius={circleRadiusNm * 1852}
                          pathOptions={{
                            color: '#0284c7',
                            fillColor: '#38bdf8',
                            fillOpacity: 0.15,
                            weight: 2,
                            dashArray: '5, 5',
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
                                <div>Radius: {circleRadiusNm} NM ({Math.round(circleRadiusNm * 1.852)} km)</div>
                                <div className="text-[10px] text-neutral-400">Drag marker to move circle center</div>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                      </>
                    )}

                    {areaType === 'polygon' && (
                      <>
                        {polygonCoords.length >= 3 ? (
                          <Polygon
                            positions={polygonCoords}
                            pathOptions={{
                              color: '#7c3aed',
                              fillColor: '#a855f7',
                              fillOpacity: 0.15,
                              weight: 2,
                              dashArray: '5, 5',
                            }}
                          />
                        ) : polygonCoords.length === 2 ? (
                          <Polyline
                            positions={polygonCoords}
                            color="#7c3aed"
                            weight={2}
                            dashArray="5, 5"
                          />
                        ) : null}

                        {/* Interactive border hit-area to insert new vertex on click */}
                        {polygonCoords.length >= 2 && (
                          <Polyline
                            positions={polygonCoords.length >= 3 ? [...polygonCoords, polygonCoords[0]] : polygonCoords}
                            pathOptions={{
                              color: '#7c3aed',
                              weight: 16,
                              opacity: 0.001,
                              lineCap: 'round',
                              lineJoin: 'round',
                            }}
                            eventHandlers={{
                              click: (e) => {
                                if (e.originalEvent) {
                                  e.originalEvent.stopPropagation();
                                }
                                handleInsertPolygonVertexOnBorder(e.latlng.lat, e.latlng.lng);
                              },
                            }}
                          />
                        )}

                        {/* Midpoint '+' handles to drag or click to split segment */}
                        {polygonCoords.length >= 2 &&
                          polygonCoords.map((coord, idx) => {
                            const isClosed = polygonCoords.length >= 3;
                            if (!isClosed && idx === polygonCoords.length - 1) return null;
                            const nextCoord = polygonCoords[(idx + 1) % polygonCoords.length];
                            const midLat = (coord[0] + nextCoord[0]) / 2;
                            const midLon = (coord[1] + nextCoord[1]) / 2;

                            return (
                              <Marker
                                key={`planning-midpoint-${idx}`}
                                position={[midLat, midLon]}
                                draggable={true}
                                eventHandlers={{
                                  dragend: (e) => {
                                    const marker = e.target;
                                    const pos = marker.getLatLng();
                                    handleInsertVertexAtIndex(idx + 1, pos.lat, pos.lng);
                                  },
                                  click: (e) => {
                                    if (e.originalEvent) {
                                      e.originalEvent.stopPropagation();
                                    }
                                    handleInsertVertexAtIndex(idx + 1, midLat, midLon);
                                  },
                                }}
                                icon={createMidpointMarkerIcon()}
                              >
                                <Popup>
                                  <div className="text-xs space-y-0.5">
                                    <strong className="text-purple-600 block">Border Segment Handle</strong>
                                    <div className="text-[10px] text-neutral-400">Drag or click to insert a vertex here</div>
                                  </div>
                                </Popup>
                              </Marker>
                            );
                          })}

                        {polygonCoords.map((coord, idx) => (
                          <Marker
                            key={`planning-vertex-${idx}`}
                            position={coord}
                            draggable={true}
                            eventHandlers={{
                              dragend: (e) => {
                                const marker = e.target;
                                const pos = marker.getLatLng();
                                handleUpdatePolygonVertex(idx, pos.lat, pos.lng);
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
                                  <span>Delete vertex #{idx + 1}</span>
                                </button>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                      </>
                    )}
                  </MapContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
