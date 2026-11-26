import React from "react";
import { Select } from "../ui/Select";
import {
    AircraftCategory,
    AirportTypePreference,
    AircraftCategoryProfile,
} from "../../types/route";
import {
    AIRCRAFT_CATEGORIES,
    formatFlightLevelOrAltitude,
} from "../../data/aircraftCategories";

interface AircraftSelectorProps {
    category: AircraftCategory;
    onSelectCategory: (newCategory: AircraftCategory) => void;
    airportType: AirportTypePreference;
    onAdjustAirportType: (type: AirportTypePreference) => void;
    selectedProfile: AircraftCategoryProfile;
}

export const AircraftSelector: React.FC<AircraftSelectorProps> = ({
    category,
    onSelectCategory,
    airportType,
    onAdjustAirportType,
    selectedProfile,
}) => {
    return (
        <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                1. Aircraft Performance Class
            </label>
            <Select
                value={category}
                onChange={(newCat) => {
                    const cat = newCat as AircraftCategory;
                    onSelectCategory(cat);
                    if (
                        ["C", "D", "E", "F"].includes(cat) &&
                        airportType === "small_airport"
                    ) {
                        onAdjustAirportType("all");
                    }
                }}
                options={(
                    Object.keys(AIRCRAFT_CATEGORIES) as AircraftCategory[]
                ).map((cat) => {
                    const prof = AIRCRAFT_CATEGORIES[cat];
                    return {
                        value: cat,
                        label: `Cat ${cat} - ${prof.examples.slice(0, 3).join(", ")}`,
                    };
                })}
                className="w-full"
                triggerClassName="bg-neutral-50 dark:bg-black"
            />
            <div className="p-2 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline text-[11px] text-neutral-600 dark:text-neutral-400 space-y-0.5">
                <div className="flex justify-between">
                    <span>
                        Cruise TAS: {selectedProfile.cruiseSpeedTasKt} kt
                    </span>
                    <span>
                        Typical Level:{" "}
                        {formatFlightLevelOrAltitude(
                            selectedProfile.typicalCruiseAltFt,
                        )}
                    </span>
                </div>
                <div
                    className="text-[10px] text-neutral-500 truncate"
                    title={selectedProfile.examples.join(", ")}
                >
                    Examples: {selectedProfile.examples.join(", ")}
                </div>
            </div>
        </div>
    );
};
