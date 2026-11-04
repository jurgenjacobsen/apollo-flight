import React, { useState, useMemo, useEffect } from 'react';
import { useFlightStore } from '../store/flightStore';
import { SavedRoute, RouteSector } from '../types/route';
import { formatDurationHoursMinutes, formatFlightLevelOrAltitude } from '../data/aircraftCategories';
import { calculateDistanceNm } from '../data/mockData';
import {
  Bookmark,
  Heart,
  Play,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Milestone,
  Gauge,
  Mountain,
  ChevronDown,
  ChevronRight,
  Search,
  Route as RouteIcon,
  Plane,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Calendar,
  Layers,
} from 'lucide-react';

export const SavedRoutesView: React.FC = () => {
  const {
    savedRoutes,
    fetchSavedRoutes,
    currentTelemetry,
    startManualFlight,
    setActiveView,
    toggleRouteFavorite,
    updateRouteStatus,
    deleteSavedRoute,
  } = useFlightStore();

  useEffect(() => {
    fetchSavedRoutes();
  }, [fetchSavedRoutes]);

  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'draft' | 'flown'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedRouteIds, setExpandedRouteIds] = useState<Set<string>>(new Set());
  const [copiedRouteId, setCopiedRouteId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const toggleExpanded = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopy = (route: SavedRoute, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let sectors: RouteSector[] = [];
    try {
      sectors = route.sectors && route.sectors.length > 0 ? route.sectors : JSON.parse(route.sectorsJson || '[]');
    } catch {}

    const waypointsStr = [route.departureIcao, ...sectors.map((s) => s.arrival.icao)].filter(Boolean).join(' ➔ ');
    const briefing = `Apollo Flight Route Briefing:
Name: ${route.name}
Airframe Category: ${route.aircraftCategory}
Routing: ${waypointsStr || `${route.departureIcao} ➔ ${route.arrivalIcao}`}
Sectors: ${sectors.length || 1}
Total Distance: ${route.totalDistanceNm} NM
Airborne Duration: ${formatDurationHoursMinutes(route.totalAirborneMinutes)}
Total Duration: ${formatDurationHoursMinutes(route.totalDurationMinutes)}
Recommended Altitudes: ${sectors.map((s, i) => `Leg ${i + 1}: ${formatFlightLevelOrAltitude(s.cruiseAltitudeFt)} (${s.distanceNm} NM, MORA ${formatFlightLevelOrAltitude(s.corridorMsaFt || 0)})`).join(' · ')}`;

    navigator.clipboard.writeText(briefing);
    setCopiedRouteId(route.id);
    setTimeout(() => setCopiedRouteId(null), 2000);
  };

  const counts = useMemo(() => {
    return {
      all: savedRoutes.length,
      favorites: savedRoutes.filter((r) => r.isFavorite).length,
      draft: savedRoutes.filter((r) => r.status === 'draft').length,
      flown: savedRoutes.filter((r) => r.status === 'flown').length,
    };
  }, [savedRoutes]);

  const filteredRoutes = useMemo(() => {
    return savedRoutes.filter((route) => {
      // Tab filter
      if (activeTab === 'favorites' && !route.isFavorite) return false;
      if (activeTab === 'draft' && route.status !== 'draft') return false;
      if (activeTab === 'flown' && route.status !== 'flown') return false;

      // Text query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesIcao =
          route.departureIcao.toLowerCase().includes(q) ||
          route.arrivalIcao.toLowerCase().includes(q) ||
          (typeof route.intermediateIcaos === 'string' ? route.intermediateIcaos : '').toLowerCase().includes(q);
        const matchesName = route.name.toLowerCase().includes(q);
        const matchesCategory =
          `cat ${route.aircraftCategory}`.toLowerCase().includes(q) ||
          (route.aircraftName || '').toLowerCase().includes(q);
        if (!matchesIcao && !matchesName && !matchesCategory) {
          return false;
        }
      }

      return true;
    });
  }, [savedRoutes, activeTab, searchQuery]);

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 dark:border-geist-hairline gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-sm bg-blue-50 dark:bg-[#0c182b] border border-blue-200 dark:border-blue-900/50 text-blue-600 dark:text-blue-400">
            <Bookmark className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
              Saved Routes
            </h1>
            <p className="text-xs text-neutral-500 dark:text-geist-muted">
              Flight dispatch log of planned, favorited, and flown routes ready for MSFS execution.
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveView('new-route')}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-sm text-xs font-semibold bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors shadow-sm shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>New Route</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-sm bg-neutral-100 dark:bg-[#181818] text-neutral-600 dark:text-neutral-300">
            <RouteIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">Saved Routes</div>
            <div className="text-lg font-semibold text-neutral-900 dark:text-white tabular-nums">{counts.all}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-sm bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400">
            <Heart className="w-4 h-4 fill-rose-500/20" />
          </div>
          <div>
            <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">Favorites</div>
            <div className="text-lg font-semibold text-neutral-900 dark:text-white tabular-nums">{counts.favorites}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-sm bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">Pending Drafts</div>
            <div className="text-lg font-semibold text-neutral-900 dark:text-white tabular-nums">{counts.draft}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-sm bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">Flown Routes</div>
            <div className="text-lg font-semibold text-neutral-900 dark:text-white tabular-nums">{counts.flown}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-neutral-200/60 dark:bg-[#161616] rounded-sm border border-neutral-200 dark:border-geist-hairline self-start">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-white dark:bg-[#222] text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <span>All</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-100 dark:bg-black/60 text-neutral-600 dark:text-neutral-400 font-mono">
              {counts.all}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('favorites')}
            className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'favorites'
                ? 'bg-white dark:bg-[#222] text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
            <span>Favorites</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-100 dark:bg-black/60 text-neutral-600 dark:text-neutral-400 font-mono">
              {counts.favorites}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('draft')}
            className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'draft'
                ? 'bg-white dark:bg-[#222] text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <span>Drafts</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-100 dark:bg-black/60 text-neutral-600 dark:text-neutral-400 font-mono">
              {counts.draft}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('flown')}
            className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'flown'
                ? 'bg-white dark:bg-[#222] text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Flown</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-100 dark:bg-black/60 text-neutral-600 dark:text-neutral-400 font-mono">
              {counts.flown}
            </span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ICAO, name, category..."
            className="w-full h-8 pl-8 pr-3 bg-white dark:bg-[#111] border border-neutral-200 dark:border-geist-hairline rounded-sm text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
          />
        </div>
      </div>

      {/* Routes Table Container */}
      <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-xs overflow-hidden">
        {filteredRoutes.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-[#1a1a1a] flex items-center justify-center mx-auto text-neutral-400">
              <RouteIcon className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {searchQuery ? 'No matching saved routes' : activeTab !== 'all' ? `No ${activeTab} routes found` : 'No saved routes yet'}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-geist-muted">
                {searchQuery
                  ? 'Try adjusting your search criteria or clear the search filter.'
                  : 'Generate customized IFR or VFR flight paths in the Route Generator and save them to this list.'}
              </p>
            </div>
            {!searchQuery && (
              <button
                onClick={() => setActiveView('new-route')}
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm text-xs font-medium bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Explore New Routes</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-100/70 dark:bg-[#0e0e0e] border-b border-neutral-200 dark:border-geist-hairline text-xs text-neutral-600 dark:text-neutral-400 select-none">
                  <th className="py-2.5 px-3 font-medium w-10 text-center">
                    <Heart className="w-3.5 h-3.5 mx-auto text-neutral-400" />
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Plane className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Route</span>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Category</span>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Milestone className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Distance</span>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Airborne</span>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Block Time</span>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Mountain className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Altitude</span>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    <span>Status</span>
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Saved</span>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right pr-4">
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-geist-hairline text-xs">
                {filteredRoutes.map((route) => {
                  let sectors: RouteSector[] = [];
                  try {
                    sectors = route.sectors && route.sectors.length > 0 ? route.sectors : JSON.parse(route.sectorsJson || '[]');
                  } catch {}

                  const isExpanded = expandedRouteIds.has(route.id);
                  const firstSector = sectors[0];
                  const finalSector = sectors[sectors.length - 1];
                  const isMultiSector = sectors.length > 1;

                  // Fly button criteria:
                  // 1. Sim connected
                  // 2. Current position within 25 NM of departure
                  let canFly = false;
                  let flyDisabledReason = '';
                  let distToDepNm: number | null = null;

                  if (!currentTelemetry.simConnected) {
                    canFly = false;
                    flyDisabledReason = 'Simulator disconnected. Launch MSFS & FSUIPC.';
                  } else if (!firstSector?.departure) {
                    canFly = false;
                    flyDisabledReason = 'Departure coordinates unavailable.';
                  } else {
                    distToDepNm = calculateDistanceNm(
                      currentTelemetry.latitude,
                      currentTelemetry.longitude,
                      firstSector.departure.latitude,
                      firstSector.departure.longitude
                    );

                    if (distToDepNm <= 25.0) {
                      canFly = true;
                    } else {
                      canFly = false;
                      flyDisabledReason = `Aircraft is ${distToDepNm.toFixed(1)} NM from ${route.departureIcao} (must be ≤ 25 NM)`;
                    }
                  }

                  const waypointsStr = [route.departureIcao, ...sectors.map((s) => s.arrival.icao)].filter(Boolean).join(' ➔ ');

                  return (
                    <React.Fragment key={route.id}>
                      <tr
                        onClick={() => isMultiSector && toggleExpanded(route.id)}
                        className={`hover:bg-neutral-50 dark:hover:bg-[#121212] transition-colors duration-100 ${
                          isExpanded ? 'bg-neutral-50/70 dark:bg-[#141414]' : ''
                        } ${isMultiSector ? 'cursor-pointer' : ''}`}
                      >
                        {/* Favorite Button Cell */}
                        <td className="py-3 px-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleRouteFavorite(route.id)}
                            title={route.isFavorite ? 'Unfavorite' : 'Add to Favorites'}
                            className={`p-1 rounded transition-colors ${
                              route.isFavorite
                                ? 'text-rose-600 hover:text-rose-700'
                                : 'text-neutral-300 dark:text-neutral-700 hover:text-rose-500'
                            }`}
                          >
                            <Heart className={`w-3.5 h-3.5 ${route.isFavorite ? 'fill-rose-500' : ''}`} />
                          </button>
                        </td>

                        {/* Route / Sectors Cell */}
                        <td className="py-3 px-3 align-middle">
                          <div className="flex items-center gap-2">
                            {isMultiSector && (
                              <button
                                type="button"
                                onClick={(e) => toggleExpanded(route.id, e)}
                                className="p-0.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                              >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            )}

                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold font-mono text-neutral-900 dark:text-white tracking-tight">
                                  {waypointsStr || `${route.departureIcao} ➔ ${route.arrivalIcao}`}
                                </span>
                                {isMultiSector && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-neutral-100 dark:bg-[#202020] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800">
                                    {sectors.length} legs
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-neutral-400 dark:text-geist-muted truncate max-w-[260px]">
                                {firstSector ? `${firstSector.departure.name} to ${finalSector?.arrival?.name || route.arrivalIcao}` : route.name}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category Cell */}
                        <td className="py-3 px-3 align-middle">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-mono font-medium border border-blue-200/50 dark:border-blue-900/50">
                            Cat {route.aircraftCategory}
                          </span>
                        </td>

                        {/* Distance Cell */}
                        <td className="py-3 px-3 align-middle font-mono tabular-nums">
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {route.totalDistanceNm} <span className="text-[10px] text-neutral-400 font-normal">NM</span>
                          </div>
                          <div className="text-[10px] text-neutral-400">
                            {Math.round(route.totalDistanceNm * 1.852)} km
                          </div>
                        </td>

                        {/* Airborne Duration Cell */}
                        <td className="py-3 px-3 align-middle font-mono tabular-nums text-neutral-900 dark:text-white">
                          {formatDurationHoursMinutes(route.totalAirborneMinutes)}
                        </td>

                        {/* Total Block Duration Cell */}
                        <td className="py-3 px-3 align-middle font-mono tabular-nums">
                          <div className="text-neutral-900 dark:text-white">
                            {formatDurationHoursMinutes(route.totalDurationMinutes)}
                          </div>
                          {route.totalGroundMinutes > 0 && (
                            <div className="text-[10px] text-neutral-400">
                              incl. {route.totalGroundMinutes}m taxi
                            </div>
                          )}
                        </td>

                        {/* Altitude Cell */}
                        <td className="py-3 px-3 align-middle font-mono tabular-nums text-neutral-700 dark:text-neutral-300">
                          {route.recommendedAltitudeFt
                            ? formatFlightLevelOrAltitude(route.recommendedAltitudeFt)
                            : firstSector?.cruiseAltitudeFt
                            ? formatFlightLevelOrAltitude(firstSector.cruiseAltitudeFt)
                            : 'VFR'}
                        </td>

                        {/* Status Cell */}
                        <td className="py-3 px-3 align-middle">
                          {route.status === 'flown' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Flown</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
                              <Clock className="w-3 h-3" />
                              <span>Draft</span>
                            </span>
                          )}
                        </td>

                        {/* Date Saved Cell */}
                        <td className="py-3 px-3 align-middle text-[11px] text-neutral-500 dark:text-neutral-400 font-mono whitespace-nowrap">
                          {new Date(route.createdAt).toLocaleDateString()}
                        </td>

                        {/* Actions Cell */}
                        <td className="py-3 px-3 pr-4 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Fly Button with Tooltip */}
                            <div className="relative group/fly inline-flex">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!canFly) return;
                                  startManualFlight(
                                    route.departureIcao,
                                    finalSector?.arrival?.icao || route.arrivalIcao,
                                    route.aircraftName || `Category ${route.aircraftCategory}`
                                  );
                                  setActiveView('dashboard');
                                }}
                                disabled={!canFly}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold shadow-2xs transition-colors ${
                                  canFly
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                                    : 'bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-400 dark:text-neutral-600 border border-neutral-200 dark:border-neutral-800 cursor-not-allowed opacity-60'
                                }`}
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Fly</span>
                              </button>

                              {!canFly && (
                                <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover/fly:flex items-center gap-1.5 bg-neutral-900 text-white text-[11px] py-1 px-2.5 rounded-sm shadow-lg whitespace-nowrap z-30 pointer-events-none">
                                  <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span>{flyDisabledReason}</span>
                                </div>
                              )}
                            </div>

                            {/* Status Toggle Button */}
                            {route.status === 'draft' ? (
                              <button
                                type="button"
                                onClick={() => updateRouteStatus(route.id, 'flown')}
                                className="p-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#202020] transition-colors"
                                title="Mark as Flown"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => updateRouteStatus(route.id, 'draft')}
                                className="p-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#202020] transition-colors"
                                title="Mark as Draft"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                              </button>
                            )}

                            {/* Copy Briefing Button */}
                            <button
                              type="button"
                              onClick={(e) => handleCopy(route, e)}
                              className={`p-1.5 rounded-sm border transition-colors ${
                                copiedRouteId === route.id
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'border-neutral-200 dark:border-geist-hairline text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#202020]'
                              }`}
                              title="Copy route briefing"
                            >
                              {copiedRouteId === route.id ? (
                                <Check className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Delete Button */}
                            {deleteConfirmId === route.id ? (
                              <div className="flex items-center gap-1 animate-in fade-in duration-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteSavedRoute(route.id);
                                    setDeleteConfirmId(null);
                                  }}
                                  className="px-2 py-0.5 rounded-sm text-[10px] font-semibold bg-red-600 hover:bg-red-500 text-white"
                                >
                                  Del
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-1.5 py-0.5 rounded-sm text-[10px] border border-neutral-200 dark:border-geist-hairline text-neutral-500"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(route.id)}
                                className="p-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline text-neutral-400 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                title="Delete route"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Multi-Sector Details Sub-Table */}
                      {isMultiSector && isExpanded && (
                        <tr className="bg-neutral-100/60 dark:bg-[#0c0c0c] border-b border-neutral-200 dark:border-geist-hairline">
                          <td colSpan={10} className="p-3 pl-12 pr-4">
                            <div className="bg-white dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline rounded-sm p-3 space-y-2 shadow-2xs">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                                <span>Multi-Sector Flight Plan ({sectors.length} legs)</span>
                                <span>{route.name}</span>
                              </div>

                              <div className="grid grid-cols-1 divide-y divide-neutral-100 dark:divide-[#222]">
                                {sectors.map((sector) => (
                                  <div
                                    key={sector.sectorIndex}
                                    className="py-2 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="w-4 h-4 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black flex items-center justify-center text-[9px] font-mono font-bold">
                                        {sector.sectorIndex}
                                      </span>
                                      <span className="font-bold font-mono text-neutral-900 dark:text-white">
                                        {sector.departure.icao} ➔ {sector.arrival.icao}
                                      </span>
                                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[280px]">
                                        ({sector.departure.name} to {sector.arrival.name})
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-3 font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                                      <span>TRK {String(sector.initialBearingDeg).padStart(3, '0')}°</span>
                                      <span>·</span>
                                      <span>{sector.distanceNm} NM</span>
                                      <span>·</span>
                                      <span>{formatFlightLevelOrAltitude(sector.cruiseAltitudeFt)}</span>
                                      {sector.corridorMsaFt && (
                                        <>
                                          <span>·</span>
                                          <span className="text-neutral-400">
                                            MORA {formatFlightLevelOrAltitude(sector.corridorMsaFt)}
                                          </span>
                                        </>
                                      )}
                                      <span>·</span>
                                      <span className="text-neutral-400">{Math.round(sector.airborneMinutes)}m airborne</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
