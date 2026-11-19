import type { FlightRecord, VisitedAirport, VisitedCountry } from "./flight";

export interface AchievementResult {
    completed: boolean;
    progression: number; // 0.0 to 1.0
    currentValue?: string | number;
    targetValue?: string | number;
}

export interface AchievementUserData {
    flights: FlightRecord[];
    visitedAirports: VisitedAirport[];
    visitedCountries: VisitedCountry[];
    totalDistanceNm: number;
    totalFlightTimeSeconds: number;
    totalLandings: number;
    completedFlightsCount: number;
    softestLandingFpm: number | null;
    mostFlownAircraft: string | null;
    favoriteAirport: string | null;
}

export type AchievementCategory =
    | "exploration"
    | "hours"
    | "landings"
    | "distance"
    | "milestones";

export interface Achievement {
    id: string;
    name: string;
    description: string;
    category: AchievementCategory;
    icon: string;
    rarity: "bronze" | "silver" | "gold" | "platinum";
    expression: (user: AchievementUserData) => AchievementResult;
}
