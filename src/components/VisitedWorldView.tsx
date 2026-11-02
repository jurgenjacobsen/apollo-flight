import React, { useState, useMemo, useEffect } from 'react';
import { useFlightStore } from '../store/flightStore';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON } from 'react-leaflet';
import { 
  Globe2, 
  MapPin, 
  Plane, 
  Award,
  Search,
  Layers,
  ShieldCheck,
  Loader2
} from 'lucide-react';

let cachedCountriesGeoJson: any = null;

const getFeatureIso = (props: Record<string, any>): string => {
  if (!props) return '';
  const code =
    props['ISO3166-1-Alpha-2'] ||
    props.ISO_A2_EH ||
    (props.ISO_A2 !== '-99' ? props.ISO_A2 : null) ||
    props.WB_A2 ||
    props.POSTAL;
  if (code && typeof code === 'string' && code.length === 2) {
    return code.toUpperCase();
  }
  return '';
};

const getFeatureName = (props: Record<string, any>): string => {
  if (!props) return '';
  return props.name || props.NAME || props.NAME_LONG || props.ADMIN || 'Unknown';
};

export const VisitedWorldView: React.FC = () => {
  const { visitedAirports, visitedCountries, theme } = useFlightStore();
  const [filterText, setFilterText] = useState('');
  const [showAllBorders, setShowAllBorders] = useState(true);
  const [geoJsonData, setGeoJsonData] = useState<any>(cachedCountriesGeoJson);
  const [isLoadingBoundaries, setIsLoadingBoundaries] = useState(!cachedCountriesGeoJson);

  useEffect(() => {
    if (cachedCountriesGeoJson) {
      setGeoJsonData(cachedCountriesGeoJson);
      setIsLoadingBoundaries(false);
      return;
    }

    let isMounted = true;
    setIsLoadingBoundaries(true);

    fetch('/countries.geojson')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        cachedCountriesGeoJson = data;
        if (isMounted) {
          setGeoJsonData(data);
          setIsLoadingBoundaries(false);
        }
      })
      .catch((err) => {
        console.warn('Could not load high-detail countries.geojson, falling back to 110m:', err);
        fetch('/ne_110m_countries.geojson')
          .then((res) => res.json())
          .then((fallbackData) => {
            cachedCountriesGeoJson = fallbackData;
            if (isMounted) {
              setGeoJsonData(fallbackData);
              setIsLoadingBoundaries(false);
            }
          })
          .catch((fallbackErr) => {
            console.error('Failed to load country boundary polygons:', fallbackErr);
            if (isMounted) setIsLoadingBoundaries(false);
          });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const totalCountriesWorld = 195;
  const visitedCount = visitedCountries.length;
  const percentage = ((visitedCount / totalCountriesWorld) * 100).toFixed(1);

  const europeanCountries = visitedCountries.filter(c => ['NL', 'GB', 'DE', 'AT', 'FR', 'ES', 'IT', 'CH', 'SE', 'NO'].includes(c.isoA2)).length;
  const northAmericanCountries = visitedCountries.filter(c => ['US', 'CA', 'MX'].includes(c.isoA2)).length;
  const asianCountries = visitedCountries.filter(c => ['JP', 'HK', 'AE', 'SG', 'KR', 'CN'].includes(c.isoA2)).length;

  const visitedIsoSet = useMemo(() => new Set(visitedCountries.map((c) => c.isoA2)), [visitedCountries]);
  const visitedNameSet = useMemo(() => new Set(visitedCountries.map((c) => c.name.toLowerCase())), [visitedCountries]);

  const isFeatureVisited = (props: Record<string, any>) => {
    const iso = getFeatureIso(props);
    const name = getFeatureName(props).toLowerCase();
    return visitedIsoSet.has(iso) || visitedNameSet.has(name);
  };

  const filteredCountries = useMemo(() => {
    if (!filterText.trim()) return visitedCountries;
    const q = filterText.toLowerCase();
    return visitedCountries.filter(c => c.name.toLowerCase().includes(q) || c.isoA2.toLowerCase().includes(q));
  }, [visitedCountries, filterText]);

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Progress Card */}
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-sm md:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-neutral-500 dark:text-neutral-300" />
                <h2 className="text-xs font-medium text-neutral-900 dark:text-white tracking-wider">Global Flight Coverage</h2>
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">{percentage}% Unlocked</span>
            </div>

            <div className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight mb-3 tabular-nums">
              {visitedCount} <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">/ {totalCountriesWorld} Sovereign States</span>
            </div>
          </div>

          {/* Minimalist Progress bar */}
          <div className="w-full bg-neutral-200 dark:bg-[#1c1c1c] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-neutral-900 dark:bg-white h-1.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(4, Number(percentage))}%` }}
            />
          </div>
        </div>

        {/* Total Aerodromes */}
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-neutral-500 dark:text-geist-muted font-medium">Logged Aerodromes</span>
            <MapPin className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
            {visitedAirports.length}
          </div>
          <div className="text-xs text-neutral-500 dark:text-geist-muted mt-1">
            Distinct ICAO destinations
          </div>
        </div>

        {/* Continental Breakdown */}
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-neutral-500 dark:text-geist-muted font-medium">Continents</span>
            <Award className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-[#171717] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline">
              Europe {europeanCountries}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-[#171717] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline">
              N. America {northAmericanCountries}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-[#171717] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline">
              Asia/ME {asianCountries}
            </span>
          </div>
        </div>
      </div>

      {/* World Map with Verified Flight Country Outlines & Destination Pins */}
      <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 flex flex-col space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-700 dark:text-neutral-300">
          <div className="flex items-center gap-2">
            <Plane className="w-3.5 h-3.5 text-neutral-500" />
            <span className="font-medium text-neutral-900 dark:text-white tracking-tight">Verified Flight Routes & Sovereign Territories</span>
            {isLoadingBoundaries ? (
              <span className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />
                <span>Loading detailed boundaries...</span>
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-800/40">
                High Detail (1:10m)
              </span>
            )}
          </div>
          
          {/* Map Legend & Layer Toggle */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-2.5 rounded-[2px] bg-blue-500/20 border-2 border-blue-500 inline-block" />
              <span className="text-neutral-600 dark:text-neutral-300 font-medium">Visited Country Outline ({visitedCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-white inline-block" />
              <span className="text-neutral-600 dark:text-neutral-300 font-medium">Airport Pin ({visitedAirports.length})</span>
            </div>
            <button
              onClick={() => setShowAllBorders(!showAllBorders)}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-sm bg-neutral-100 dark:bg-[#171717] border border-neutral-200 dark:border-geist-hairline hover:bg-neutral-200 dark:hover:bg-[#222] transition-colors"
              title="Toggle global borders"
            >
              <Layers className="w-3 h-3 text-neutral-500" />
              <span>{showAllBorders ? 'Hide Inactive Borders' : 'Show All Borders'}</span>
            </button>
          </div>
        </div>

        <div className="h-[460px] w-full rounded-sm overflow-hidden border border-neutral-200 dark:border-geist-hairline relative z-0">
          <MapContainer
            center={[40.0, 10.0]}
            zoom={3}
            style={{ height: '100%', width: '100%' }}
            className={theme === 'dark' ? 'dark-tiles' : ''}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Country Boundaries & Visited Highlights */}
            {geoJsonData && (
              <GeoJSON
                key={`${theme}-${visitedCountries.map(c => c.isoA2).sort().join(',')}-${showAllBorders}-${geoJsonData.features?.length || 0}`}
                data={geoJsonData}
                style={(feature) => {
                  if (!feature || !feature.properties) return {};
                  const visited = isFeatureVisited(feature.properties);
                  if (visited) {
                    return {
                      fillColor: theme === 'dark' ? '#0070f3' : '#0070f3',
                      fillOpacity: theme === 'dark' ? 0.30 : 0.20,
                      color: theme === 'dark' ? '#38bdf8' : '#0070f3',
                      weight: 2.2,
                      opacity: 1,
                    };
                  }
                  return {
                    fillColor: 'transparent',
                    fillOpacity: 0,
                    color: showAllBorders ? (theme === 'dark' ? '#333333' : '#cbd5e1') : 'transparent',
                    weight: showAllBorders ? 0.75 : 0,
                    opacity: showAllBorders ? 0.6 : 0,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  const props = feature.properties || {};
                  const iso = getFeatureIso(props) || props.name || props.NAME || '';
                  const name = getFeatureName(props);
                  const visited = isFeatureVisited(props);
                  const record = visitedCountries.find((c) => c.isoA2 === iso || c.name.toLowerCase() === name.toLowerCase());

                const tooltipHtml = visited && record
                  ? `<div style="font-family: inherit; font-size: 11px; line-height: 1.4; padding: 2px;">
                       <div style="font-weight: 600; font-size: 12px; color: ${theme === 'dark' ? '#fff' : '#111'};">${name} (${iso})</div>
                       <div style="color: #0070f3; font-weight: 500; font-size: 10px; margin-top: 2px;">✓ Verified Visited · ${record.flightCount} operations</div>
                       <div style="color: #888; font-size: 9px; margin-top: 1px;">Last flight: ${new Date(record.lastVisited).toLocaleDateString()}</div>
                     </div>`
                  : `<div style="font-family: inherit; font-size: 11px; line-height: 1.4; padding: 2px;">
                       <div style="font-weight: 600; font-size: 12px; color: ${theme === 'dark' ? '#fff' : '#111'};">${name} (${iso})</div>
                       <div style="color: #888; font-size: 10px; margin-top: 2px;">No flights logged to/from this country</div>
                     </div>`;

                layer.bindTooltip(tooltipHtml, { sticky: true });

                layer.on({
                  click: (e: any) => {
                    if (e?.originalEvent?.target?.blur) {
                      e.originalEvent.target.blur();
                    }
                  },
                  mouseover: (e: any) => {
                    const target = e.target;
                    target.setStyle({
                      weight: 2.5,
                      color: visited ? (theme === 'dark' ? '#60a5fa' : '#0051b3') : (theme === 'dark' ? '#555' : '#94a3b8'),
                      fillOpacity: visited ? 0.40 : 0.05,
                      fillColor: visited ? '#0070f3' : '#64748b',
                    });
                  },
                  mouseout: (e: any) => {
                    const target = e.target;
                    target.setStyle({
                      fillColor: visited ? '#0070f3' : 'transparent',
                      fillOpacity: visited ? (theme === 'dark' ? 0.30 : 0.20) : 0,
                      color: visited ? (theme === 'dark' ? '#38bdf8' : '#0070f3') : (showAllBorders ? (theme === 'dark' ? '#333333' : '#cbd5e1') : 'transparent'),
                      weight: visited ? 2.2 : (showAllBorders ? 0.75 : 0),
                      opacity: visited ? 1 : (showAllBorders ? 0.6 : 0),
                    });
                  },
                });
              }}
            />
          )}

            {/* Aerodrome Markers */}
            {visitedAirports.map((apt) => (
              <CircleMarker
                key={apt.icao}
                center={[apt.latitude, apt.longitude]}
                radius={Math.min(10, 4 + apt.visitCount * 1.2)}
                fillColor={theme === 'dark' ? '#ffffff' : '#0070f3'}
                color={theme === 'dark' ? '#ededed' : '#005bb5'}
                weight={1.5}
                opacity={0.9}
                fillOpacity={0.8}
              >
                <Popup>
                  <div className="text-xs">
                    <strong className="text-sm">{apt.icao}</strong> · {apt.name}<br />
                    <span>Nation: {apt.countryName} ({apt.countryCode})</span><br />
                    <span>Total Visits: <strong>{apt.visitCount}</strong></span><br />
                    <span>Last Visit: {new Date(apt.lastVisited).toLocaleDateString()}</span>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
          <span>Countries are automatically outlined once a flight has been logged departing from or arriving within that sovereign nation.</span>
          <span className="tabular-nums font-medium">{visitedCount} sovereign states verified</span>
        </div>
      </div>

      {/* Visited Countries List & Airport Leaderboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Countries Table with Search */}
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
                <Globe2 className="w-3.5 h-3.5 text-neutral-400" />
                Visited Sovereign Nations ({visitedCount})
              </h3>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                Automatically logged from completed flights
              </p>
            </div>

            {/* Search Filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter visited..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="pl-7 pr-2.5 py-1 text-xs rounded-sm bg-neutral-100 dark:bg-[#111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-blue-500 transition-colors w-36"
              />
            </div>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 flex-1">
            {filteredCountries.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                No matching visited countries found.
              </div>
            ) : (
              filteredCountries.map((c) => (
                <div
                  key={c.isoA2}
                  className="flex items-center justify-between p-2 rounded-sm bg-neutral-50 dark:bg-[#0e0e0e] border border-neutral-200 dark:border-geist-hairline text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 text-center font-semibold text-neutral-900 dark:text-white bg-neutral-200/60 dark:bg-neutral-800 px-1 py-0.5 rounded-[3px]">
                      {c.isoA2}
                    </span>
                    <div>
                      <span className="text-neutral-800 dark:text-neutral-200 font-medium">{c.name}</span>
                      <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                        Last flight: {new Date(c.lastVisited).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-medium tabular-nums">
                      <ShieldCheck className="w-3 h-3" />
                      {c.flightCount} operations
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Airports Table */}
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 shadow-sm flex flex-col">
          <div className="mb-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-neutral-400" />
              Top Visited Aerodromes ({visitedAirports.length})
            </h3>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Arrival & departure waypoints
            </p>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 flex-1">
            {visitedAirports.map((apt) => (
              <div
                key={apt.icao}
                className="flex items-center justify-between p-2 rounded-sm bg-neutral-50 dark:bg-[#0e0e0e] border border-neutral-200 dark:border-geist-hairline text-xs"
              >
                <div>
                  <span className="font-semibold text-neutral-900 dark:text-white">{apt.icao}</span>
                  <span className="text-neutral-700 dark:text-neutral-300 ml-2">{apt.name}</span>
                </div>
                <span className="bg-neutral-100 dark:bg-[#171717] text-neutral-800 dark:text-neutral-200 px-2 py-0.5 rounded-sm border border-neutral-200 dark:border-geist-hairline tabular-nums font-medium">
                  {apt.visitCount} visits
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
