import React, { useState, useEffect, useRef } from "react";
import { useFlightStore } from "../../store/flightStore";
import { NavSource } from "../../types/flight";
import {
    Compass,
    CheckCircle2,
    Sliders,
    Sparkles,
    Radio,
    PlaneTakeoff,
    Lock,
    ZoomIn,
    ZoomOut,
} from "lucide-react";

interface InterceptChallenge {
    stationType: "VOR" | "NDB";
    stationId: string;
    targetRadial: number;
    direction: "INBOUND" | "OUTBOUND";
    recommendedHeading: number;
    toleranceDeg: number;
    active: boolean;
}

export type ZoomRange = "AUTO" | number;

export const IfrTrainer: React.FC = () => {
    const { currentTelemetry, activeFlight, theme } = useFlightStore();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const [mode, setMode] = useState<"LIVE" | "PRACTICE">(() =>
        activeFlight ? "LIVE" : "PRACTICE",
    );
    const [navSource, setNavSource] = useState<NavSource>("NAV1");
    const [selectedRange, setSelectedRange] = useState<ZoomRange>("AUTO");

    const [challenge, setChallenge] = useState<InterceptChallenge | null>({
        stationType: "VOR",
        stationId: "NAV1: INN (111.40)",
        targetRadial: 90,
        direction: "INBOUND",
        recommendedHeading: 60,
        toleranceDeg: 2,
        active: true,
    });

    // Aircraft Heading: orientation/direction the nose is pointing (0° - 359°)
    const [simHdg, setSimHdg] = useState<number>(
        () => Math.round(currentTelemetry.heading) || 80,
    );
    // Aircraft Current Radial: position on the compass rose relative to the station (1° - 360°)
    const [simRadial, setSimRadial] = useState<number>(90);
    // DME / Simulated Distance from station
    const [simDme, setSimDme] = useState<number>(
        currentTelemetry.nav1DmeDistance || 8.5,
    );

    // Automatically switch to Live MSFS Sync when an ongoing flight is detected
    const prevActiveFlightIdRef = useRef<string | null>(
        activeFlight?.id ?? null,
    );
    useEffect(() => {
        const currentFlightId = activeFlight?.id ?? null;
        if (
            currentFlightId &&
            (!prevActiveFlightIdRef.current ||
                prevActiveFlightIdRef.current !== currentFlightId)
        ) {
            setMode("LIVE");
        }
        prevActiveFlightIdRef.current = currentFlightId;
    }, [activeFlight?.id]);

    // Scalable canvas zoom calculation:
    // When within 5 NM -> 5 NM (zoomed in at maximum detail)
    // As aircraft distances itself past 5 NM -> canvas smoothly zooms out up to 25 NM
    const autoRange: number = (() => {
        if (simDme <= 5) return 5;
        // Scale dynamically so aircraft stays comfortably within the plot radius (~85%), up to 25 NM
        const scaled = Math.min(25, Number((simDme * 1.15).toFixed(1)));
        return Math.max(5, scaled);
    })();

    const activeRange: number =
        selectedRange === "AUTO" ? autoRange : Number(selectedRange);

    // When in LIVE mode, automatically track live sim telemetry based on chosen NAV source
    useEffect(() => {
        if (mode === "LIVE" && currentTelemetry.simConnected) {
            const liveHdg = Math.round(currentTelemetry.heading);
            setSimHdg(liveHdg);

            if (navSource === "NAV1") {
                // True VOR Radial from station (0x0C50); fallback to relative bearing if radial offset unpopulated
                let liveRadial = 0;
                if (
                    typeof currentTelemetry.nav1Radial === "number" &&
                    currentTelemetry.simConnected
                ) {
                    liveRadial =
                        Math.round(currentTelemetry.nav1Radial) % 360 || 360;
                } else {
                    liveRadial =
                        Math.round(
                            liveHdg +
                                currentTelemetry.nav1RelativeBearing +
                                180 +
                                360,
                        ) % 360 || 360;
                }
                setSimRadial(liveRadial);
                setSimDme(
                    Number(currentTelemetry.nav1DmeDistance.toFixed(1)) || 0.1,
                );
            } else if (navSource === "NAV2") {
                let liveRadial = 0;
                if (
                    typeof currentTelemetry.nav2Radial === "number" &&
                    currentTelemetry.simConnected
                ) {
                    liveRadial =
                        Math.round(currentTelemetry.nav2Radial) % 360 || 360;
                } else {
                    liveRadial =
                        Math.round(
                            liveHdg +
                                (currentTelemetry.nav2RelativeBearing ?? 0) +
                                180 +
                                360,
                        ) % 360 || 360;
                }
                setSimRadial(liveRadial);
                setSimDme(
                    Number(
                        (currentTelemetry.nav2DmeDistance ?? 0).toFixed(1),
                    ) || 0.1,
                );
            } else if (navSource === "ADF") {
                // NDB: Track from station (QDR) = Heading + ADF Relative Bearing + 180°
                const liveRadial =
                    Math.round(
                        liveHdg +
                            currentTelemetry.adf1RelativeBearing +
                            180 +
                            360,
                    ) % 360 || 360;
                setSimRadial(liveRadial);
                // NDBs do not have DME; maintain current or default rendering distance
                setSimDme((prev) => (prev > 0 ? prev : 6.0));
            }
        }
    }, [mode, navSource, currentTelemetry]);

    const generateNewChallenge = (source: NavSource = navSource) => {
        const radials = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
        const target = radials[Math.floor(Math.random() * radials.length)];
        const direction: "INBOUND" | "OUTBOUND" =
            Math.random() > 0.5 ? "INBOUND" : "OUTBOUND";

        let recommended = 0;
        if (direction === "INBOUND") {
            const inboundCourse = (target + 180) % 360;
            recommended = (inboundCourse - 30 + 360) % 360;
        } else {
            recommended = (target + 35) % 360;
        }

        const isNdb = source === "ADF";
        setChallenge({
            stationType: isNdb ? "NDB" : "VOR",
            stationId:
                source === "NAV1"
                    ? "NAV1: INN (111.40)"
                    : source === "NAV2"
                      ? "NAV2: OEV (113.20)"
                      : "ADF: INN (420 kHz)",
            targetRadial: target,
            direction,
            recommendedHeading: recommended,
            toleranceDeg: isNdb ? 4 : 2,
            active: true,
        });
    };

    const handleSelectNavSource = (source: NavSource) => {
        setNavSource(source);
        generateNewChallenge(source);
    };

    const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const cur = selectedRange === "AUTO" ? activeRange : selectedRange;
        if (e.deltaY < 0) {
            // Zoom in (decrease range down to 5 NM)
            const next = Math.max(5, cur - 2.5);
            setSelectedRange(Math.round(next * 2) / 2);
        } else {
            // Zoom out (increase range up to 25 NM)
            const next = Math.min(25, cur + 2.5);
            setSelectedRange(Math.round(next * 2) / 2);
        }
    };

    // Aircraft current radial position matches simRadial (normalized 1° - 360°)
    const currentAircraftRadial = simRadial % 360 || 360;
    const deviation = challenge
        ? Math.abs(
              ((currentAircraftRadial - challenge.targetRadial + 540) % 360) -
                  180,
          )
        : 0;
    const isTargetCaptured =
        challenge?.active && deviation <= (challenge?.toleranceDeg ?? 2);

    // Compute Relative Bearing from station to aircraft heading for info display
    const bearingToStation = (simRadial + 180) % 360;
    let relativeBearing = (bearingToStation - simHdg + 360) % 360;
    if (relativeBearing > 180) relativeBearing -= 360;

    // Render Canvas Instrument
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) - 30;

        ctx.clearRect(0, 0, width, height);

        // 1. Draw outer compass rose circle with theme-responsive background
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = theme === "dark" ? "#0a0a0a" : "#f8fafc";
        ctx.fill();
        ctx.strokeStyle = theme === "dark" ? "#262626" : "#e2e8f0";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 2. Draw compass ticks & degrees
        ctx.fillStyle = theme === "dark" ? "#a3a3a3" : "#334155";
        ctx.font = "10px Geist, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let deg = 0; deg < 360; deg += 10) {
            const angleRad = ((deg - 90) * Math.PI) / 180;
            const isMajor = deg % 30 === 0;
            const tickLength = isMajor ? 10 : 5;

            const xInner = centerX + (radius - tickLength) * Math.cos(angleRad);
            const yInner = centerY + (radius - tickLength) * Math.sin(angleRad);
            const xOuter = centerX + radius * Math.cos(angleRad);
            const yOuter = centerY + radius * Math.sin(angleRad);

            ctx.beginPath();
            ctx.moveTo(xInner, yInner);
            ctx.lineTo(xOuter, yOuter);
            ctx.strokeStyle = isMajor
                ? theme === "dark"
                    ? "#888888"
                    : "#475569"
                : theme === "dark"
                  ? "#333333"
                  : "#cbd5e1";
            ctx.lineWidth = isMajor ? 1.5 : 1;
            ctx.stroke();

            if (isMajor) {
                const textDist = radius - 20;
                const textX = centerX + textDist * Math.cos(angleRad);
                const textY = centerY + textDist * Math.sin(angleRad);

                let label = String(deg / 10);
                if (deg === 0) label = "N";
                if (deg === 90) label = "E";
                if (deg === 180) label = "S";
                if (deg === 270) label = "W";

                ctx.fillText(label, textX, textY);
            }
        }

        // 2b. Draw Scalable Range Rings (zoomed in at 5 NM, zooming out up to 25 NM)
        const maxPlotRadius = radius - 35;
        const ringDistances: number[] = [];
        if (activeRange <= 6) {
            // High-precision zoom: 1, 2, 3, 4, 5 NM
            [1, 2, 3, 4, 5].forEach((d) => {
                if (d <= activeRange) ringDistances.push(d);
            });
        } else if (activeRange <= 12) {
            // Mid zoom: 2.5, 5, 7.5, 10 NM
            [2.5, 5, 7.5, 10].forEach((d) => {
                if (d <= activeRange) ringDistances.push(d);
            });
        } else {
            // Zoomed out up to 25 NM: 5, 10, 15, 20, 25 NM
            [5, 10, 15, 20, 25].forEach((d) => {
                if (d <= activeRange) ringDistances.push(d);
            });
        }

        ringDistances.forEach((dist) => {
            const ringR = (dist / activeRange) * maxPlotRadius;
            ctx.beginPath();
            ctx.arc(centerX, centerY, ringR, 0, 2 * Math.PI);
            ctx.strokeStyle =
                theme === "dark"
                    ? "rgba(255, 255, 255, 0.1)"
                    : "rgba(0, 0, 0, 0.08)";
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Ring distance label along 45° angle (North-East)
            const angle = -Math.PI / 4;
            const lx = centerX + ringR * Math.cos(angle);
            const ly = centerY + ringR * Math.sin(angle);
            ctx.fillStyle =
                theme === "dark"
                    ? "rgba(255, 255, 255, 0.45)"
                    : "rgba(0, 0, 0, 0.5)";
            ctx.font = "8px Geist, monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${dist} NM`, lx, ly);
        });

        // Range Scale watermark at bottom of instrument face
        ctx.fillStyle =
            theme === "dark"
                ? "rgba(255, 255, 255, 0.4)"
                : "rgba(0, 0, 0, 0.45)";
        ctx.font = "bold 8.5px Geist, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
            `RANGE: ${activeRange.toFixed(1)} NM ${selectedRange === "AUTO" ? "(AUTO)" : ""}`,
            centerX,
            centerY + radius - 12,
        );

        // 3. Draw Target Radial line if challenge exists
        if (challenge) {
            const radialRad = ((challenge.targetRadial - 90) * Math.PI) / 180;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + (radius - 5) * Math.cos(radialRad),
                centerY + (radius - 5) * Math.sin(radialRad),
            );
            ctx.strokeStyle = "#2563eb";
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 4. Draw Center NAVAID Symbol (VOR vs NDB)
        const isNdbStation =
            navSource === "ADF" || challenge?.stationType === "NDB";
        if (isNdbStation) {
            // Concentric rings for NDB transmitter beacon
            ctx.beginPath();
            ctx.arc(centerX, centerY, 14, 0, 2 * Math.PI);
            ctx.strokeStyle =
                theme === "dark"
                    ? "rgba(245, 158, 11, 0.4)"
                    : "rgba(217, 119, 6, 0.5)";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
            ctx.fillStyle = "#f59e0b";
            ctx.fill();
            ctx.strokeStyle = theme === "dark" ? "#ffffff" : "#0f172a";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = theme === "dark" ? "#f59e0b" : "#b45309";
            ctx.font = "bold 8px Geist, monospace";
            ctx.textAlign = "center";
            ctx.fillText("NDB", centerX, centerY + 22);
        } else {
            // VOR Compass Rose Hub
            ctx.beginPath();
            ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
            ctx.fillStyle = "#0070f3";
            ctx.fill();
            ctx.strokeStyle = theme === "dark" ? "#ffffff" : "#0f172a";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = theme === "dark" ? "#0070f3" : "#1d4ed8";
            ctx.font = "bold 8px Geist, monospace";
            ctx.textAlign = "center";
            ctx.fillText("VOR", centerX, centerY + 20);
        }

        // 5. Draw Aircraft Vector & Position relative to NAVAID
        // Position depends strictly on simRadial and scalable distance, NOT heading
        const clampedDme = Math.min(simDme, activeRange);
        const aircraftDistPx = Math.max(
            12,
            (clampedDme / activeRange) * maxPlotRadius,
        );
        const radialRad = (((simRadial % 360) - 90) * Math.PI) / 180;
        const planeX = centerX + aircraftDistPx * Math.cos(radialRad);
        const planeY = centerY + aircraftDistPx * Math.sin(radialRad);

        // Bearing line from VOR/NDB to aircraft
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(planeX, planeY);
        ctx.strokeStyle = isNdbStation
            ? theme === "dark"
                ? "rgba(245, 158, 11, 0.35)"
                : "rgba(217, 119, 6, 0.4)"
            : theme === "dark"
              ? "rgba(0, 112, 243, 0.35)"
              : "rgba(37, 99, 235, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Aircraft icon oriented strictly by simHdg (MSFS heading in Live mode or slider in practice)
        ctx.save();
        ctx.translate(planeX, planeY);
        ctx.rotate((simHdg * Math.PI) / 180);

        // Forward projected heading vector line
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(0, -28);
        ctx.strokeStyle = isTargetCaptured ? "#10b981" : "#3b82f6";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Arrowhead on heading vector
        ctx.beginPath();
        ctx.moveTo(-3, -23);
        ctx.lineTo(0, -28);
        ctx.lineTo(3, -23);
        ctx.strokeStyle = isTargetCaptured ? "#10b981" : "#3b82f6";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(8, 8);
        ctx.lineTo(0, 4);
        ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fillStyle = isTargetCaptured
            ? "#10b981"
            : theme === "dark"
              ? "#ffffff"
              : "#0f172a";
        ctx.fill();
        ctx.strokeStyle = theme === "dark" ? "#000000" : "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }, [
        simHdg,
        simRadial,
        simDme,
        challenge,
        navSource,
        theme,
        isTargetCaptured,
        activeRange,
        selectedRange,
    ]);

    return (
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans">
            {/* Top Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                        <Compass className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
                            IFR VOR / NDB Interception Trainer
                        </h1>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                            Procedural training for tracking radials and
                            recommended intercept angles
                        </p>
                    </div>
                </div>

                {/* Mode & Radio Source Selectors */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Radio Source Switcher */}
                    <div className="inline-flex rounded-sm p-0.5 bg-neutral-200 dark:bg-[#181818] border border-neutral-300 dark:border-geist-hairline">
                        <button
                            onClick={() => handleSelectNavSource("NAV1")}
                            title="Select NAV1 VOR/ILS receiver"
                            className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                                navSource === "NAV1"
                                    ? "bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm"
                                    : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                            }`}
                        >
                            NAV1
                        </button>
                        <button
                            onClick={() => handleSelectNavSource("NAV2")}
                            title="Select NAV2 VOR receiver"
                            className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                                navSource === "NAV2"
                                    ? "bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm"
                                    : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                            }`}
                        >
                            NAV2
                        </button>
                        <button
                            onClick={() => handleSelectNavSource("ADF")}
                            title="Select ADF / NDB receiver"
                            className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                                navSource === "ADF"
                                    ? "bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm"
                                    : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                            }`}
                        >
                            ADF (NDB)
                        </button>
                    </div>

                    {/* Mode Selector */}
                    <div className="inline-flex rounded-sm p-0.5 bg-neutral-200 dark:bg-[#181818] border border-neutral-300 dark:border-geist-hairline">
                        <button
                            onClick={() => setMode("LIVE")}
                            className={`px-3 py-1 text-xs font-medium rounded-sm flex items-center gap-1.5 transition-colors ${
                                mode === "LIVE"
                                    ? "bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm"
                                    : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                            }`}
                        >
                            <PlaneTakeoff className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Live MSFS Sync</span>
                            {activeFlight && (
                                <span
                                    className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"
                                    title="Ongoing flight active"
                                />
                            )}
                        </button>
                        <button
                            onClick={() => setMode("PRACTICE")}
                            className={`px-3 py-1 text-xs font-medium rounded-sm flex items-center gap-1.5 transition-colors ${
                                mode === "PRACTICE"
                                    ? "bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm"
                                    : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                            }`}
                        >
                            <Sliders className="w-3.5 h-3.5 text-neutral-500" />
                            <span>Practice Mode</span>
                        </button>
                    </div>

                    <button
                        onClick={() => generateNewChallenge(navSource)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>New Challenge</span>
                    </button>
                </div>
            </div>

            {/* Live Sim Status Banner */}
            {mode === "LIVE" && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-sm bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline text-xs">
                    <div className="flex items-center gap-2">
                        <Radio className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="font-medium text-neutral-900 dark:text-white">
                            Live Mode ({navSource}):
                        </span>
                        {currentTelemetry.simConnected ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {navSource === "NAV1" &&
                                    `Heading ${Math.round(currentTelemetry.heading)}° · Radial ${simRadial % 360 || 360}° · Rel ${currentTelemetry.nav1RelativeBearing.toFixed(1)}° · DME ${currentTelemetry.nav1DmeDistance > 0 ? `${currentTelemetry.nav1DmeDistance.toFixed(1)} NM` : "No Signal"} · OBS ${currentTelemetry.nav1Obs}°`}
                                {navSource === "NAV2" &&
                                    `Heading ${Math.round(currentTelemetry.heading)}° · Radial ${simRadial % 360 || 360}° · Rel ${(currentTelemetry.nav2RelativeBearing ?? 0).toFixed(1)}° · DME ${(currentTelemetry.nav2DmeDistance ?? 0) > 0 ? `${currentTelemetry.nav2DmeDistance.toFixed(1)} NM` : "No Signal"} · OBS ${currentTelemetry.nav2Obs || 0}°`}
                                {navSource === "ADF" &&
                                    `Heading ${Math.round(currentTelemetry.heading)}° · ADF Relative ${currentTelemetry.adf1RelativeBearing.toFixed(1)}° · QDR (Radial) ${simRadial % 360 || 360}° · QDM (To NDB) ${bearingToStation}°`}
                            </span>
                        ) : (
                            <span className="text-amber-600 dark:text-amber-400">
                                Waiting for MSFS connection (0x3364)... Controls
                                will auto-sync upon connection.
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-neutral-500">
                        {activeFlight && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Flight: {activeFlight.departureIcao} →{" "}
                                {activeFlight.arrivalIcao}
                            </span>
                        )}
                        <span>GS: {currentTelemetry.groundSpeed} kt</span>
                    </div>
                </div>
            )}

            {/* Main Grid: Visualizer and Challenge Status */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Canvas Visualizer */}
                <div className="lg:col-span-2 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 flex flex-col items-center justify-center shadow-sm">
                    <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 dark:text-geist-muted mb-2">
                        <span>
                            Station:{" "}
                            {challenge?.stationId ||
                                (navSource === "NAV1"
                                    ? "NAV1 VOR"
                                    : navSource === "NAV2"
                                      ? "NAV2 VOR"
                                      : "ADF NDB")}
                        </span>

                        {/* Scalable Canvas Zoom Selector */}
                        <div className="inline-flex items-center gap-1 bg-neutral-100 dark:bg-[#181818] p-0.5 rounded-sm border border-neutral-200 dark:border-geist-hairline">
                            <span className="text-[10px] uppercase font-semibold text-neutral-400 dark:text-neutral-500 px-1.5">
                                Range
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedRange("AUTO")}
                                title={`Auto zoom: scales from 5 NM when close up to 25 NM as distance increases (currently ${activeRange.toFixed(1)} NM)`}
                                className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs transition-colors ${
                                    selectedRange === "AUTO"
                                        ? "bg-white dark:bg-[#282828] text-neutral-900 dark:text-white font-semibold shadow-xs"
                                        : "text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                                }`}
                            >
                                Auto ({activeRange.toFixed(1)} NM)
                            </button>
                            {([5, 10, 15, 20, 25] as const).map((rng) => (
                                <button
                                    key={rng}
                                    type="button"
                                    onClick={() => setSelectedRange(rng)}
                                    title={`Fix zoom to ${rng} NM`}
                                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs transition-colors ${
                                        selectedRange === rng
                                            ? "bg-white dark:bg-[#282828] text-neutral-900 dark:text-white font-semibold shadow-xs"
                                            : "text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                                    }`}
                                >
                                    {rng} NM
                                </button>
                            ))}
                            <div className="h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800 mx-0.5" />
                            <button
                                type="button"
                                onClick={() => {
                                    const cur =
                                        selectedRange === "AUTO"
                                            ? activeRange
                                            : selectedRange;
                                    const next = Math.max(5, cur - 2.5);
                                    setSelectedRange(Math.round(next * 2) / 2);
                                }}
                                disabled={activeRange <= 5}
                                title="Zoom in (closer to station, min 5 NM)"
                                className="p-1 rounded-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white disabled:opacity-30 transition-colors"
                            >
                                <ZoomIn className="w-3 h-3" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const cur =
                                        selectedRange === "AUTO"
                                            ? activeRange
                                            : selectedRange;
                                    const next = Math.min(25, cur + 2.5);
                                    setSelectedRange(Math.round(next * 2) / 2);
                                }}
                                disabled={activeRange >= 25}
                                title="Zoom out (further from station, max 25 NM)"
                                className="p-1 rounded-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white disabled:opacity-30 transition-colors"
                            >
                                <ZoomOut className="w-3 h-3" />
                            </button>
                        </div>

                        <span className="font-mono tabular-nums">
                            {navSource === "ADF"
                                ? `QDR: ${simRadial % 360 || 360}° · Heading: ${simHdg}° · Rel: ${relativeBearing > 0 ? `+${relativeBearing}` : relativeBearing}°`
                                : `Radial: ${simRadial % 360 || 360}° · Heading: ${simHdg}° · DME: ${simDme > 0 ? `${simDme} NM` : "No Signal"}`}
                        </span>
                    </div>

                    <div className="relative group/canvas flex items-center justify-center">
                        <canvas
                            ref={canvasRef}
                            width={400}
                            height={400}
                            onWheel={handleCanvasWheel}
                            className="w-full max-w-[400px] aspect-square rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] shadow-xs cursor-crosshair"
                            title="Use mouse scroll or range buttons to zoom in / out (5 NM - 25 NM)"
                        />
                        {/* Quick floating zoom overlay */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover/canvas:opacity-100 transition-opacity flex items-center gap-1 bg-white/90 dark:bg-black/90 backdrop-blur-xs border border-neutral-200 dark:border-geist-hairline rounded-sm p-1 shadow-sm">
                            <button
                                type="button"
                                onClick={() => {
                                    const cur =
                                        selectedRange === "AUTO"
                                            ? activeRange
                                            : selectedRange;
                                    const next = Math.max(5, cur - 2.5);
                                    setSelectedRange(Math.round(next * 2) / 2);
                                }}
                                disabled={activeRange <= 5}
                                title="Zoom in (5 NM)"
                                className="p-1 text-neutral-600 dark:text-neutral-300 hover:text-black dark:hover:text-white disabled:opacity-30"
                            >
                                <ZoomIn className="w-3 h-3" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const cur =
                                        selectedRange === "AUTO"
                                            ? activeRange
                                            : selectedRange;
                                    const next = Math.min(25, cur + 2.5);
                                    setSelectedRange(Math.round(next * 2) / 2);
                                }}
                                disabled={activeRange >= 25}
                                title="Zoom out (25 NM)"
                                className="p-1 text-neutral-600 dark:text-neutral-300 hover:text-black dark:hover:text-white disabled:opacity-30"
                            >
                                <ZoomOut className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Challenge Panel & Flight Controls */}
                <div className="space-y-4">
                    {challenge && (
                        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-neutral-500 dark:text-geist-muted uppercase tracking-wider">
                                    Active Challenge
                                </span>
                                {isTargetCaptured ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        RADIAL CAPTURED
                                    </span>
                                ) : (
                                    <span className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                                        Δ {deviation.toFixed(0)}° Deviation
                                    </span>
                                )}
                            </div>

                            <div className="p-3 rounded-sm bg-neutral-100 dark:bg-[#181818] border border-neutral-200 dark:border-geist-hairline">
                                <div className="text-xs text-neutral-500 dark:text-geist-muted">
                                    Target Objective:
                                </div>
                                <div className="text-sm font-semibold text-neutral-900 dark:text-white mt-0.5">
                                    {challenge.stationType === "NDB" ? (
                                        <>
                                            Intercept NDB Track / QDR{" "}
                                            <span className="text-amber-500 font-mono">
                                                {challenge.targetRadial}°
                                            </span>{" "}
                                            ({challenge.direction})
                                        </>
                                    ) : (
                                        <>
                                            Intercept VOR Radial{" "}
                                            <span className="text-blue-500 font-mono">
                                                {challenge.targetRadial}°
                                            </span>{" "}
                                            ({challenge.direction})
                                        </>
                                    )}
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <span className="text-neutral-500 dark:text-geist-muted block text-[11px]">
                                            Recommended Heading:
                                        </span>
                                        <span className="font-mono font-semibold text-neutral-900 dark:text-white text-sm">
                                            {challenge.recommendedHeading}°
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-neutral-500 dark:text-geist-muted block text-[11px]">
                                            Tolerance:
                                        </span>
                                        <span className="font-mono font-semibold text-neutral-900 dark:text-white text-sm">
                                            ±{challenge.toleranceDeg}°
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-2 p-2 rounded-sm bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-sans">
                                    Fly heading{" "}
                                    <strong>
                                        {challenge.recommendedHeading}°
                                    </strong>{" "}
                                    to establish an intercept cut angle. As the
                                    needle centers, roll out onto the course
                                    heading.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Controls */}
                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm">
                        <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-geist-hairline">
                            <div className="flex items-center gap-2">
                                <Sliders className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                    {mode === "LIVE"
                                        ? "Live Telemetry Values (Read-Only)"
                                        : "Practice Scenario Sliders"}
                                </span>
                            </div>
                            {mode === "LIVE" && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" />
                                    LOCKED / LIVE SYNCED
                                </span>
                            )}
                        </div>

                        {/* Live Sync Lock Notice */}
                        {mode === "LIVE" && (
                            <div className="p-2.5 rounded-sm bg-neutral-100 dark:bg-[#181818] border border-neutral-200 dark:border-geist-hairline flex items-start gap-2">
                                <Lock className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 shrink-0 mt-0.5" />
                                <div className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                                    Sliders are locked during{" "}
                                    <strong>Live MSFS Sync</strong>. Heading,
                                    radial, and DME are automatically received
                                    from Microsoft Flight Simulator. Switch to{" "}
                                    <strong>Practice Mode</strong> to manually
                                    manipulate parameters.
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 text-xs">
                            <div>
                                <div className="flex justify-between text-neutral-500 dark:text-geist-muted mb-1 text-xs">
                                    <span>Aircraft Heading</span>
                                    <span className="text-neutral-900 dark:text-white font-semibold tabular-nums">
                                        {simHdg}°
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="359"
                                    disabled={mode === "LIVE"}
                                    value={simHdg}
                                    onChange={(e) =>
                                        setSimHdg(Number(e.target.value))
                                    }
                                    className={`w-full accent-neutral-900 dark:accent-white h-1.5 bg-neutral-200 dark:bg-[#262626] rounded-sm ${
                                        mode === "LIVE"
                                            ? "opacity-40 cursor-not-allowed"
                                            : "cursor-pointer"
                                    }`}
                                />
                            </div>

                            <div>
                                <div className="flex justify-between text-neutral-500 dark:text-geist-muted mb-1 text-xs">
                                    <span>Aircraft Current Radial</span>
                                    <span className="text-neutral-900 dark:text-white font-semibold tabular-nums">
                                        {simRadial % 360 || 360}°
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="359"
                                    disabled={mode === "LIVE"}
                                    value={simRadial % 360}
                                    onChange={(e) => {
                                        const val = Number(e.target.value);
                                        setSimRadial(val === 0 ? 360 : val);
                                    }}
                                    className={`w-full accent-neutral-900 dark:accent-white h-1.5 bg-neutral-200 dark:bg-[#262626] rounded-sm ${
                                        mode === "LIVE"
                                            ? "opacity-40 cursor-not-allowed"
                                            : "cursor-pointer"
                                    }`}
                                />
                            </div>

                            <div>
                                <div className="flex justify-between text-neutral-500 dark:text-geist-muted mb-1 text-xs">
                                    <span>
                                        {navSource === "ADF"
                                            ? "Simulated Distance (NDB)"
                                            : "DME Distance"}
                                    </span>
                                    <span className="text-neutral-900 dark:text-white font-semibold tabular-nums">
                                        {navSource === "ADF" && mode === "LIVE"
                                            ? "N/A (No DME on NDB)"
                                            : `${simDme} NM`}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="25"
                                    step="0.5"
                                    disabled={mode === "LIVE"}
                                    value={simDme}
                                    onChange={(e) =>
                                        setSimDme(Number(e.target.value))
                                    }
                                    className={`w-full accent-neutral-900 dark:accent-white h-1.5 bg-neutral-200 dark:bg-[#262626] rounded-sm ${
                                        mode === "LIVE"
                                            ? "opacity-40 cursor-not-allowed"
                                            : "cursor-pointer"
                                    }`}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
