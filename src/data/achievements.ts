import type { Achievement } from "../types/achievement";

export const ACHIEVEMENTS: Achievement[] = [
    {
        id: "first-solo",
        name: "First Solo",
        description: "Complete and log your very first flight.",
        category: "milestones",
        icon: "PlaneTakeoff",
        rarity: "bronze",
        expression: (user) => {
            const count = user.completedFlightsCount;
            const target = 1;
            const completed = count >= target;
            return {
                completed,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} flight`,
                targetValue: "1 flight",
            };
        },
    },
    {
        id: "alps-explorer",
        name: "Alpine Aviator",
        description: "Land at iconic airports in the European Alps (Innsbruck, Sion, Courchevel, Samedan, Friedrichshafen).",
        category: "exploration",
        icon: "Mountain",
        rarity: "gold",
        expression: (user) => {
            const alpineIcaos = ["LOWI", "LSGS", "LFLJ", "LSZS", "EDNY"];
            const visitedSet = new Set(user.visitedAirports.map((a) => a.icao.toUpperCase()));
            const matches = alpineIcaos.filter((icao) => visitedSet.has(icao)).length;
            const target = 2; // Visit at least 2 alpine airports
            const completed = matches >= target;
            return {
                completed,
                progression: Math.min(1.0, matches / target),
                currentValue: `${matches} / ${target}`,
                targetValue: `${target} airports`,
            };
        },
    },
    {
        id: "euro-tour",
        name: "Continental Master: Europe",
        description: "Touch down in at least 5 different European sovereign nations.",
        category: "exploration",
        icon: "Globe2",
        rarity: "silver",
        expression: (user) => {
            const euroIsos = [
                "NL", "GB", "DE", "AT", "FR", "ES", "IT", "CH", "SE", "NO",
                "DK", "FI", "PT", "BE", "GR", "PL", "IE", "CZ", "HR", "IS",
            ];
            const visitedIsos = new Set(user.visitedCountries.map((c) => c.isoA2.toUpperCase()));
            const count = euroIsos.filter((iso) => visitedIsos.has(iso)).length;
            const target = 5;
            return {
                completed: count >= target,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} nations`,
                targetValue: `${target} nations`,
            };
        },
    },
    {
        id: "north-america-cross",
        name: "North America Explorer",
        description: "Visit airports in both the United States and Canada or Mexico.",
        category: "exploration",
        icon: "Compass",
        rarity: "silver",
        expression: (user) => {
            const naIsos = ["US", "CA", "MX"];
            const visitedIsos = new Set(user.visitedCountries.map((c) => c.isoA2.toUpperCase()));
            const count = naIsos.filter((iso) => visitedIsos.has(iso)).length;
            const target = 2;
            return {
                completed: count >= target,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} / ${target}`,
                targetValue: "2 nations",
            };
        },
    },
    {
        id: "asia-pacific",
        name: "Asia-Pacific Traveler",
        description: "Log flights into at least 3 countries in Asia and Oceania.",
        category: "exploration",
        icon: "Navigation",
        rarity: "gold",
        expression: (user) => {
            const apIsos = ["JP", "SG", "AE", "HK", "KR", "CN", "TH", "IN", "AU", "NZ", "QA", "MY"];
            const visitedIsos = new Set(user.visitedCountries.map((c) => c.isoA2.toUpperCase()));
            const count = apIsos.filter((iso) => visitedIsos.has(iso)).length;
            const target = 3;
            return {
                completed: count >= target,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} / ${target}`,
                targetValue: "3 nations",
            };
        },
    },
    {
        id: "globetrotter-10",
        name: "Globetrotter",
        description: "Log arrivals in 10 different sovereign countries around the world.",
        category: "exploration",
        icon: "MapPin",
        rarity: "gold",
        expression: (user) => {
            const count = user.visitedCountries.length;
            const target = 10;
            return {
                completed: count >= target,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} countries`,
                targetValue: `${target} countries`,
            };
        },
    },
    {
        id: "world-citizen",
        name: "World Citizen",
        description: "Log arrivals in 25 sovereign countries around the globe.",
        category: "exploration",
        icon: "Award",
        rarity: "platinum",
        expression: (user) => {
            const count = user.visitedCountries.length;
            const target = 25;
            return {
                completed: count >= target,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} countries`,
                targetValue: `${target} countries`,
            };
        },
    },
    {
        id: "aerodrome-collector",
        name: "Aerodrome Collector",
        description: "Visit and log operations at 15 distinct airports.",
        category: "exploration",
        icon: "Layers",
        rarity: "silver",
        expression: (user) => {
            const count = user.visitedAirports.length;
            const target = 15;
            return {
                completed: count >= target,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} airports`,
                targetValue: `${target} airports`,
            };
        },
    },
    {
        id: "cross-country-1000",
        name: "Cross-Country Navigator",
        description: "Fly a cumulative total of 1,000 nautical miles.",
        category: "distance",
        icon: "Milestone",
        rarity: "bronze",
        expression: (user) => {
            const dist = Math.round(user.totalDistanceNm);
            const target = 1000;
            return {
                completed: dist >= target,
                progression: Math.min(1.0, dist / target),
                currentValue: `${dist.toLocaleString()} NM`,
                targetValue: "1,000 NM",
            };
        },
    },
    {
        id: "transoceanic-5000",
        name: "Long-Haul Transoceanic",
        description: "Fly a cumulative total of 5,000 nautical miles.",
        category: "distance",
        icon: "Send",
        rarity: "silver",
        expression: (user) => {
            const dist = Math.round(user.totalDistanceNm);
            const target = 5000;
            return {
                completed: dist >= target,
                progression: Math.min(1.0, dist / target),
                currentValue: `${dist.toLocaleString()} NM`,
                targetValue: "5,000 NM",
            };
        },
    },
    {
        id: "circumnavigator",
        name: "Circumnavigator",
        description: "Fly 21,600 nautical miles — equivalent to circumnavigating the Earth at the equator.",
        category: "distance",
        icon: "Globe",
        rarity: "platinum",
        expression: (user) => {
            const dist = Math.round(user.totalDistanceNm);
            const target = 21600;
            return {
                completed: dist >= target,
                progression: Math.min(1.0, dist / target),
                currentValue: `${dist.toLocaleString()} NM`,
                targetValue: "21,600 NM",
            };
        },
    },
    {
        id: "ten-hours-cockpit",
        name: "Airborne Apprentice",
        description: "Log 10 hours of active flight time in the simulator.",
        category: "hours",
        icon: "Clock",
        rarity: "bronze",
        expression: (user) => {
            const hours = user.totalFlightTimeSeconds / 3600;
            const target = 10;
            return {
                completed: hours >= target,
                progression: Math.min(1.0, hours / target),
                currentValue: `${hours.toFixed(1)} hrs`,
                targetValue: "10 hrs",
            };
        },
    },
    {
        id: "century-club",
        name: "Century Club",
        description: "Log 100 cumulative flight hours in command.",
        category: "hours",
        icon: "ShieldAlert",
        rarity: "gold",
        expression: (user) => {
            const hours = user.totalFlightTimeSeconds / 3600;
            const target = 100;
            return {
                completed: hours >= target,
                progression: Math.min(1.0, hours / target),
                currentValue: `${hours.toFixed(1)} hrs`,
                targetValue: "100 hrs",
            };
        },
    },
    {
        id: "butter-landing",
        name: "Butter Touchdown",
        description: "Log a touchdown with a vertical descent rate softer than -120 fpm.",
        category: "landings",
        icon: "Feather",
        rarity: "silver",
        expression: (user) => {
            const softest = user.softestLandingFpm;
            const completed = softest !== null && softest >= -120 && softest < 0;
            return {
                completed,
                progression: completed ? 1.0 : (softest !== null ? Math.min(1.0, 120 / Math.abs(softest)) : 0.0),
                currentValue: softest !== null ? `${Math.round(softest)} FPM` : "No landings",
                targetValue: "-120 FPM",
            };
        },
    },
    {
        id: "greaser-landing",
        name: "Greaser Master",
        description: "Execute an ultra-smooth landing softer than -75 fpm.",
        category: "landings",
        icon: "Sparkles",
        rarity: "platinum",
        expression: (user) => {
            const softest = user.softestLandingFpm;
            const completed = softest !== null && softest >= -75 && softest < 0;
            return {
                completed,
                progression: completed ? 1.0 : (softest !== null ? Math.min(1.0, 75 / Math.abs(softest)) : 0.0),
                currentValue: softest !== null ? `${Math.round(softest)} FPM` : "No landings",
                targetValue: "-75 FPM",
            };
        },
    },
    {
        id: "centurion-landings",
        name: "Touchdown Veteran",
        description: "Complete and log 25 total landings.",
        category: "landings",
        icon: "PlaneLanding",
        rarity: "gold",
        expression: (user) => {
            const count = user.totalLandings;
            const target = 25;
            return {
                completed: count >= target,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} landings`,
                targetValue: `${target} landings`,
            };
        },
    },
    {
        id: "frequent-flyer",
        name: "Frequent Aviator",
        description: "Complete 10 full flights from departure to arrival.",
        category: "milestones",
        icon: "History",
        rarity: "bronze",
        expression: (user) => {
            const count = user.completedFlightsCount;
            const target = 10;
            return {
                completed: count >= target,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} flights`,
                targetValue: `${target} flights`,
            };
        },
    },
    {
        id: "fleet-veteran",
        name: "Fleet Captain",
        description: "Complete 50 full flights recorded in your logbook.",
        category: "milestones",
        icon: "Crown",
        rarity: "gold",
        expression: (user) => {
            const count = user.completedFlightsCount;
            const target = 50;
            return {
                completed: count >= target,
                progression: Math.min(1.0, count / target),
                currentValue: `${count} flights`,
                targetValue: `${target} flights`,
            };
        },
    },
];
