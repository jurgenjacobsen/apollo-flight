use serde::{Deserialize, Serialize};

fn default_flight_id() -> String {
    format!("flight-{}", uuid::Uuid::new_v4())
}

fn default_aircraft_type() -> String {
    "Unknown".to_string()
}

fn default_start_time() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn default_flight_status() -> String {
    "COMPLETED".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightRecord {
    #[serde(default = "default_flight_id")]
    pub id: String,
    #[serde(alias = "aircraft_type", default = "default_aircraft_type")]
    pub aircraft_type: String,
    #[serde(alias = "departure_icao", default)]
    pub departure_icao: Option<String>,
    #[serde(alias = "arrival_icao", default)]
    pub arrival_icao: Option<String>,
    #[serde(alias = "start_time", default = "default_start_time")]
    pub start_time: String,
    #[serde(alias = "end_time", default)]
    pub end_time: Option<String>,
    #[serde(alias = "flight_time_seconds", default)]
    pub flight_time_seconds: i64,
    #[serde(alias = "max_altitude", default)]
    pub max_altitude: i64,
    #[serde(alias = "max_ground_speed", default)]
    pub max_ground_speed: i64,
    #[serde(alias = "distance_flown_nm", default)]
    pub distance_flown_nm: f64,
    #[serde(alias = "landing_rate_fpm", default)]
    pub landing_rate_fpm: Option<f64>,
    #[serde(default = "default_flight_status")]
    pub status: String,
    #[serde(alias = "min_oat", default)]
    pub min_oat: Option<f64>,
    #[serde(alias = "max_oat", default)]
    pub max_oat: Option<f64>,
    #[serde(alias = "min_visibility", default)]
    pub min_visibility: Option<f64>,
    #[serde(alias = "avg_cruise_wind_speed", default)]
    pub avg_cruise_wind_speed: Option<f64>,
    #[serde(alias = "avg_cruise_wind_direction", default)]
    pub avg_cruise_wind_direction: Option<f64>,
    #[serde(alias = "max_wind_speed", default)]
    pub max_wind_speed: Option<f64>,
    #[serde(alias = "max_wind_direction", default)]
    pub max_wind_direction: Option<f64>,
    #[serde(alias = "total_weight", alias = "totalWeight", alias = "gross_weight", alias = "grossWeight", default)]
    pub total_weight: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPointRecord {
    #[serde(alias = "flight_id", default)]
    pub flight_id: String,
    #[serde(alias = "time", default)]
    pub timestamp: String,
    #[serde(alias = "lat", default)]
    pub latitude: f64,
    #[serde(alias = "lon", alias = "lng", default)]
    pub longitude: f64,
    #[serde(alias = "altitude_msl", alias = "alt", alias = "altitude", default)]
    pub altitude_msl: f64,
    #[serde(alias = "altitude_agl", alias = "agl", default)]
    pub altitude_agl: Option<f64>,
    #[serde(alias = "indicated_airspeed", alias = "ias", alias = "airspeed", default)]
    pub indicated_airspeed: f64,
    #[serde(alias = "ground_speed", alias = "gs", default)]
    pub ground_speed: f64,
    #[serde(alias = "hdg", default)]
    pub heading: f64,
    #[serde(default)]
    pub pitch: Option<f64>,
    #[serde(default)]
    pub bank: Option<f64>,
    #[serde(alias = "vertical_speed", alias = "vs", default)]
    pub vertical_speed: Option<f64>,
    #[serde(alias = "is_on_ground", alias = "onGround", alias = "on_ground", default)]
    pub is_on_ground: bool,
    #[serde(alias = "wind_speed", default)]
    pub wind_speed: Option<f64>,
    #[serde(alias = "wind_direction", default)]
    pub wind_direction: Option<f64>,
    #[serde(default)]
    pub oat: Option<f64>,
    #[serde(default)]
    pub tat: Option<f64>,
    #[serde(default)]
    pub visibility: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Airport {
    pub icao: String,
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub elevation_ft: Option<i32>,
    pub country_code: String,
    pub country_name: String,
    pub municipality: Option<String>,
    pub airport_type: Option<String>,
    pub continent: Option<String>,
    pub max_runway_length_ft: Option<i32>,
    pub has_paved: Option<bool>,
    pub has_unpaved: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Runway {
    pub id: i64,
    pub airport_ident: String,
    pub length_ft: Option<i32>,
    pub width_ft: Option<i32>,
    pub surface: Option<String>,
    pub is_paved: bool,
    pub is_unpaved: bool,
    pub lighted: bool,
    pub closed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteSearchFilter {
    pub continent: Option<String>,
    pub country_code: Option<String>,
    pub airport_type: Option<String>,
    pub surface: Option<String>,
    pub min_runway_ft: Option<i32>,
    pub max_runway_ft: Option<i32>,
    pub from_lat: Option<f64>,
    pub from_lon: Option<f64>,
    pub min_dist_nm: Option<f64>,
    pub max_dist_nm: Option<f64>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightDetails {
    pub flight: FlightRecord,
    pub telemetry_points: Vec<TelemetryPointRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisitedAirport {
    pub icao: String,
    pub name: Option<String>,
    pub country_code: String,
    pub country_name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub first_visited: String,
    pub last_visited: String,
    pub visit_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisitedCountry {
    pub iso_a2: String,
    pub name: String,
    pub first_visited: String,
    pub last_visited: String,
    pub flight_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisitedStats {
    pub visited_airports: Vec<VisitedAirport>,
    pub visited_countries: Vec<VisitedCountry>,
    pub total_countries: usize,
    pub total_airports: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OurAirportsSyncResult {
    pub success: bool,
    pub total_airports: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OurAirportsSyncProgress {
    pub stage: String,
    pub percent: u32,
    pub message: String,
}

fn default_aircraft_name() -> String {
    "Aircraft".to_string()
}

fn default_sector_count() -> i32 {
    1
}

fn default_true() -> bool {
    true
}

fn default_status() -> String {
    "draft".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRouteRecord {
    pub id: String,
    pub name: String,
    #[serde(default = "default_aircraft_name")]
    pub aircraft_name: String,
    pub aircraft_category: String,
    pub departure_icao: String,
    pub arrival_icao: String,
    #[serde(default = "default_sector_count")]
    pub sector_count: i32,
    pub total_distance_nm: f64,
    pub total_airborne_minutes: i32,
    pub total_duration_minutes: i32,
    #[serde(default)]
    pub total_ground_minutes: i32,
    #[serde(default = "default_true")]
    pub include_ground_time: bool,
    #[serde(default)]
    pub is_round_trip: bool,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub is_favorite: bool,
    pub sectors_json: String,
    pub created_at: String,
    pub flown_at: Option<String>,
    pub linked_flight_id: Option<String>,
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentMetadata {
    pub file_path: String,
    pub title: Option<String>,
    pub last_seen: Option<String>,
    pub tags: Vec<String>,
}

