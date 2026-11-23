export interface SimBriefFix {
    ident: string;
    name: string;
    type: string;
    via_airway: string;
    is_sid_star: "0" | "1";
    pos_lat: string;
    pos_long: string;
    stage: "CLB" | "CRZ" | "DSC";
    altitude_feet: string;
    ind_airspeed: string;
    true_airspeed: string;
    groundspeed: string;
    mach: string;
    wind_dir: string;
    wind_spd: string;
    oat: string;
    track_true: string;
    track_mag: string;
    distance: string;
    time_leg: string;
    time_total: string;
    fuel_plan_onboard: string;
    fuel_totalused: string;
}

export interface SimBriefOFP {
    fetch: {
        status: string;
        time?: string;
    };
    params: {
        airac: string;
        units: "kgs" | "lbs";
        request_id?: string;
    };
    general: {
        icao_airline?: string;
        flight_number?: string;
        cruise_profile?: string;
        initial_altitude: string;
        stepclimb_string?: string;
        avg_wind_comp?: string;
        avg_wind_dir?: string;
        avg_wind_spd?: string;
        gc_distance: string;
        air_distance: string;
        route: string;
        costindex?: string;
        dx_rmk?: string;
    };
    origin: {
        icao_code: string;
        name: string;
        plan_rwy: string;
        pos_lat: string;
        pos_long: string;
        elevation: string;
        metar?: string;
    };
    destination: {
        icao_code: string;
        name: string;
        plan_rwy: string;
        pos_lat: string;
        pos_long: string;
        elevation: string;
        metar?: string;
    };
    alternate?: {
        icao_code: string;
        name?: string;
        plan_rwy?: string;
        route?: string;
        burn?: string;
    };
    fuel: {
        taxi: string;
        enroute_burn: string;
        contingency: string;
        alternate_burn: string;
        reserve: string;
        extra: string;
        min_takeoff: string;
        plan_takeoff: string;
        plan_ramp: string;
        plan_landing: string;
    };
    weights: {
        oew: string;
        pax_count: string;
        cargo: string;
        payload: string;
        est_zfw: string;
        est_tow: string;
        est_ldw: string;
    };
    times: {
        est_time_enroute: string;
        sched_out?: string;
        sched_in?: string;
        est_block?: string;
    };
    navlog?: {
        fix: SimBriefFix[];
    };
    text?: {
        plan_html?: string;
    };
}
