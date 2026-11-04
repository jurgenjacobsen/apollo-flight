use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightRecord {
    pub id: String,
    pub aircraft_type: String,
    pub departure_icao: Option<String>,
    pub arrival_icao: Option<String>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub flight_time_seconds: i64,
    pub max_altitude: i64,
    pub max_ground_speed: i64,
    pub distance_flown_nm: f64,
    pub landing_rate_fpm: Option<f64>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPointRecord {
    pub flight_id: String,
    pub timestamp: String,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_msl: f64,
    pub altitude_agl: Option<f64>,
    pub indicated_airspeed: f64,
    pub ground_speed: f64,
    pub heading: f64,
    pub pitch: Option<f64>,
    pub bank: Option<f64>,
    pub vertical_speed: Option<f64>,
    pub is_on_ground: bool,
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

pub fn init_databases(
    logbook_path: &Path,
    navdata_path: &Path,
    resource_dirs: &[std::path::PathBuf],
) -> Result<(Connection, Connection)> {
    // 1. Check if legacy aerotrack.db exists in the same directory and needs migration
    if let Some(parent) = logbook_path.parent() {
        let legacy_db = parent.join("aerotrack.db");
        if legacy_db.exists() && (!logbook_path.exists() || !navdata_path.exists()) {
            log::info!("Found legacy aerotrack.db, partitioning into logbook.db and navdata.db...");
            let _ = migrate_from_legacy_aerotrack(&legacy_db, logbook_path, navdata_path);
        }
    }

    // 2. Open and initialize navdata.db (Global aerodromes and runways)
    let mut navdata_conn = Connection::open(navdata_path)?;
    navdata_conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS airports (
            icao TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            elevation_ft INTEGER,
            country_code TEXT NOT NULL,
            country_name TEXT NOT NULL,
            municipality TEXT,
            airport_type TEXT DEFAULT 'medium_airport',
            continent TEXT DEFAULT 'EU',
            max_runway_length_ft INTEGER,
            max_paved_runway_length_ft INTEGER,
            max_unpaved_runway_length_ft INTEGER,
            has_paved BOOLEAN DEFAULT 1,
            has_unpaved BOOLEAN DEFAULT 0,
            all_runways_closed BOOLEAN DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS runways (
            id INTEGER PRIMARY KEY,
            airport_ident TEXT NOT NULL,
            length_ft INTEGER,
            width_ft INTEGER,
            surface TEXT,
            is_paved BOOLEAN NOT NULL DEFAULT 1,
            is_unpaved BOOLEAN NOT NULL DEFAULT 0,
            lighted BOOLEAN NOT NULL DEFAULT 0,
            closed BOOLEAN NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_airports_coords ON airports(latitude, longitude);
        CREATE INDEX IF NOT EXISTS idx_airports_type ON airports(airport_type);
        CREATE INDEX IF NOT EXISTS idx_airports_continent ON airports(continent);
        CREATE INDEX IF NOT EXISTS idx_airports_rwy_len ON airports(max_runway_length_ft);
        CREATE INDEX IF NOT EXISTS idx_airports_rwy_paved ON airports(max_paved_runway_length_ft);
        CREATE INDEX IF NOT EXISTS idx_airports_rwy_unpaved ON airports(max_unpaved_runway_length_ft);
        CREATE INDEX IF NOT EXISTS idx_airports_rwy_closed ON airports(all_runways_closed);

        CREATE INDEX IF NOT EXISTS idx_runways_ident ON runways(airport_ident);
        CREATE INDEX IF NOT EXISTS idx_runways_length ON runways(length_ft);
        CREATE INDEX IF NOT EXISTS idx_runways_closed ON runways(closed);
        "#
    )?;

    // Auto-seed or import OurAirports data if navdata is empty
    seed_or_import_airports(&mut navdata_conn, resource_dirs)?;

    // 3. Open and initialize logbook.db (Personal flight records, telemetry, routes, visited stats)
    let logbook_conn = Connection::open(logbook_path)?;
    logbook_conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS flights (
            id TEXT PRIMARY KEY,
            aircraft_type TEXT NOT NULL,
            departure_icao TEXT,
            arrival_icao TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT,
            flight_time_seconds INTEGER DEFAULT 0,
            max_altitude INTEGER DEFAULT 0,
            max_ground_speed INTEGER DEFAULT 0,
            distance_flown_nm REAL DEFAULT 0.0,
            landing_rate_fpm REAL,
            status TEXT CHECK(status IN ('RECORDING', 'COMPLETED', 'DISCARDED')) DEFAULT 'RECORDING'
        );

        CREATE TABLE IF NOT EXISTS flight_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flight_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            altitude_msl REAL NOT NULL,
            altitude_agl REAL,
            indicated_airspeed REAL NOT NULL,
            ground_speed REAL NOT NULL,
            heading REAL NOT NULL,
            pitch REAL,
            bank REAL,
            vertical_speed REAL,
            is_on_ground BOOLEAN NOT NULL,
            FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS visited_airports (
            icao TEXT PRIMARY KEY,
            name TEXT,
            country_code TEXT NOT NULL,
            country_name TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            first_visited TEXT NOT NULL,
            last_visited TEXT NOT NULL,
            visit_count INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS visited_countries (
            iso_a2 TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            first_visited TEXT NOT NULL,
            last_visited TEXT NOT NULL,
            flight_count INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS saved_routes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            aircraft_name TEXT NOT NULL,
            aircraft_category TEXT NOT NULL,
            departure_icao TEXT NOT NULL,
            arrival_icao TEXT NOT NULL,
            sector_count INTEGER NOT NULL,
            total_distance_nm REAL NOT NULL,
            total_airborne_minutes INTEGER NOT NULL,
            total_duration_minutes INTEGER NOT NULL,
            total_ground_minutes INTEGER DEFAULT 0,
            include_ground_time BOOLEAN NOT NULL DEFAULT 1,
            is_round_trip BOOLEAN NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            is_favorite BOOLEAN NOT NULL DEFAULT 0,
            sectors_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            flown_at TEXT,
            linked_flight_id TEXT,
            FOREIGN KEY (linked_flight_id) REFERENCES flights(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_telemetry_flight_id ON flight_telemetry(flight_id);
        CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON flight_telemetry(timestamp);
        CREATE INDEX IF NOT EXISTS idx_saved_routes_status ON saved_routes(status);
        CREATE INDEX IF NOT EXISTS idx_saved_routes_favorite ON saved_routes(is_favorite);
        CREATE INDEX IF NOT EXISTS idx_saved_routes_dep_arr ON saved_routes(departure_icao, arrival_icao);

        CREATE TABLE IF NOT EXISTS user_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );
        "#
    )?;

    // Attach navdata to logbook so logbook can query navdata.airports and navdata.runways seamlessly
    let navdata_abs = navdata_path.to_string_lossy().to_string();
    let _ = logbook_conn.execute("ATTACH DATABASE ?1 AS navdata", [&navdata_abs]);
    let _ = logbook_conn.execute("CREATE TEMP VIEW IF NOT EXISTS airports AS SELECT * FROM navdata.airports", []);
    let _ = logbook_conn.execute("CREATE TEMP VIEW IF NOT EXISTS runways AS SELECT * FROM navdata.runways", []);

    Ok((logbook_conn, navdata_conn))
}

fn migrate_from_legacy_aerotrack(legacy_db: &Path, logbook_path: &Path, navdata_path: &Path) -> Result<()> {
    if legacy_db.exists() {
        let legacy_abs = legacy_db.to_string_lossy().to_string();
        // If logbook_path doesn't exist yet, copy user tables
        if !logbook_path.exists() {
            if let Ok(logbook) = Connection::open(logbook_path) {
                let _ = logbook.execute("ATTACH DATABASE ?1 AS legacy", [&legacy_abs]);
                let _ = logbook.execute_batch(
                    r#"
                    CREATE TABLE IF NOT EXISTS flights AS SELECT * FROM legacy.flights;
                    CREATE TABLE IF NOT EXISTS flight_telemetry AS SELECT * FROM legacy.flight_telemetry;
                    CREATE TABLE IF NOT EXISTS visited_airports AS SELECT * FROM legacy.visited_airports;
                    CREATE TABLE IF NOT EXISTS visited_countries AS SELECT * FROM legacy.visited_countries;
                    CREATE TABLE IF NOT EXISTS saved_routes AS SELECT * FROM legacy.saved_routes;
                    CREATE TABLE IF NOT EXISTS schema_migrations AS SELECT * FROM legacy.schema_migrations;
                    "#
                );
                let _ = logbook.execute("CREATE TABLE IF NOT EXISTS user_settings AS SELECT * FROM legacy.user_settings", []);
            }
        }
        // If navdata_path doesn't exist yet, copy airport and runway tables
        if !navdata_path.exists() {
            if let Ok(navdata) = Connection::open(navdata_path) {
                let _ = navdata.execute("ATTACH DATABASE ?1 AS legacy", [&legacy_abs]);
                let _ = navdata.execute_batch(
                    r#"
                    CREATE TABLE IF NOT EXISTS airports AS SELECT * FROM legacy.airports;
                    CREATE TABLE IF NOT EXISTS runways AS SELECT * FROM legacy.runways;
                    "#
                );
            }
        }
    }
    Ok(())
}

pub fn init_database<P: AsRef<Path>>(path: P) -> Result<Connection> {
    init_database_with_resources(path.as_ref(), &[])
}

pub fn init_database_with_resources(db_path: &Path, resource_dirs: &[std::path::PathBuf]) -> Result<Connection> {
    let mut conn = Connection::open(db_path)?;

    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS flights (
            id TEXT PRIMARY KEY,
            aircraft_type TEXT NOT NULL,
            departure_icao TEXT,
            arrival_icao TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT,
            flight_time_seconds INTEGER DEFAULT 0,
            max_altitude INTEGER DEFAULT 0,
            max_ground_speed INTEGER DEFAULT 0,
            distance_flown_nm REAL DEFAULT 0.0,
            landing_rate_fpm REAL,
            status TEXT CHECK(status IN ('RECORDING', 'COMPLETED', 'DISCARDED')) DEFAULT 'RECORDING'
        );

        CREATE TABLE IF NOT EXISTS flight_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flight_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            altitude_msl REAL NOT NULL,
            altitude_agl REAL,
            indicated_airspeed REAL NOT NULL,
            ground_speed REAL NOT NULL,
            heading REAL NOT NULL,
            pitch REAL,
            bank REAL,
            vertical_speed REAL,
            is_on_ground BOOLEAN NOT NULL,
            FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS visited_airports (
            icao TEXT PRIMARY KEY,
            name TEXT,
            country_code TEXT NOT NULL,
            country_name TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            first_visited TEXT NOT NULL,
            last_visited TEXT NOT NULL,
            visit_count INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS visited_countries (
            iso_a2 TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            first_visited TEXT NOT NULL,
            last_visited TEXT NOT NULL,
            flight_count INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS airports (
            icao TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            elevation_ft INTEGER,
            country_code TEXT NOT NULL,
            country_name TEXT NOT NULL,
            municipality TEXT,
            airport_type TEXT DEFAULT 'medium_airport',
            continent TEXT DEFAULT 'EU'
        );

        CREATE INDEX IF NOT EXISTS idx_telemetry_flight_id ON flight_telemetry(flight_id);
        CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON flight_telemetry(timestamp);
        CREATE INDEX IF NOT EXISTS idx_airports_coords ON airports(latitude, longitude);
        "#,
    )?;

    // Ensure runways table exists
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS runways (
            id INTEGER PRIMARY KEY,
            airport_ident TEXT NOT NULL,
            length_ft INTEGER,
            width_ft INTEGER,
            surface TEXT,
            is_paved BOOLEAN NOT NULL DEFAULT 1,
            is_unpaved BOOLEAN NOT NULL DEFAULT 0,
            lighted BOOLEAN NOT NULL DEFAULT 0,
            closed BOOLEAN NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_runways_ident ON runways(airport_ident);
        CREATE INDEX IF NOT EXISTS idx_runways_length ON runways(length_ft);
        CREATE INDEX IF NOT EXISTS idx_runways_closed ON runways(closed);

        CREATE TABLE IF NOT EXISTS saved_routes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            aircraft_name TEXT NOT NULL,
            aircraft_category TEXT NOT NULL,
            departure_icao TEXT NOT NULL,
            arrival_icao TEXT NOT NULL,
            sector_count INTEGER NOT NULL,
            total_distance_nm REAL NOT NULL,
            total_airborne_minutes INTEGER NOT NULL,
            total_duration_minutes INTEGER NOT NULL,
            total_ground_minutes INTEGER DEFAULT 0,
            include_ground_time BOOLEAN NOT NULL DEFAULT 1,
            is_round_trip BOOLEAN NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            is_favorite BOOLEAN NOT NULL DEFAULT 0,
            sectors_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            flown_at TEXT,
            linked_flight_id TEXT,
            FOREIGN KEY (linked_flight_id) REFERENCES flights(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_saved_routes_status ON saved_routes(status);
        CREATE INDEX IF NOT EXISTS idx_saved_routes_favorite ON saved_routes(is_favorite);
        CREATE INDEX IF NOT EXISTS idx_saved_routes_dep_arr ON saved_routes(departure_icao, arrival_icao);

        CREATE TABLE IF NOT EXISTS user_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
    )?;

    // Safe migration for existing databases: ensure new columns exist first
    let _ = conn.execute("ALTER TABLE airports ADD COLUMN airport_type TEXT DEFAULT 'medium_airport'", []);
    let _ = conn.execute("ALTER TABLE airports ADD COLUMN continent TEXT", []);
    let _ = conn.execute("ALTER TABLE airports ADD COLUMN max_runway_length_ft INTEGER", []);
    let _ = conn.execute("ALTER TABLE airports ADD COLUMN max_paved_runway_length_ft INTEGER", []);
    let _ = conn.execute("ALTER TABLE airports ADD COLUMN max_unpaved_runway_length_ft INTEGER", []);
    let _ = conn.execute("ALTER TABLE airports ADD COLUMN has_paved BOOLEAN DEFAULT 1", []);
    let _ = conn.execute("ALTER TABLE airports ADD COLUMN has_unpaved BOOLEAN DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE airports ADD COLUMN all_runways_closed BOOLEAN DEFAULT 0", []);

    // Create indexes now that columns are guaranteed to exist
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_airports_type ON airports(airport_type)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_airports_continent ON airports(continent)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_airports_rwy_len ON airports(max_runway_length_ft)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_airports_rwy_paved ON airports(max_paved_runway_length_ft)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_airports_rwy_unpaved ON airports(max_unpaved_runway_length_ft)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_airports_rwy_closed ON airports(all_runways_closed)", []);

    // Correctly repair and assign continent classifications for all existing and newly migrated records
    let _ = conn.execute_batch(
        r#"
        UPDATE airports SET continent = 'NA' WHERE country_code IN ('US','CA','MX','GL','BS','CU','JM','DO','PR','CR','PA','GT','HN','NI','SV','BZ','HT','TT','BB','LC','AG','DM','GD','KN','KY','BM','TC','AW','CW','SX') OR icao GLOB '[KCM]*';
        UPDATE airports SET continent = 'SA' WHERE country_code IN ('BR','AR','CL','CO','PE','VE','EC','BO','PY','UY','GY','SR','GF','FK') OR icao GLOB 'S*';
        UPDATE airports SET continent = 'EU' WHERE country_code IN ('GB','FR','DE','IT','ES','NL','BE','CH','AT','DK','NO','SE','FI','IE','PT','GR','PL','CZ','HU','TR','RO','BG','HR','UA','IS','EE','LT','LU','LV','MT','SI','SK','AL','BA','ME','MK','RS','MD','BY','FO','GI','GG','IM','JE','MC','SM','VA','AD','LI','XK','CY') OR icao GLOB '[ELB]*';
        UPDATE airports SET continent = 'AS' WHERE country_code IN ('AE','QA','SA','JP','KR','HK','SG','TH','MY','ID','IN','CN','TW','VN','PH','IL','IR','IQ','OM','KW','BH','JO','LB','SY','YE','PK','BD','LK','NP','MM','KH','LA','MN','KZ','UZ','KG','TJ','TM','AZ','GE','AM','MO','BN','MV') OR icao GLOB '[ORVWZU]*';
        UPDATE airports SET continent = 'OC' WHERE country_code IN ('AU','NZ','FJ','PG','NC','PF','SB','VU','WS','TO','KI','TV','NR','FM','MH','PW','GU','MP','AS','CK','NU','WF') OR icao GLOB '[YN]*';
        UPDATE airports SET continent = 'AF' WHERE country_code IN ('ZA','EG','MA','KE','NG','GH','ET','TZ','UG','DZ','TN','SN','CI','AO','CM','CD','CG','GA','GQ','ST','BJ','BF','CV','GM','GN','GW','LR','ML','MR','NE','SL','TG','BI','DJ','ER','RW','SC','SO','SS','SD','KM','MG','MU','MW','MZ','ZM','ZW','BW','LS','NA','SZ') OR icao GLOB '[FDGH]*';
        "#
    );

    // Ensure all helipads, heliports, and other non-standard facilities are purged from airports table
    let _ = conn.execute_batch(
        r#"
        DELETE FROM airports WHERE airport_type IN ('heliport', 'helipad', 'closed', 'seaplane_base', 'balloonport')
            OR airport_type LIKE '%heli%'
            OR airport_type LIKE '%pad%'
            OR LOWER(name) LIKE '%heliport%'
            OR LOWER(name) LIKE '%helipad%'
            OR LOWER(name) LIKE '%helistop%';
        "#
    );

    // One-time migration: Fix latitude scaling for existing telemetry records
    // (Corrects 10007000.0 offset denominator typo to official FSUIPC 10001750.0)
    let _ = conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );
        "#
    );
    let already_run: bool = conn
        .query_row(
            "SELECT 1 FROM schema_migrations WHERE version = 'fix_fsuipc_latitude_scaling'",
            [],
            |_| Ok(()),
        )
        .is_ok();
    if !already_run {
        let scale_factor = 10007000.0 / 10001750.0;
        let _ = conn.execute(
            "UPDATE flight_telemetry SET latitude = latitude * ?1",
            [scale_factor],
        );
        let _ = conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES ('fix_fsuipc_latitude_scaling', datetime('now'))",
            [],
        );
    }

    // Auto-seed or import OurAirports data
    seed_or_import_airports(&mut conn, resource_dirs)?;

    // One-time backfill: calculate and store distance for any historical flights with 0 distance
    {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, departure_icao, arrival_icao FROM flights WHERE distance_flown_nm IS NULL OR distance_flown_nm <= 0.0",
        ) {
            let uncalculated_flights: Vec<(String, Option<String>, Option<String>)> = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
                .map(|mapped| mapped.filter_map(|r| r.ok()).collect())
                .unwrap_or_default();
            drop(stmt);

            for (fl_id, dep, arr) in uncalculated_flights {
                if let Ok(dist) = calculate_flight_distance(&conn, &fl_id, dep.as_deref(), arr.as_deref()) {
                    if dist > 0.0 {
                        let _ = conn.execute(
                            "UPDATE flights SET distance_flown_nm = ?1 WHERE id = ?2",
                            params![dist, fl_id],
                        );
                    }
                }
            }
        }
    }

    // One-time backfill: recompute visited statistics with strict deduplication (Issue #4)
    {
        let already_recomputed: bool = conn
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = 'recompute_visited_deduplication_v1'",
                [],
                |_| Ok(()),
            )
            .is_ok();
        if !already_recomputed {
            let _ = recompute_visited_stats(&conn);
            let _ = conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES ('recompute_visited_deduplication_v1', datetime('now'))",
                [],
            );
        }
    }

    Ok(conn)
}

fn seed_or_import_airports(conn: &mut Connection, resource_dirs: &[std::path::PathBuf]) -> Result<()> {
    let apt_count: i64 = conn.query_row("SELECT COUNT(*) FROM airports", [], |row| row.get(0)).unwrap_or(0);
    let rwy_count: i64 = conn.query_row("SELECT COUNT(*) FROM runways", [], |row| row.get(0)).unwrap_or(0);

    // Check if OurAirports CSV files exist in the app workspace, resources, or data directory
    let mut candidate_dirs: Vec<std::path::PathBuf> = Vec::new();
    for d in resource_dirs {
        candidate_dirs.push(d.clone());
    }
    candidate_dirs.push(std::path::PathBuf::from("data"));
    candidate_dirs.push(std::path::PathBuf::from("../data"));
    candidate_dirs.push(std::path::PathBuf::from("src-tauri/data"));
    candidate_dirs.push(std::path::PathBuf::from("src-tauri"));
    candidate_dirs.push(std::path::PathBuf::from("."));

    for dir in candidate_dirs {
        let apt_file = dir.join("airports.csv");
        let ctry_file = dir.join("countries.csv");
        let rwy_file = dir.join("runways.csv");

        if !cfg!(test) && apt_file.exists() && ctry_file.exists() {
            if apt_count < 500 {
                log::info!("Found OurAirports CSV files at {:?}, importing into aerotrack.db...", dir);
                if let Ok(imported) = import_ourairports_files(conn, &apt_file, &ctry_file) {
                    log::info!("Successfully imported {} airports from OurAirports CSV dataset.", imported);
                }
            }
            if rwy_file.exists() && (rwy_count == 0 || apt_count < 500) {
                if let Ok(imported_rwys) = import_runways_file(conn, &rwy_file) {
                    log::info!("Successfully imported {} runways from OurAirports.", imported_rwys);
                }
            }
            let total_now: i64 = conn.query_row("SELECT COUNT(*) FROM airports", [], |row| row.get(0)).unwrap_or(0);
            if total_now >= 500 {
                return Ok(());
            }
        }
    }

    // Fallback seed of top international hubs
    seed_fallback_airports(conn)?;
    Ok(())
}

pub fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_quotes && chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = !in_quotes;
                }
            }
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current = String::new();
            }
            _ => {
                current.push(c);
            }
        }
    }
    fields.push(current.trim().to_string());
    fields
}

pub fn import_ourairports_files<P: AsRef<Path>>(
    conn: &mut Connection,
    airports_path: P,
    countries_path: P,
) -> Result<usize> {
    import_ourairports_files_with_progress(conn, airports_path, countries_path, |_| {})
}

pub fn import_ourairports_files_with_progress<P: AsRef<Path>, F: FnMut(usize)>(
    conn: &mut Connection,
    airports_path: P,
    countries_path: P,
    mut on_batch: F,
) -> Result<usize> {
    // 1. Build countries map (ISO_A2 -> Full Name)
    let mut countries_map: HashMap<String, String> = HashMap::new();
    if let Ok(file) = File::open(countries_path) {
        let reader = BufReader::new(file);
        for (idx, line) in reader.lines().enumerate() {
            if idx == 0 {
                continue; // Skip header
            }
            if let Ok(l) = line {
                let cols = parse_csv_line(&l);
                if cols.len() >= 3 {
                    let code = cols[1].to_uppercase();
                    let name = cols[2].clone();
                    if !code.is_empty() && !name.is_empty() {
                        countries_map.insert(code, name);
                    }
                }
            }
        }
    }

    // 2. Stream airports into chunked SQLite transactions of 5,000 items
    let airports_file = File::open(airports_path)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let reader = BufReader::new(airports_file);

    let is_valid_icao = |s: &str| s.len() == 4 && s.chars().all(|c| c.is_ascii_alphabetic());

    let mut imported = 0usize;
    let mut batch_count = 0usize;
    const BATCH_SIZE: usize = 5000;

    let mut tx = conn.transaction()?;

    for (idx, line) in reader.lines().enumerate() {
        if idx == 0 {
            continue; // Skip header
        }
        let l = match line {
            Ok(s) => s,
            Err(_) => continue,
        };

        let cols = parse_csv_line(&l);
        if cols.len() < 11 {
            continue;
        }

        let apt_type = cols[2].trim().to_lowercase();
        let name = &cols[3];
        let name_lower = name.to_lowercase();

        // Strictly exclude closed facilities, helipads, heliports, seaplane bases, and balloonports
        if apt_type == "closed"
            || apt_type == "heliport"
            || apt_type == "helipad"
            || apt_type.contains("heli")
            || apt_type.contains("pad")
            || apt_type == "seaplane_base"
            || apt_type == "balloonport"
            || name_lower.contains("heliport")
            || name_lower.contains("helipad")
            || name_lower.contains("helistop")
        {
            continue;
        }

        let ident = cols[1].trim();
        if ident.is_empty() {
            continue;
        }

        // Strictly require official 4-letter alphabetic ICAO aerodrome designators (e.g. LOWI, EDDM, KJFK)
        let icao = if cols.len() > 12 && is_valid_icao(cols[12].trim()) {
            cols[12].trim().to_uppercase()
        } else if is_valid_icao(ident) {
            ident.to_uppercase()
        } else {
            // Not an official 4-letter ICAO airfield (e.g. PT-02313, 00AA, regional local codes), skip
            continue;
        };

        let lat: f64 = match cols[4].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };
        let lon: f64 = match cols[5].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };

        let ele: Option<i32> = cols[6].parse().ok();
        let country_code = cols[8].to_uppercase();
        let country_name = countries_map
            .get(&country_code)
            .cloned()
            .unwrap_or_else(|| country_code.clone());
        let municipality = if !cols[10].is_empty() {
            Some(cols[10].clone())
        } else {
            None
        };
        let continent = if cols.len() > 7 && !cols[7].is_empty() {
            cols[7].trim()
        } else {
            "NA"
        };

        tx.execute(
            "INSERT OR REPLACE INTO airports (
                icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                icao,
                name,
                lat,
                lon,
                ele,
                country_code,
                country_name,
                municipality,
                apt_type,
                continent
            ],
        )?;

        imported += 1;
        batch_count += 1;

        if batch_count >= BATCH_SIZE {
            tx.commit()?;
            on_batch(imported);
            std::thread::yield_now();
            tx = conn.transaction()?;
            batch_count = 0;
        }
    }

    if batch_count > 0 {
        tx.commit()?;
        on_batch(imported);
    } else {
        drop(tx);
    }

    Ok(imported)
}

pub fn is_paved_surface(surface: &str) -> bool {
    let s = surface.to_uppercase();
    s.contains("ASP") || s.contains("CON") || s.contains("BIT") 
       || s.contains("TAR") || s.contains("PEM") || s.contains("MAC") 
       || s.contains("PAVED") || s.contains("BRICK")
}

pub fn is_unpaved_surface(surface: &str) -> bool {
    let s = surface.to_uppercase();
    s.contains("TURF") || s.contains("GRS") || s.contains("GRASS") 
       || s.contains("DIRT") || s.contains("GRAVEL") || s.contains("GRVL") 
       || s.contains("GVL") || s.contains("EARTH") || s.contains("SAND") 
       || s.contains("CLAY") || s.contains("SOD") || s.contains("LATE") 
       || s.contains("CORAL") || s.contains("UNPAVED")
}

pub fn import_runways_file<P: AsRef<Path>>(conn: &mut Connection, runways_path: P) -> Result<usize> {
    import_runways_file_with_progress(conn, runways_path, |_| {})
}

pub fn import_runways_file_with_progress<P: AsRef<Path>, F: FnMut(usize)>(
    conn: &mut Connection,
    runways_path: P,
    mut on_batch: F,
) -> Result<usize> {
    let file = File::open(runways_path).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let reader = BufReader::new(file);

    let is_valid_icao = |s: &str| s.len() == 4 && s.chars().all(|c| c.is_ascii_alphabetic());

    let mut imported = 0usize;
    let mut batch_count = 0usize;
    const BATCH_SIZE: usize = 5000;

    let mut tx = conn.transaction()?;

    for (idx, line) in reader.lines().enumerate() {
        if idx == 0 {
            continue; // Skip header
        }
        let l = match line {
            Ok(s) => s,
            Err(_) => continue,
        };

        let cols = parse_csv_line(&l);
        if cols.len() < 8 {
            continue;
        }

        let ident = cols[2].trim().to_uppercase();
        if !is_valid_icao(&ident) {
            continue;
        }

        let id: Option<i64> = cols[0].parse().ok();
        let length_ft: Option<i32> = cols[3].parse().ok();
        let width_ft: Option<i32> = cols[4].parse().ok();
        let surface = cols[5].trim().to_uppercase();
        let lighted: bool = cols[6].trim() == "1";
        let closed: bool = cols[7].trim() == "1";

        let is_paved = is_paved_surface(&surface);
        let is_unpaved = is_unpaved_surface(&surface) || (!is_paved && surface != "WATER");

        tx.execute(
            "INSERT OR REPLACE INTO runways (
                id, airport_ident, length_ft, width_ft, surface, is_paved, is_unpaved, lighted, closed
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                ident,
                length_ft,
                width_ft,
                surface,
                is_paved,
                is_unpaved,
                lighted,
                closed
            ],
        )?;

        imported += 1;
        batch_count += 1;

        if batch_count >= BATCH_SIZE {
            tx.commit()?;
            on_batch(imported);
            std::thread::yield_now();
            tx = conn.transaction()?;
            batch_count = 0;
        }
    }

    if batch_count > 0 {
        tx.commit()?;
        on_batch(imported);
    } else {
        drop(tx);
    }

    // Update airport summary metrics
    conn.execute_batch(
        r#"
        UPDATE airports SET
            max_runway_length_ft = (
                SELECT MAX(length_ft) FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0
            ),
            max_paved_runway_length_ft = (
                SELECT MAX(length_ft) FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0 AND runways.is_paved = 1
            ),
            max_unpaved_runway_length_ft = (
                SELECT MAX(length_ft) FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0 AND runways.is_unpaved = 1
            ),
            has_paved = EXISTS (
                SELECT 1 FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0 AND runways.is_paved = 1
            ),
            has_unpaved = EXISTS (
                SELECT 1 FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0 AND runways.is_unpaved = 1
            ),
            all_runways_closed = CASE
                WHEN EXISTS (SELECT 1 FROM runways WHERE runways.airport_ident = airports.icao)
                 AND NOT EXISTS (SELECT 1 FROM runways WHERE runways.airport_ident = airports.icao AND runways.closed = 0)
                THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM runways WHERE runways.airport_ident = airports.icao);
        "#
    )?;

    Ok(imported)
}

pub fn sync_ourairports_data<F>(
    conn: &mut Connection,
    work_dir: &Path,
    on_progress: F,
) -> Result<OurAirportsSyncResult, String>
where
    F: Fn(OurAirportsSyncProgress),
{
    let airports_path = work_dir.join("airports.csv");
    let countries_path = work_dir.join("countries.csv");
    let runways_path = work_dir.join("runways.csv");

    let curl_bin = if cfg!(windows) { "curl.exe" } else { "curl" };

    on_progress(OurAirportsSyncProgress {
        stage: "downloading".to_string(),
        percent: 5,
        message: "Fetching countries dataset from OurAirports...".to_string(),
    });

    let mut cmd1 = std::process::Command::new(curl_bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd1.creation_flags(0x08000000);
    }
    let _ = cmd1
        .args(["-L", "-s", "-o", countries_path.to_str().unwrap(), "https://davidmegginson.github.io/ourairports-data/countries.csv"])
        .status();

    on_progress(OurAirportsSyncProgress {
        stage: "downloading".to_string(),
        percent: 25,
        message: "Fetching runways dataset...".to_string(),
    });

    let mut cmd2 = std::process::Command::new(curl_bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd2.creation_flags(0x08000000);
    }
    let _ = cmd2
        .args(["-L", "-s", "-o", runways_path.to_str().unwrap(), "https://davidmegginson.github.io/ourairports-data/runways.csv"])
        .status();

    on_progress(OurAirportsSyncProgress {
        stage: "downloading".to_string(),
        percent: 50,
        message: "Fetching global airports dataset (13MB)...".to_string(),
    });

    let mut cmd3 = std::process::Command::new(curl_bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd3.creation_flags(0x08000000);
    }
    let status = cmd3
        .args(["-L", "-s", "-o", airports_path.to_str().unwrap(), "https://davidmegginson.github.io/ourairports-data/airports.csv"])
        .status()
        .map_err(|e| format!("Failed to download OurAirports data: {}", e))?;

    if !status.success() {
        return Err("curl failed to download OurAirports data. Please check your internet connection.".to_string());
    }

    on_progress(OurAirportsSyncProgress {
        stage: "importing".to_string(),
        percent: 65,
        message: "Parsing & indexing aerodromes into SQLite in batches...".to_string(),
    });

    let apt_count = import_ourairports_files_with_progress(conn, &airports_path, &countries_path, |imported| {
        let pct = 65 + ((imported as f32 / 80000.0) * 15.0).min(15.0) as u32;
        on_progress(OurAirportsSyncProgress {
            stage: "importing".to_string(),
            percent: pct,
            message: format!("Indexed {} aerodromes...", imported),
        });
    }).map_err(|e| format!("Failed to parse OurAirports airports file: {}", e))?;

    on_progress(OurAirportsSyncProgress {
        stage: "importing".to_string(),
        percent: 82,
        message: "Parsing & indexing runway dimensions and surface data in batches...".to_string(),
    });

    let rwy_count = if runways_path.exists() {
        import_runways_file_with_progress(conn, &runways_path, |imported| {
            let pct = 82 + ((imported as f32 / 45000.0) * 10.0).min(10.0) as u32;
            on_progress(OurAirportsSyncProgress {
                stage: "importing".to_string(),
                percent: pct,
                message: format!("Indexed {} runways...", imported),
            });
        }).map_err(|e| format!("Failed to parse OurAirports runways file: {}", e))?
    } else {
        0
    };

    // Clean up temporary downloaded CSV files now that SQLite indexing is complete
    let _ = std::fs::remove_file(&airports_path);
    let _ = std::fs::remove_file(&countries_path);
    let _ = std::fs::remove_file(&runways_path);

    on_progress(OurAirportsSyncProgress {
        stage: "complete".to_string(),
        percent: 100,
        message: format!("Successfully synced and indexed {} airports and {} runways from OurAirports.", apt_count, rwy_count),
    });

    Ok(OurAirportsSyncResult {
        success: true,
        total_airports: apt_count,
        message: format!("Successfully synced and indexed {} airports and {} runways from OurAirports.", apt_count, rwy_count),
    })
}

pub fn get_airports_count(conn: &Connection) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM airports 
         WHERE airport_type IN ('large_airport', 'medium_airport', 'small_airport')
           AND airport_type NOT IN ('heliport', 'helipad')
           AND airport_type NOT LIKE '%heli%'
           AND airport_type NOT LIKE '%pad%'
           AND LOWER(name) NOT LIKE '%heliport%'
           AND LOWER(name) NOT LIKE '%helipad%'
           AND LOWER(name) NOT LIKE '%helistop%'",
        [],
        |row| row.get(0),
    )
}

fn seed_fallback_airports(conn: &Connection) -> Result<()> {
    let seed_data: &[(&str, &str, f64, f64, i32, &str, &str, &str, &str, &str)] = &[
        // Europe - Hubs & International
        ("LOWI", "Innsbruck Kranebitten Airport", 47.2602, 11.3440, 1906, "AT", "Austria", "Innsbruck", "medium_airport", "EU"),
        ("LOWS", "Salzburg Airport W. A. Mozart", 47.7944, 13.0044, 1411, "AT", "Austria", "Salzburg", "medium_airport", "EU"),
        ("LOWW", "Vienna International Airport", 48.1103, 16.5697, 600, "AT", "Austria", "Vienna", "large_airport", "EU"),
        ("EDDM", "Munich Franz Josef Strauss Airport", 48.3538, 11.7861, 1487, "DE", "Germany", "Munich", "large_airport", "EU"),
        ("EDDF", "Frankfurt am Main Airport", 50.0379, 8.5622, 364, "DE", "Germany", "Frankfurt", "large_airport", "EU"),
        ("EDDB", "Berlin Brandenburg Airport", 52.3667, 13.5033, 157, "DE", "Germany", "Berlin", "large_airport", "EU"),
        ("EDDS", "Stuttgart Airport", 48.6899, 9.2219, 1276, "DE", "Germany", "Stuttgart", "medium_airport", "EU"),
        ("EDDN", "Nuremberg Airport", 49.4987, 11.0780, 1046, "DE", "Germany", "Nuremberg", "medium_airport", "EU"),
        ("EDMA", "Augsburg Airport", 48.4253, 10.9317, 1515, "DE", "Germany", "Augsburg", "small_airport", "EU"),
        ("LOIK", "Kufstein-Langkampfen Airfield", 47.5333, 12.1167, 1600, "AT", "Austria", "Kufstein", "small_airport", "EU"),
        ("EGLL", "London Heathrow Airport", 51.4700, -0.4543, 83, "GB", "United Kingdom", "London", "large_airport", "EU"),
        ("EGKK", "London Gatwick Airport", 51.1481, -0.1903, 202, "GB", "United Kingdom", "London", "large_airport", "EU"),
        ("EGPH", "Edinburgh Airport", 55.9500, -3.3725, 135, "GB", "United Kingdom", "Edinburgh", "medium_airport", "EU"),
        ("EGTR", "Elstree Aerodrome", 51.6558, -0.3256, 332, "GB", "United Kingdom", "London/Elstree", "small_airport", "EU"),
        ("LFPG", "Paris Charles de Gaulle Airport", 49.0097, 2.5479, 392, "FR", "France", "Paris", "large_airport", "EU"),
        ("LFMN", "Nice Côte d'Azur Airport", 43.6653, 7.2150, 12, "FR", "France", "Nice", "large_airport", "EU"),
        ("LFRS", "Nantes Atlantique Airport", 47.1532, -1.6107, 90, "FR", "France", "Nantes", "medium_airport", "EU"),
        ("LFLJ", "Courchevel Altiport", 45.3967, 6.6347, 6588, "FR", "France", "Courchevel", "small_airport", "EU"),
        ("EHAM", "Amsterdam Airport Schiphol", 52.3086, 4.7639, -11, "NL", "Netherlands", "Amsterdam", "large_airport", "EU"),
        ("LSZH", "Zurich Airport", 47.4647, 8.5492, 1416, "CH", "Switzerland", "Zurich", "large_airport", "EU"),
        ("LSGG", "Geneva Airport", 46.2381, 6.1089, 1411, "CH", "Switzerland", "Geneva", "large_airport", "EU"),
        ("LEMD", "Adolfo Suárez Madrid–Barajas Airport", 40.4719, -3.5626, 2001, "ES", "Spain", "Madrid", "large_airport", "EU"),
        ("LEBL", "Josep Tarradellas Barcelona-El Prat", 41.2974, 2.0785, 14, "ES", "Spain", "Barcelona", "large_airport", "EU"),
        ("LIRF", "Rome Leonardo da Vinci–Fiumicino", 41.8003, 12.2389, 15, "IT", "Italy", "Rome", "large_airport", "EU"),
        ("LIMC", "Milan Malpensa Airport", 45.6306, 8.7281, 768, "IT", "Italy", "Milan", "large_airport", "EU"),
        ("EBBR", "Brussels Airport", 50.9014, 4.4844, 184, "BE", "Belgium", "Brussels", "large_airport", "EU"),
        ("EKCH", "Copenhagen Kastrup Airport", 55.6180, 12.6508, 17, "DK", "Denmark", "Copenhagen", "large_airport", "EU"),
        ("ENGM", "Oslo Airport Gardermoen", 60.1976, 11.1004, 681, "NO", "Norway", "Oslo", "large_airport", "EU"),
        ("ESSA", "Stockholm Arlanda Airport", 59.6519, 17.9186, 137, "SE", "Sweden", "Stockholm", "large_airport", "EU"),
        ("EFHK", "Helsinki-Vantaa Airport", 60.3172, 24.9633, 179, "FI", "Finland", "Helsinki", "large_airport", "EU"),
        ("LPPT", "Humberto Delgado Airport (Lisbon)", 38.7756, -9.1354, 374, "PT", "Portugal", "Lisbon", "large_airport", "EU"),
        ("LGAV", "Athens Eleftherios Venizelos", 37.9364, 23.9445, 308, "GR", "Greece", "Athens", "large_airport", "EU"),
        ("EPWA", "Warsaw Chopin Airport", 52.1657, 20.9671, 362, "PL", "Poland", "Warsaw", "large_airport", "EU"),
        ("LKPR", "Václav Havel Airport Prague", 50.1008, 14.2600, 1247, "CZ", "Czech Republic", "Prague", "large_airport", "EU"),
        ("LHBP", "Budapest Ferenc Liszt", 47.4369, 19.2556, 495, "HU", "Hungary", "Budapest", "large_airport", "EU"),
        ("LTFM", "Istanbul Airport", 41.2753, 28.7519, 325, "TR", "Turkey", "Istanbul", "large_airport", "EU"),
        ("EIDW", "Dublin Airport", 53.4213, -6.2701, 242, "IE", "Ireland", "Dublin", "large_airport", "EU"),

        // North America
        ("KJFK", "John F. Kennedy International Airport", 40.6413, -73.7781, 13, "US", "United States", "New York", "large_airport", "NA"),
        ("KLGA", "LaGuardia Airport", 40.7769, -73.8740, 21, "US", "United States", "New York", "large_airport", "NA"),
        ("KEWR", "Newark Liberty International", 40.6895, -74.1745, 18, "US", "United States", "Newark", "large_airport", "NA"),
        ("KLAX", "Los Angeles International Airport", 33.9425, -118.4081, 128, "US", "United States", "Los Angeles", "large_airport", "NA"),
        ("KSFO", "San Francisco International Airport", 37.6213, -122.3790, 13, "US", "United States", "San Francisco", "large_airport", "NA"),
        ("KORD", "O'Hare International Airport", 41.9742, -87.9073, 672, "US", "United States", "Chicago", "large_airport", "NA"),
        ("KATL", "Hartsfield-Jackson Atlanta", 33.6407, -84.4277, 1026, "US", "United States", "Atlanta", "large_airport", "NA"),
        ("KDFW", "Dallas/Fort Worth International", 32.8998, -97.0403, 607, "US", "United States", "Dallas", "large_airport", "NA"),
        ("KMIA", "Miami International Airport", 25.7959, -80.2870, 8, "US", "United States", "Miami", "large_airport", "NA"),
        ("KBOS", "Boston Logan International", 42.3656, -71.0096, 20, "US", "United States", "Boston", "large_airport", "NA"),
        ("KSEA", "Seattle-Tacoma International", 47.4502, -122.3088, 433, "US", "United States", "Seattle", "large_airport", "NA"),
        ("KDEN", "Denver International Airport", 39.8561, -104.6737, 5431, "US", "United States", "Denver", "large_airport", "NA"),
        ("KLAS", "Harry Reid International Airport", 36.0840, -115.1537, 2181, "US", "United States", "Las Vegas", "large_airport", "NA"),
        ("PHNL", "Daniel K. Inouye International (Honolulu)", 21.3187, -157.9224, 13, "US", "United States", "Honolulu", "large_airport", "NA"),
        ("PANC", "Ted Stevens Anchorage International", 61.1743, -149.9962, 151, "US", "United States", "Anchorage", "large_airport", "NA"),
        ("KSNA", "John Wayne Airport", 33.6757, -117.8682, 56, "US", "United States", "Santa Ana", "medium_airport", "NA"),
        ("KBUR", "Hollywood Burbank Airport", 34.2007, -118.3587, 778, "US", "United States", "Burbank", "medium_airport", "NA"),
        ("KSQL", "San Carlos Airport", 37.5119, -122.2494, 5, "US", "United States", "San Carlos", "small_airport", "NA"),
        ("KSMO", "Santa Monica Municipal Airport", 34.0158, -118.4513, 177, "US", "United States", "Santa Monica", "small_airport", "NA"),
        ("KTRK", "Truckee Tahoe Airport", 39.3200, -120.1396, 5901, "US", "United States", "Truckee", "small_airport", "NA"),
        ("CYYZ", "Toronto Pearson International", 43.6777, -79.6248, 569, "CA", "Canada", "Toronto", "large_airport", "NA"),
        ("CYVR", "Vancouver International Airport", 49.1967, -123.1815, 14, "CA", "Canada", "Vancouver", "large_airport", "NA"),
        ("CYUL", "Montréal-Trudeau International", 45.4706, -73.7408, 118, "CA", "Canada", "Montreal", "large_airport", "NA"),
        ("MMMX", "Mexico City International", 19.4363, -99.0721, 7316, "MX", "Mexico", "Mexico City", "large_airport", "NA"),
        ("MMUN", "Cancún International Airport", 21.0365, -86.8771, 20, "MX", "Mexico", "Cancun", "large_airport", "NA"),

        // Asia & Middle East
        ("OMDB", "Dubai International Airport", 25.2532, 55.3657, 62, "AE", "United Arab Emirates", "Dubai", "large_airport", "AS"),
        ("OMAA", "Zayed International Airport (Abu Dhabi)", 24.4330, 54.6511, 88, "AE", "United Arab Emirates", "Abu Dhabi", "large_airport", "AS"),
        ("OTHH", "Hamad International Airport", 25.2731, 51.6081, 13, "QA", "Qatar", "Doha", "large_airport", "AS"),
        ("OERK", "King Khalid International Airport", 24.9576, 46.6988, 2049, "SA", "Saudi Arabia", "Riyadh", "large_airport", "AS"),
        ("RJTT", "Tokyo Haneda Airport", 35.5494, 139.7798, 21, "JP", "Japan", "Tokyo", "large_airport", "AS"),
        ("RJAA", "Narita International Airport", 35.7647, 140.3863, 141, "JP", "Japan", "Tokyo", "large_airport", "AS"),
        ("RKSI", "Incheon International Airport", 37.4602, 126.4407, 23, "KR", "South Korea", "Seoul", "large_airport", "AS"),
        ("VHHH", "Hong Kong International Airport", 22.3080, 113.9185, 28, "HK", "Hong Kong", "Hong Kong", "large_airport", "AS"),
        ("WSSS", "Singapore Changi Airport", 1.3644, 103.9915, 22, "SG", "Singapore", "Singapore", "large_airport", "AS"),
        ("VTBS", "Suvarnabhumi Airport (Bangkok)", 13.6900, 100.7501, 5, "TH", "Thailand", "Bangkok", "large_airport", "AS"),
        ("WMKK", "Kuala Lumpur International Airport", 2.7456, 101.7072, 69, "MY", "Malaysia", "Kuala Lumpur", "large_airport", "AS"),
        ("WIII", "Soekarno-Hatta International", -6.1256, 106.6559, 34, "ID", "Indonesia", "Jakarta", "large_airport", "AS"),
        ("VIDP", "Indira Gandhi International (Delhi)", 28.5562, 77.1000, 777, "IN", "India", "Delhi", "large_airport", "AS"),
        ("VABB", "Chhatrapati Shivaji Maharaj (Mumbai)", 19.0896, 72.8656, 39, "IN", "India", "Mumbai", "large_airport", "AS"),
        ("ZBAA", "Beijing Capital International", 40.0799, 116.6031, 116, "CN", "China", "Beijing", "large_airport", "AS"),
        ("ZSPD", "Shanghai Pudong International", 31.1443, 121.8083, 13, "CN", "China", "Shanghai", "large_airport", "AS"),
        ("RCTP", "Taiwan Taoyuan International", 25.0797, 121.2342, 106, "TW", "Taiwan", "Taipei", "large_airport", "AS"),

        // Oceania
        ("YSSY", "Sydney Kingsford Smith Airport", -33.9399, 151.1753, 21, "AU", "Australia", "Sydney", "large_airport", "OC"),
        ("YMML", "Melbourne Airport", -37.6690, 144.8410, 434, "AU", "Australia", "Melbourne", "large_airport", "OC"),
        ("YBBN", "Brisbane Airport", -27.3842, 153.1175, 13, "AU", "Australia", "Brisbane", "large_airport", "OC"),
        ("NZAA", "Auckland Airport", -37.0082, 174.7850, 23, "NZ", "New Zealand", "Auckland", "large_airport", "OC"),
        ("NZWN", "Wellington International Airport", -41.3272, 174.8053, 41, "NZ", "New Zealand", "Wellington", "large_airport", "OC"),

        // South America
        ("SBGR", "São Paulo/Guarulhos International", -23.4356, -46.4731, 2461, "BR", "Brazil", "Sao Paulo", "large_airport", "SA"),
        ("SBGL", "Rio de Janeiro/Galeão International", -22.8089, -43.2436, 28, "BR", "Brazil", "Rio de Janeiro", "large_airport", "SA"),
        ("SAEZ", "Ezeiza International (Buenos Aires)", -34.8222, -58.5358, 67, "AR", "Argentina", "Buenos Aires", "large_airport", "SA"),
        ("SCEL", "Arturo Merino Benítez (Santiago)", -33.3930, -70.7858, 1555, "CL", "Chile", "Santiago", "large_airport", "SA"),
        ("SKBO", "El Dorado International (Bogotá)", 4.7016, -74.1469, 8361, "CO", "Colombia", "Bogota", "large_airport", "SA"),
        ("SPJC", "Jorge Chávez International (Lima)", -12.0219, -77.1143, 113, "PE", "Peru", "Lima", "large_airport", "SA"),

        // Africa
        ("FACT", "Cape Town International Airport", -33.9715, 18.6021, 151, "ZA", "South Africa", "Cape Town", "large_airport", "AF"),
        ("FAOR", "O.R. Tambo International (Johannesburg)", -26.1367, 28.2411, 5558, "ZA", "South Africa", "Johannesburg", "large_airport", "AF"),
        ("HECA", "Cairo International Airport", 30.1219, 31.4056, 382, "EG", "Egypt", "Cairo", "large_airport", "AF"),
        ("GMMN", "Mohammed V International (Casablanca)", 33.3675, -7.5899, 656, "MA", "Morocco", "Casablanca", "large_airport", "AF"),
        ("HKJK", "Jomo Kenyatta International (Nairobi)", -1.3192, 36.9275, 5327, "KE", "Kenya", "Nairobi", "large_airport", "AF"),
    ];

    let mut stmt = conn.prepare(
        "INSERT INTO airports (icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(icao) DO UPDATE SET
            name=excluded.name,
            latitude=excluded.latitude,
            longitude=excluded.longitude,
            elevation_ft=excluded.elevation_ft,
            country_code=excluded.country_code,
            country_name=excluded.country_name,
            municipality=excluded.municipality,
            airport_type=excluded.airport_type,
            continent=excluded.continent"
    )?;

    for a in seed_data {
        stmt.execute(params![a.0, a.1, a.2, a.3, a.4, a.5, a.6, a.7, a.8, a.9])?;
    }

    // Seed default runway data for fallback hubs if runways table is empty
    let rwy_count: i64 = conn.query_row("SELECT COUNT(*) FROM runways", [], |row| row.get(0)).unwrap_or(0);
    if rwy_count == 0 {
        let _ = conn.execute_batch(
            r#"
            UPDATE airports SET
                max_runway_length_ft = CASE
                    WHEN icao = 'LOWI' THEN 6562
                    WHEN icao = 'LOWS' THEN 9022
                    WHEN icao = 'EDMA' THEN 4921
                    WHEN icao = 'LOIK' THEN 2198
                    WHEN icao = 'LOIH' THEN 2067
                    WHEN icao = 'EGTR' THEN 2400
                    WHEN icao = 'LFLJ' THEN 1762
                    WHEN icao = 'KSQL' THEN 2600
                    WHEN icao = 'KSMO' THEN 3500
                    WHEN icao = 'KTRK' THEN 7000
                    WHEN airport_type = 'large_airport' THEN 12000
                    WHEN airport_type = 'medium_airport' THEN 7500
                    ELSE 2500
                END,
                max_paved_runway_length_ft = CASE
                    WHEN icao = 'LOIK' THEN NULL
                    WHEN icao = 'LOWI' THEN 6562
                    WHEN icao = 'LOWS' THEN 9022
                    WHEN icao = 'EDMA' THEN 4921
                    WHEN icao = 'LOIH' THEN 2067
                    WHEN icao = 'EGTR' THEN 2400
                    WHEN icao = 'LFLJ' THEN 1762
                    WHEN icao = 'KSQL' THEN 2600
                    WHEN icao = 'KSMO' THEN 3500
                    WHEN icao = 'KTRK' THEN 7000
                    WHEN airport_type = 'large_airport' THEN 12000
                    WHEN airport_type = 'medium_airport' THEN 7500
                    ELSE NULL
                END,
                max_unpaved_runway_length_ft = CASE
                    WHEN icao IN ('LOIK', 'LOIH', 'EDMA', 'EGTR') THEN 2100
                    WHEN airport_type = 'small_airport' THEN 2200
                    ELSE NULL
                END,
                has_paved = CASE WHEN icao = 'LOIK' THEN 0 ELSE 1 END,
                has_unpaved = CASE WHEN icao IN ('LOIK', 'LOIH', 'EDMA', 'EGTR') OR airport_type = 'small_airport' THEN 1 ELSE 0 END,
                all_runways_closed = 0
            WHERE max_runway_length_ft IS NULL;
            "#
        );
    }

    Ok(())
}

pub fn get_flights(conn: &Connection) -> Result<Vec<FlightRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, aircraft_type, departure_icao, arrival_icao, start_time, end_time,
                flight_time_seconds, max_altitude, max_ground_speed, distance_flown_nm,
                landing_rate_fpm, status
         FROM flights
         ORDER BY start_time DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(FlightRecord {
            id: row.get(0)?,
            aircraft_type: row.get(1)?,
            departure_icao: row.get(2)?,
            arrival_icao: row.get(3)?,
            start_time: row.get(4)?,
            end_time: row.get(5)?,
            flight_time_seconds: row.get(6)?,
            max_altitude: row.get(7)?,
            max_ground_speed: row.get(8)?,
            distance_flown_nm: row.get(9)?,
            landing_rate_fpm: row.get(10)?,
            status: row.get(11)?,
        })
    })?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    drop(stmt);

    for flight in &mut result {
        if flight.distance_flown_nm <= 0.0 {
            if let Ok(dist) = calculate_flight_distance(
                conn,
                &flight.id,
                flight.departure_icao.as_deref(),
                flight.arrival_icao.as_deref(),
            ) {
                if dist > 0.0 {
                    flight.distance_flown_nm = dist;
                    let _ = conn.execute(
                        "UPDATE flights SET distance_flown_nm = ?1 WHERE id = ?2",
                        params![dist, flight.id],
                    );
                }
            }
        }
    }

    Ok(result)
}

pub fn get_flight_details(conn: &Connection, id: &str) -> Result<Option<FlightDetails>> {
    let mut flight_stmt = conn.prepare(
        "SELECT id, aircraft_type, departure_icao, arrival_icao, start_time, end_time,
                flight_time_seconds, max_altitude, max_ground_speed, distance_flown_nm,
                landing_rate_fpm, status
         FROM flights WHERE id = ?1",
    )?;

    let mut flight_rows = flight_stmt.query_map(params![id], |row| {
        Ok(FlightRecord {
            id: row.get(0)?,
            aircraft_type: row.get(1)?,
            departure_icao: row.get(2)?,
            arrival_icao: row.get(3)?,
            start_time: row.get(4)?,
            end_time: row.get(5)?,
            flight_time_seconds: row.get(6)?,
            max_altitude: row.get(7)?,
            max_ground_speed: row.get(8)?,
            distance_flown_nm: row.get(9)?,
            landing_rate_fpm: row.get(10)?,
            status: row.get(11)?,
        })
    })?;

    let mut flight = match flight_rows.next() {
        Some(f) => f?,
        None => return Ok(None),
    };
    drop(flight_rows);
    drop(flight_stmt);

    if flight.distance_flown_nm <= 0.0 {
        if let Ok(dist) = calculate_flight_distance(
            conn,
            &flight.id,
            flight.departure_icao.as_deref(),
            flight.arrival_icao.as_deref(),
        ) {
            if dist > 0.0 {
                flight.distance_flown_nm = dist;
                let _ = conn.execute(
                    "UPDATE flights SET distance_flown_nm = ?1 WHERE id = ?2",
                    params![dist, flight.id],
                );
            }
        }
    }

    let mut telem_stmt = conn.prepare(
        "SELECT flight_id, timestamp, latitude, longitude, altitude_msl, altitude_agl,
                indicated_airspeed, ground_speed, heading, pitch, bank, vertical_speed, is_on_ground
         FROM flight_telemetry
         WHERE flight_id = ?1
         ORDER BY id ASC",
    )?;

    let telem_rows = telem_stmt.query_map(params![id], |row| {
        Ok(TelemetryPointRecord {
            flight_id: row.get(0)?,
            timestamp: row.get(1)?,
            latitude: row.get(2)?,
            longitude: row.get(3)?,
            altitude_msl: row.get(4)?,
            altitude_agl: row.get(5)?,
            indicated_airspeed: row.get(6)?,
            ground_speed: row.get(7)?,
            heading: row.get(8)?,
            pitch: row.get(9)?,
            bank: row.get(10)?,
            vertical_speed: row.get(11)?,
            is_on_ground: row.get(12)?,
        })
    })?;

    let mut points = Vec::new();
    for p in telem_rows {
        points.push(p?);
    }

    Ok(Some(FlightDetails {
        flight,
        telemetry_points: points,
    }))
}

pub fn haversine_distance_nm(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    if !lat1.is_finite() || !lon1.is_finite() || !lat2.is_finite() || !lon2.is_finite() {
        return 0.0;
    }
    if (lat1 - lat2).abs() < 1e-9 && (lon1 - lon2).abs() < 1e-9 {
        return 0.0;
    }
    let rad = std::f64::consts::PI / 180.0;
    let d_lat = (lat2 - lat1) * rad;
    let d_lon = (lon2 - lon1) * rad;
    let a = (d_lat / 2.0).sin().powi(2)
        + (lat1 * rad).cos() * (lat2 * rad).cos() * (d_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
    3440.065 * c
}

pub fn calculate_flight_distance(
    conn: &Connection,
    flight_id: &str,
    dep_icao: Option<&str>,
    arr_icao: Option<&str>,
) -> Result<f64> {
    let mut stmt = conn.prepare(
        "SELECT latitude, longitude FROM flight_telemetry WHERE flight_id = ?1 ORDER BY id ASC",
    )?;
    let points: Vec<(f64, f64)> = stmt
        .query_map(params![flight_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    let dep_apt = match dep_icao {
        Some(icao) => get_airport_by_icao(conn, icao).ok().flatten(),
        None => None,
    };
    let arr_apt = match arr_icao {
        Some(icao) => get_airport_by_icao(conn, icao).ok().flatten(),
        None => None,
    };

    let mut total_nm = 0.0;

    if !points.is_empty() {
        let first_point = points[0];
        let last_point = points[points.len() - 1];

        // 1. Distance from departure airport reference point to first recorded point
        if let Some(ref dep) = dep_apt {
            total_nm += haversine_distance_nm(dep.latitude, dep.longitude, first_point.0, first_point.1);
        }

        // 2. Cumulative distance between all consecutive recorded telemetry points
        for i in 0..(points.len() - 1) {
            total_nm += haversine_distance_nm(
                points[i].0,
                points[i].1,
                points[i + 1].0,
                points[i + 1].1,
            );
        }

        // 3. Distance from last recorded point to arrival airport reference point
        if let Some(ref arr) = arr_apt {
            total_nm += haversine_distance_nm(last_point.0, last_point.1, arr.latitude, arr.longitude);
        }
    } else if let (Some(ref dep), Some(ref arr)) = (&dep_apt, &arr_apt) {
        // Fallback: direct great circle distance between dep and arr airports if no telemetry recorded
        total_nm = haversine_distance_nm(dep.latitude, dep.longitude, arr.latitude, arr.longitude);
    }

    Ok((total_nm * 10.0).round() / 10.0)
}

pub fn save_flight(conn: &Connection, flight: &FlightRecord) -> Result<()> {
    let mut distance = flight.distance_flown_nm;
    // When saved, if distance is <= 0.0, solve it from recorded points and dep/arr airports
    if distance <= 0.0 {
        if let Ok(solved) = calculate_flight_distance(
            conn,
            &flight.id,
            flight.departure_icao.as_deref(),
            flight.arrival_icao.as_deref(),
        ) {
            if solved > 0.0 {
                distance = solved;
            }
        }
    }

    conn.execute(
        r#"
        INSERT INTO flights (
            id, aircraft_type, departure_icao, arrival_icao, start_time, end_time,
            flight_time_seconds, max_altitude, max_ground_speed, distance_flown_nm,
            landing_rate_fpm, status
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(id) DO UPDATE SET
            aircraft_type = excluded.aircraft_type,
            departure_icao = excluded.departure_icao,
            arrival_icao = excluded.arrival_icao,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            flight_time_seconds = excluded.flight_time_seconds,
            max_altitude = excluded.max_altitude,
            max_ground_speed = excluded.max_ground_speed,
            distance_flown_nm = excluded.distance_flown_nm,
            landing_rate_fpm = excluded.landing_rate_fpm,
            status = excluded.status
        "#,
        params![
            flight.id,
            flight.aircraft_type,
            flight.departure_icao,
            flight.arrival_icao,
            flight.start_time,
            flight.end_time,
            flight.flight_time_seconds,
            flight.max_altitude,
            flight.max_ground_speed,
            distance,
            flight.landing_rate_fpm,
            flight.status,
        ],
    )?;

    Ok(())
}

pub fn delete_flight(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM flights WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn save_telemetry_batch(conn: &Connection, points: &[TelemetryPointRecord]) -> Result<()> {
    if points.is_empty() {
        return Ok(());
    }

    let mut stmt = conn.prepare(
        r#"
        INSERT INTO flight_telemetry (
            flight_id, timestamp, latitude, longitude, altitude_msl, altitude_agl,
            indicated_airspeed, ground_speed, heading, pitch, bank, vertical_speed, is_on_ground
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        "#,
    )?;

    for p in points {
        stmt.execute(params![
            p.flight_id,
            p.timestamp,
            p.latitude,
            p.longitude,
            p.altitude_msl,
            p.altitude_agl,
            p.indicated_airspeed,
            p.ground_speed,
            p.heading,
            p.pitch,
            p.bank,
            p.vertical_speed,
            p.is_on_ground,
        ])?;
    }

    Ok(())
}

pub fn search_airports_near(
    conn: &Connection,
    lat: f64,
    lon: f64,
    radius_nm: f64,
) -> Result<Option<Airport>> {
    // 1 deg latitude ~ 60 NM
    let lat_delta = radius_nm / 60.0;
    let lon_delta = radius_nm / (60.0 * lat.to_radians().cos().abs().max(0.1));

    let mut stmt = conn.prepare(
        "SELECT icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent,
                max_runway_length_ft, has_paved, has_unpaved
         FROM airports
         WHERE latitude BETWEEN ?1 AND ?2
           AND longitude BETWEEN ?3 AND ?4
           AND LENGTH(icao) = 4
           AND icao GLOB '[A-Za-z][A-Za-z][A-Za-z][A-Za-z]'
           AND airport_type IN ('large_airport', 'medium_airport', 'small_airport')
           AND airport_type NOT IN ('heliport', 'helipad')
           AND airport_type NOT LIKE '%heli%'
           AND airport_type NOT LIKE '%pad%'
           AND LOWER(name) NOT LIKE '%heliport%'
           AND LOWER(name) NOT LIKE '%helipad%'
           AND LOWER(name) NOT LIKE '%helistop%'",
    )?;

    let rows = stmt.query_map(
        params![
            lat - lat_delta,
            lat + lat_delta,
            lon - lon_delta,
            lon + lon_delta
        ],
        |row| {
            Ok(Airport {
                icao: row.get(0)?,
                name: row.get(1)?,
                latitude: row.get(2)?,
                longitude: row.get(3)?,
                elevation_ft: row.get(4)?,
                country_code: row.get(5)?,
                country_name: row.get(6)?,
                municipality: row.get(7)?,
                airport_type: row.get(8)?,
                continent: row.get(9)?,
                max_runway_length_ft: row.get(10)?,
                has_paved: row.get(11)?,
                has_unpaved: row.get(12)?,
            })
        },
    )?;

    let mut nearest: Option<(Airport, f64)> = None;

    for r in rows {
        let apt = r?;
        // Haversine distance in NM
        let d_lat = (apt.latitude - lat).to_radians();
        let d_lon = (apt.longitude - lon).to_radians();
        let a = (d_lat / 2.0).sin().powi(2)
            + lat.to_radians().cos() * apt.latitude.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
        let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
        let dist_nm = 3440.065 * c;

        if dist_nm <= radius_nm {
            match &nearest {
                Some((_, best_d)) if dist_nm < *best_d => nearest = Some((apt, dist_nm)),
                None => nearest = Some((apt, dist_nm)),
                _ => {}
            }
        }
    }

    Ok(nearest.map(|(apt, _)| apt))
}

pub fn get_airport_by_icao(conn: &Connection, icao: &str) -> Result<Option<Airport>> {
    let mut stmt = conn.prepare(
        "SELECT icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent,
                max_runway_length_ft, has_paved, has_unpaved
         FROM airports WHERE icao = ?1 COLLATE NOCASE
           AND airport_type IN ('large_airport', 'medium_airport', 'small_airport')
           AND airport_type NOT IN ('heliport', 'helipad')
           AND airport_type NOT LIKE '%heli%'
           AND airport_type NOT LIKE '%pad%'
           AND LOWER(name) NOT LIKE '%heliport%'
           AND LOWER(name) NOT LIKE '%helipad%'
           AND LOWER(name) NOT LIKE '%helistop%'
         LIMIT 1",
    )?;

    let mut rows = stmt.query(params![icao.trim()])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Airport {
            icao: row.get(0)?,
            name: row.get(1)?,
            latitude: row.get(2)?,
            longitude: row.get(3)?,
            elevation_ft: row.get(4)?,
            country_code: row.get(5)?,
            country_name: row.get(6)?,
            municipality: row.get(7)?,
            airport_type: row.get(8)?,
            continent: row.get(9)?,
            max_runway_length_ft: row.get(10)?,
            has_paved: row.get(11)?,
            has_unpaved: row.get(12)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn search_route_airports(conn: &Connection, filter: &RouteSearchFilter) -> Result<Vec<Airport>> {
    let mut sql = String::from(
        "SELECT icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent,
                max_runway_length_ft, has_paved, has_unpaved
         FROM airports WHERE LENGTH(icao) = 4 AND icao GLOB '[A-Za-z][A-Za-z][A-Za-z][A-Za-z]'
         AND airport_type IN ('large_airport', 'medium_airport', 'small_airport')
         AND airport_type NOT IN ('heliport', 'helipad')
         AND airport_type NOT LIKE '%heli%'
         AND airport_type NOT LIKE '%pad%'
         AND LOWER(name) NOT LIKE '%heliport%'
         AND LOWER(name) NOT LIKE '%helipad%'
         AND LOWER(name) NOT LIKE '%helistop%'
         AND (all_runways_closed = 0 OR all_runways_closed IS NULL)"
    );
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(cont) = &filter.continent {
        if !cont.is_empty() && cont != "ALL" && cont != "WORLDWIDE" {
            sql.push_str(" AND continent = ?");
            params_vec.push(rusqlite::types::Value::Text(cont.to_uppercase()));
        }
    }

    if let Some(cc) = &filter.country_code {
        if !cc.is_empty() && cc != "ALL" {
            sql.push_str(" AND country_code = ?");
            params_vec.push(rusqlite::types::Value::Text(cc.to_uppercase()));
        }
    }

    if let Some(atype) = &filter.airport_type {
        if !atype.is_empty() && atype != "all" {
            sql.push_str(" AND airport_type = ?");
            params_vec.push(rusqlite::types::Value::Text(atype.clone()));
        }
    }

    // Runway Surface Filter combined with Runway Length Filter
    let min_rwy = filter.min_runway_ft.unwrap_or(0);
    let surface = filter.surface.as_deref().unwrap_or("any").to_lowercase();

    match surface.as_str() {
        "paved" => {
            sql.push_str(" AND has_paved = 1");
            if min_rwy > 0 {
                sql.push_str(" AND (max_paved_runway_length_ft IS NULL OR max_paved_runway_length_ft >= ?)");
                params_vec.push(rusqlite::types::Value::Integer(min_rwy as i64));
            }
        }
        "unpaved" => {
            sql.push_str(" AND has_unpaved = 1");
            if min_rwy > 0 {
                sql.push_str(" AND (max_unpaved_runway_length_ft IS NULL OR max_unpaved_runway_length_ft >= ?)");
                params_vec.push(rusqlite::types::Value::Integer(min_rwy as i64));
            }
        }
        _ => {
            if min_rwy > 0 {
                sql.push_str(" AND (max_runway_length_ft IS NULL OR max_runway_length_ft >= ?)");
                params_vec.push(rusqlite::types::Value::Integer(min_rwy as i64));
            }
        }
    }

    if let Some(max_rwy) = filter.max_runway_ft {
        if max_rwy > 0 {
            sql.push_str(" AND (max_runway_length_ft IS NULL OR max_runway_length_ft <= ?)");
            params_vec.push(rusqlite::types::Value::Integer(max_rwy as i64));
        }
    }

    // If from_lat and from_lon are provided with max_dist_nm, filter by bounding box
    if let (Some(lat), Some(lon), Some(max_d)) = (filter.from_lat, filter.from_lon, filter.max_dist_nm) {
        let lat_delta = (max_d / 60.0) * 1.15;
        let lon_delta = (max_d / (60.0 * lat.to_radians().cos().abs().max(0.1))) * 1.15;
        sql.push_str(" AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?");
        params_vec.push(rusqlite::types::Value::Real(lat - lat_delta));
        params_vec.push(rusqlite::types::Value::Real(lat + lat_delta));
        params_vec.push(rusqlite::types::Value::Real(lon - lon_delta));
        params_vec.push(rusqlite::types::Value::Real(lon + lon_delta));
    }

    let max_results = filter.limit.unwrap_or(200).min(500);
    sql.push_str(&format!(" ORDER BY RANDOM() LIMIT {}", max_results));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
        Ok(Airport {
            icao: row.get(0)?,
            name: row.get(1)?,
            latitude: row.get(2)?,
            longitude: row.get(3)?,
            elevation_ft: row.get(4)?,
            country_code: row.get(5)?,
            country_name: row.get(6)?,
            municipality: row.get(7)?,
            airport_type: row.get(8)?,
            continent: row.get(9)?,
            max_runway_length_ft: row.get(10)?,
            has_paved: row.get(11)?,
            has_unpaved: row.get(12)?,
        })
    })?;

    let mut results = Vec::new();
    for r in rows {
        let apt = r?;
        if let (Some(lat), Some(lon)) = (filter.from_lat, filter.from_lon) {
            let d_lat = (apt.latitude - lat).to_radians();
            let d_lon = (apt.longitude - lon).to_radians();
            let a = (d_lat / 2.0).sin().powi(2)
                + lat.to_radians().cos() * apt.latitude.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
            let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
            let dist_nm = 3440.065 * c;

            if let Some(min_d) = filter.min_dist_nm {
                if dist_nm < min_d {
                    continue;
                }
            }
            if let Some(max_d) = filter.max_dist_nm {
                if dist_nm > max_d {
                    continue;
                }
            }
        }
        results.push(apt);
    }

    Ok(results)
}

pub fn record_airport_visit(
    conn: &Connection,
    airport: &Airport,
    timestamp: &str,
) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO visited_airports (
            icao, name, country_code, country_name, latitude, longitude,
            first_visited, last_visited, visit_count
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, 1)
        ON CONFLICT(icao) DO UPDATE SET
            last_visited = excluded.last_visited,
            visit_count = visit_count + 1
        "#,
        params![
            airport.icao,
            airport.name,
            airport.country_code,
            airport.country_name,
            airport.latitude,
            airport.longitude,
            timestamp,
        ],
    )?;

    conn.execute(
        r#"
        INSERT INTO visited_countries (
            iso_a2, name, first_visited, last_visited, flight_count
        ) VALUES (?1, ?2, ?3, ?3, 1)
        ON CONFLICT(iso_a2) DO UPDATE SET
            last_visited = excluded.last_visited,
            flight_count = flight_count + 1
        "#,
        params![airport.country_code, airport.country_name, timestamp],
    )?;

    Ok(())
}

pub fn get_visited_stats(conn: &Connection) -> Result<VisitedStats> {
    let mut apt_stmt = conn.prepare(
        "SELECT icao, name, country_code, country_name, latitude, longitude,
                first_visited, last_visited, visit_count
         FROM visited_airports
         ORDER BY visit_count DESC, last_visited DESC",
    )?;

    let apt_rows = apt_stmt.query_map([], |row| {
        Ok(VisitedAirport {
            icao: row.get(0)?,
            name: row.get(1)?,
            country_code: row.get(2)?,
            country_name: row.get(3)?,
            latitude: row.get(4)?,
            longitude: row.get(5)?,
            first_visited: row.get(6)?,
            last_visited: row.get(7)?,
            visit_count: row.get(8)?,
        })
    })?;

    let mut airports = Vec::new();
    for a in apt_rows {
        airports.push(a?);
    }

    let mut ctry_stmt = conn.prepare(
        "SELECT iso_a2, name, first_visited, last_visited, flight_count
         FROM visited_countries
         ORDER BY flight_count DESC, last_visited DESC",
    )?;

    let ctry_rows = ctry_stmt.query_map([], |row| {
        Ok(VisitedCountry {
            iso_a2: row.get(0)?,
            name: row.get(1)?,
            first_visited: row.get(2)?,
            last_visited: row.get(3)?,
            flight_count: row.get(4)?,
        })
    })?;

    let mut countries = Vec::new();
    for c in ctry_rows {
        countries.push(c?);
    }

    let total_airports = airports.len();
    let total_countries = countries.len();

    Ok(VisitedStats {
        visited_airports: airports,
        visited_countries: countries,
        total_countries,
        total_airports,
    })
}

pub fn save_route(conn: &Connection, route: &SavedRouteRecord) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO saved_routes (
            id, name, aircraft_name, aircraft_category, departure_icao, arrival_icao,
            sector_count, total_distance_nm, total_airborne_minutes, total_duration_minutes,
            total_ground_minutes, include_ground_time, is_round_trip, status, is_favorite,
            sectors_json, created_at, flown_at, linked_flight_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            aircraft_name = excluded.aircraft_name,
            aircraft_category = excluded.aircraft_category,
            departure_icao = excluded.departure_icao,
            arrival_icao = excluded.arrival_icao,
            sector_count = excluded.sector_count,
            total_distance_nm = excluded.total_distance_nm,
            total_airborne_minutes = excluded.total_airborne_minutes,
            total_duration_minutes = excluded.total_duration_minutes,
            total_ground_minutes = excluded.total_ground_minutes,
            include_ground_time = excluded.include_ground_time,
            is_round_trip = excluded.is_round_trip,
            status = excluded.status,
            is_favorite = excluded.is_favorite,
            sectors_json = excluded.sectors_json,
            flown_at = excluded.flown_at,
            linked_flight_id = excluded.linked_flight_id
        "#,
        params![
            route.id,
            route.name,
            route.aircraft_name,
            route.aircraft_category,
            route.departure_icao,
            route.arrival_icao,
            route.sector_count,
            route.total_distance_nm,
            route.total_airborne_minutes,
            route.total_duration_minutes,
            route.total_ground_minutes,
            route.include_ground_time,
            route.is_round_trip,
            route.status,
            route.is_favorite,
            route.sectors_json,
            route.created_at,
            route.flown_at,
            route.linked_flight_id,
        ],
    )?;
    Ok(())
}

pub fn get_saved_routes(conn: &Connection) -> Result<Vec<SavedRouteRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, aircraft_name, aircraft_category, departure_icao, arrival_icao,
               sector_count, total_distance_nm, total_airborne_minutes, total_duration_minutes,
               total_ground_minutes, include_ground_time, is_round_trip, status, is_favorite,
               sectors_json, created_at, flown_at, linked_flight_id
        FROM saved_routes
        ORDER BY is_favorite DESC, created_at DESC
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SavedRouteRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            aircraft_name: row.get(2)?,
            aircraft_category: row.get(3)?,
            departure_icao: row.get(4)?,
            arrival_icao: row.get(5)?,
            sector_count: row.get(6)?,
            total_distance_nm: row.get(7)?,
            total_airborne_minutes: row.get(8)?,
            total_duration_minutes: row.get(9)?,
            total_ground_minutes: row.get(10)?,
            include_ground_time: row.get(11)?,
            is_round_trip: row.get(12)?,
            status: row.get(13)?,
            is_favorite: row.get(14)?,
            sectors_json: row.get(15)?,
            created_at: row.get(16)?,
            flown_at: row.get(17)?,
            linked_flight_id: row.get(18)?,
        })
    })?;

    let mut routes = Vec::new();
    for r in rows {
        routes.push(r?);
    }
    Ok(routes)
}

pub fn toggle_route_favorite(conn: &Connection, id: &str) -> Result<bool> {
    let current_fav: bool = conn.query_row(
        "SELECT is_favorite FROM saved_routes WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    let new_fav = !current_fav;
    conn.execute(
        "UPDATE saved_routes SET is_favorite = ?1 WHERE id = ?2",
        params![new_fav, id],
    )?;
    Ok(new_fav)
}

pub fn update_route_status(conn: &Connection, id: &str, status: &str, linked_flight_id: Option<&str>) -> Result<()> {
    let flown_at = if status == "flown" {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };
    conn.execute(
        "UPDATE saved_routes SET status = ?1, flown_at = ?2, linked_flight_id = ?3 WHERE id = ?4",
        params![status, flown_at, linked_flight_id, id],
    )?;
    Ok(())
}

pub fn delete_saved_route(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM saved_routes WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn recompute_visited_stats(conn: &Connection) -> Result<()> {
    recompute_visited_stats_with_navdata(conn, conn)
}

pub fn recompute_visited_stats_with_navdata(conn: &Connection, navdata: &Connection) -> Result<()> {
    conn.execute("DELETE FROM visited_airports", [])?;
    conn.execute("DELETE FROM visited_countries", [])?;

    let mut stmt = conn.prepare(
        "SELECT id, departure_icao, arrival_icao, start_time, end_time FROM flights WHERE status != 'DISCARDED'",
    )?;

    struct RawFlight {
        id: String,
        dep_icao: Option<String>,
        arr_icao: Option<String>,
        time_str: String,
    }

    let flights = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let dep: Option<String> = row.get(1)?;
            let arr: Option<String> = row.get(2)?;
            let start_t: String = row.get(3)?;
            let end_t: Option<String> = row.get(4)?;
            let time_str = end_t.unwrap_or(start_t);
            Ok(RawFlight {
                id,
                dep_icao: dep,
                arr_icao: arr,
                time_str,
            })
        })?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    drop(stmt);

    for fl in flights {
        let mut unique_apts: std::collections::HashSet<String> = std::collections::HashSet::new();
        if let Some(ref d) = fl.dep_icao {
            let trimmed = d.trim().to_uppercase();
            if trimmed.len() == 4 && trimmed != "ZZZZ" {
                unique_apts.insert(trimmed);
            }
        }
        if let Some(ref a) = fl.arr_icao {
            let trimmed = a.trim().to_uppercase();
            if trimmed.len() == 4 && trimmed != "ZZZZ" {
                unique_apts.insert(trimmed);
            }
        }

        // Also check if telemetry points have intermediate touchdowns/landings
        if let Ok(mut tel_stmt) = conn.prepare(
            "SELECT latitude, longitude FROM flight_telemetry WHERE flight_id = ?1 AND is_on_ground = 1",
        ) {
            let ground_points = tel_stmt
                .query_map([&fl.id], |row| Ok((row.get(0)?, row.get(1)?)))
                .map(|mapped| mapped.filter_map(|r| r.ok()).collect::<Vec<(f64, f64)>>())
                .unwrap_or_default();
            drop(tel_stmt);

            for (lat, lon) in ground_points {
                if let Ok(Some(apt)) = search_airports_near(navdata, lat, lon, 3.0) {
                    if apt.icao.len() == 4 && apt.icao != "ZZZZ" {
                        unique_apts.insert(apt.icao);
                    }
                }
            }
        }

        let mut unique_countries: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();

        for icao in unique_apts {
            if let Ok(Some(apt)) = get_airport_by_icao(navdata, &icao) {
                conn.execute(
                    r#"
                    INSERT INTO visited_airports (
                        icao, name, country_code, country_name, latitude, longitude,
                        first_visited, last_visited, visit_count
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, 1)
                    ON CONFLICT(icao) DO UPDATE SET
                        last_visited = MAX(last_visited, excluded.last_visited),
                        first_visited = MIN(first_visited, excluded.first_visited),
                        visit_count = visit_count + 1
                    "#,
                    params![
                        apt.icao,
                        apt.name,
                        apt.country_code,
                        apt.country_name,
                        apt.latitude,
                        apt.longitude,
                        fl.time_str,
                    ],
                )?;

                unique_countries.insert((apt.country_code, apt.country_name));
            }
        }

        for (code, name) in unique_countries {
            conn.execute(
                r#"
                INSERT INTO visited_countries (
                    iso_a2, name, first_visited, last_visited, flight_count
                ) VALUES (?1, ?2, ?3, ?3, 1)
                ON CONFLICT(iso_a2) DO UPDATE SET
                    last_visited = MAX(last_visited, excluded.last_visited),
                    first_visited = MIN(first_visited, excluded.first_visited),
                    flight_count = flight_count + 1
                "#,
                params![code, name, fl.time_str],
            )?;
        }
    }

    Ok(())
}

fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn export_flight_format(conn: &Connection, id: &str, format: &str) -> Result<String, String> {
    let details = match get_flight_details(conn, id) {
        Ok(Some(d)) => d,
        Ok(None) => return Err(format!("Flight with id '{}' not found", id)),
        Err(e) => return Err(e.to_string()),
    };

    let f = &details.flight;
    let pts = &details.telemetry_points;

    match format.to_lowercase().as_str() {
        "gpx" => {
            let dep = xml_escape(f.departure_icao.as_deref().unwrap_or("UNKNOWN"));
            let arr = xml_escape(f.arrival_icao.as_deref().unwrap_or("UNKNOWN"));
            let ac_type = xml_escape(&f.aircraft_type);
            let fl_id = xml_escape(&f.id);
            let start_time = xml_escape(&f.start_time);

            let mut out = String::new();
            out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            out.push_str("<gpx version=\"1.1\" creator=\"Apollo Flight\"\n");
            out.push_str("  xmlns=\"http://www.topografix.com/GPX/1/1\">\n");
            out.push_str(&format!(
                "  <metadata><name>{} to {} - {}</name><time>{}</time></metadata>\n",
                dep, arr, ac_type, start_time
            ));
            out.push_str("  <trk>\n");
            out.push_str(&format!("    <name>Flight {}</name>\n", fl_id));
            out.push_str("    <trkseg>\n");
            for p in pts {
                let ele_m = p.altitude_msl * 0.3048;
                let ts = xml_escape(&p.timestamp);
                out.push_str(&format!(
                    "      <trkpt lat=\"{:.6}\" lon=\"{:.6}\"><ele>{:.1}</ele><time>{}</time></trkpt>\n",
                    p.latitude, p.longitude, ele_m, ts
                ));
            }
            out.push_str("    </trkseg>\n");
            out.push_str("  </trk>\n");
            out.push_str("</gpx>\n");
            Ok(out)
        }
        "kml" => {
            let mut out = String::new();
            let dep = xml_escape(f.departure_icao.as_deref().unwrap_or("UNKNOWN"));
            let arr = xml_escape(f.arrival_icao.as_deref().unwrap_or("UNKNOWN"));
            let ac_type = xml_escape(&f.aircraft_type);

            out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            out.push_str("<kml xmlns=\"http://www.opengis.net/kml/2.2\">\n");
            out.push_str("  <Document>\n");
            out.push_str(&format!("    <name>Flight {} to {} ({})</name>\n", dep, arr, ac_type));
            out.push_str("    <Style id=\"airborneTrajectory\">\n");
            out.push_str("      <LineStyle><color>ffff7000</color><width>3</width></LineStyle>\n");
            out.push_str("      <PolyStyle><color>44ff7000</color></PolyStyle>\n");
            out.push_str("    </Style>\n");
            out.push_str("    <Style id=\"groundTrack\">\n");
            out.push_str("      <LineStyle><color>ff00aa00</color><width>3</width></LineStyle>\n");
            out.push_str("    </Style>\n");
            out.push_str("    <Folder>\n");
            out.push_str("      <name>3D Flight Trajectory</name>\n");
            out.push_str("      <Placemark>\n");
            out.push_str(&format!("        <name>Airborne Profile ({} to {})</name>\n", dep, arr));
            out.push_str("        <styleUrl>#airborneTrajectory</styleUrl>\n");
            out.push_str("        <LineString>\n");
            out.push_str("          <extrude>1</extrude>\n");
            out.push_str("          <tessellate>1</tessellate>\n");
            out.push_str("          <altitudeMode>absolute</altitudeMode>\n");
            out.push_str("          <coordinates>\n");
            for p in pts {
                let ele_m = p.altitude_msl * 0.3048;
                out.push_str(&format!("            {:.6},{:.6},{:.1}\n", p.longitude, p.latitude, ele_m));
            }
            out.push_str("          </coordinates>\n");
            out.push_str("        </LineString>\n");
            out.push_str("      </Placemark>\n");
            out.push_str("    </Folder>\n");
            out.push_str("    <Folder>\n");
            out.push_str("      <name>Ground Track (Surface Footprint)</name>\n");
            out.push_str("      <Placemark>\n");
            out.push_str(&format!("        <name>Runway and Ground Track ({} to {})</name>\n", dep, arr));
            out.push_str("        <styleUrl>#groundTrack</styleUrl>\n");
            out.push_str("        <LineString>\n");
            out.push_str("          <tessellate>1</tessellate>\n");
            out.push_str("          <altitudeMode>clampToGround</altitudeMode>\n");
            out.push_str("          <coordinates>\n");
            for p in pts {
                out.push_str(&format!("            {:.6},{:.6},0\n", p.longitude, p.latitude));
            }
            out.push_str("          </coordinates>\n");
            out.push_str("        </LineString>\n");
            out.push_str("      </Placemark>\n");
            out.push_str("    </Folder>\n");
            out.push_str("  </Document>\n");
            out.push_str("</kml>\n");
            Ok(out)
        }
        "geojson" => {
            let coords: Vec<[f64; 3]> = pts
                .iter()
                .map(|p| [p.longitude, p.latitude, p.altitude_msl * 0.3048])
                .collect();

            let geojson = serde_json::json!({
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {
                            "id": f.id,
                            "aircraftType": f.aircraft_type,
                            "departureIcao": f.departure_icao,
                            "arrivalIcao": f.arrival_icao,
                            "startTime": f.start_time,
                            "endTime": f.end_time,
                            "durationMinutes": (f.flight_time_seconds as f64 / 60.0).round(),
                            "distanceNm": f.distance_flown_nm,
                            "maxAltitudeFt": f.max_altitude,
                            "maxGroundSpeedKt": f.max_ground_speed,
                            "landingRateFpm": f.landing_rate_fpm
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": coords
                        }
                    }
                ]
            });
            serde_json::to_string_pretty(&geojson).map_err(|e| e.to_string())
        }
        "csv" => {
            let mut out = String::new();
            out.push_str("flight_id,timestamp,latitude,longitude,altitude_msl,altitude_agl,indicated_airspeed,ground_speed,heading,vertical_speed,is_on_ground\n");
            for p in pts {
                out.push_str(&format!(
                    "{},{},{:.6},{:.6},{:.1},{:.1},{:.1},{:.1},{:.1},{:.1},{}\n",
                    p.flight_id,
                    p.timestamp,
                    p.latitude,
                    p.longitude,
                    p.altitude_msl,
                    p.altitude_agl.unwrap_or(0.0),
                    p.indicated_airspeed,
                    p.ground_speed,
                    p.heading,
                    p.vertical_speed.unwrap_or(0.0),
                    p.is_on_ground
                ));
            }
            Ok(out)
        }
        _ => Err(format!("Unsupported export format '{}'. Supported: gpx, kml, geojson, csv", format)),
    }
}

pub fn export_logbook_format(conn: &Connection, format: &str) -> Result<String, String> {
    let flights = get_flights(conn).map_err(|e| e.to_string())?;

    match format.to_lowercase().as_str() {
        "csv" => {
            let mut out = String::from(
                "Flight ID,Departure ICAO,Arrival ICAO,Aircraft Type,Start Time (UTC),End Time (UTC),Duration (Seconds),Duration,Distance (NM),Max Altitude (ft),Peak Ground Speed (kt),Landing Rate (fpm),Status\r\n",
            );
            for f in flights {
                let mins = (f.flight_time_seconds + 30) / 60;
                let hrs = mins / 60;
                let rem_mins = mins % 60;
                let duration_fmt = format!("{}h {:02}m", hrs, rem_mins);

                let escape_csv = |val: &str| -> String {
                    if val.contains(',') || val.contains('"') || val.contains('\n') || val.contains('\r') {
                        format!("\"{}\"", val.replace('"', "\"\""))
                    } else {
                        val.to_string()
                    }
                };

                out.push_str(&format!(
                    "{},{},{},{},{},{},{},{},{:.1},{},{},{},{}\r\n",
                    escape_csv(&f.id),
                    escape_csv(f.departure_icao.as_deref().unwrap_or("")),
                    escape_csv(f.arrival_icao.as_deref().unwrap_or("")),
                    escape_csv(&f.aircraft_type),
                    escape_csv(&f.start_time),
                    escape_csv(f.end_time.as_deref().unwrap_or("")),
                    f.flight_time_seconds,
                    escape_csv(&duration_fmt),
                    f.distance_flown_nm,
                    f.max_altitude,
                    f.max_ground_speed,
                    f.landing_rate_fpm
                        .map(|lr| format!("{:.0}", lr.round()))
                        .unwrap_or_default(),
                    escape_csv(&f.status)
                ));
            }
            Ok(out)
        }
        "json" => {
            #[derive(Serialize)]
            #[serde(rename_all = "camelCase")]
            struct LogbookFlightItem<'a> {
                id: &'a str,
                departure_icao: &'a str,
                arrival_icao: &'a str,
                aircraft_type: &'a str,
                start_time: &'a str,
                end_time: Option<&'a str>,
                flight_time_seconds: i64,
                flight_time_formatted: String,
                distance_nm: f64,
                max_altitude_ft: i64,
                max_ground_speed_kt: i64,
                landing_rate_fpm: Option<f64>,
                status: &'a str,
            }

            let items: Vec<LogbookFlightItem> = flights
                .iter()
                .map(|f| {
                    let mins = (f.flight_time_seconds + 30) / 60;
                    let hrs = mins / 60;
                    let rem_mins = mins % 60;
                    let duration_fmt = format!("{}h {:02}m", hrs, rem_mins);

                    LogbookFlightItem {
                        id: &f.id,
                        departure_icao: f.departure_icao.as_deref().unwrap_or(""),
                        arrival_icao: f.arrival_icao.as_deref().unwrap_or(""),
                        aircraft_type: &f.aircraft_type,
                        start_time: &f.start_time,
                        end_time: f.end_time.as_deref(),
                        flight_time_seconds: f.flight_time_seconds,
                        flight_time_formatted: duration_fmt,
                        distance_nm: (f.distance_flown_nm * 10.0).round() / 10.0,
                        max_altitude_ft: f.max_altitude,
                        max_ground_speed_kt: f.max_ground_speed,
                        landing_rate_fpm: f.landing_rate_fpm.map(|lr| lr.round()),
                        status: &f.status,
                    }
                })
                .collect();

            serde_json::to_string_pretty(&items).map_err(|e| e.to_string())
        }
        _ => Err(format!(
            "Unsupported logbook export format '{}'. Supported: csv, json",
            format
        )),
    }
}

pub fn get_user_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM user_settings WHERE key = ?1")?;
    let mut rows = stmt.query([key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_user_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO user_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        [key, value, &now],
    )?;
    Ok(())
}

pub fn get_all_user_settings(conn: &Connection) -> Result<std::collections::HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM user_settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        if let Ok((k, v)) = row {
            map.insert(k, v);
        }
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_database_and_route_search() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("test_apollo_{}.db", uuid::Uuid::new_v4()));
        let conn = init_database(&db_path).expect("init_database should succeed");

        let filter = RouteSearchFilter {
            continent: Some("EU".to_string()),
            country_code: None,
            airport_type: Some("large_airport".to_string()),
            surface: Some("paved".to_string()),
            min_runway_ft: Some(5000),
            max_runway_ft: None,
            from_lat: Some(48.35),
            from_lon: Some(11.78),
            min_dist_nm: None,
            max_dist_nm: Some(1500.0),
            limit: Some(10),
        };

        let res = search_route_airports(&conn, &filter).expect("search_route_airports should succeed");
        assert!(res.len() <= 10);
        assert!(!res.is_empty(), "Should find European airports");
        for apt in &res {
            assert_eq!(apt.icao.len(), 4, "ICAO must be exactly 4 chars: {}", apt.icao);
            assert!(apt.icao.chars().all(|c| c.is_ascii_alphabetic()), "ICAO must be alphabetic: {}", apt.icao);
            assert_ne!(apt.airport_type.as_deref(), Some("heliport"), "Must not be a heliport");
            assert_ne!(apt.airport_type.as_deref(), Some("closed"), "Must not be closed");
            assert_eq!(apt.continent.as_deref(), Some("EU"), "Airports in EU search must strictly have continent EU");
            assert_ne!(apt.country_code, "US", "US airports must never appear in EU search");
            assert_ne!(apt.country_code, "AE", "Asia airports must never appear in EU search");
            if let Some(len) = apt.max_runway_length_ft {
                assert!(len >= 5000, "Airport runway length {} must be >= 5000", len);
            }
        }

        // Test unpaved query
        let unpaved_filter = RouteSearchFilter {
            continent: None,
            country_code: None,
            airport_type: None,
            surface: Some("unpaved".to_string()),
            min_runway_ft: Some(1000),
            max_runway_ft: None,
            from_lat: None,
            from_lon: None,
            min_dist_nm: None,
            max_dist_nm: None,
            limit: Some(20),
        };
        let unpaved_res = search_route_airports(&conn, &unpaved_filter).expect("Search unpaved");
        for apt in &unpaved_res {
            assert_eq!(apt.has_unpaved, Some(true), "Must have unpaved runway");
        }

        // Verify specific airports have their continents correctly seeded
        let jfk = get_airport_by_icao(&conn, "KJFK").expect("Query JFK").expect("JFK must exist");
        assert_eq!(jfk.continent.as_deref(), Some("NA"), "KJFK continent must be NA");

        let dxb = get_airport_by_icao(&conn, "OMDB").expect("Query OMDB").expect("OMDB must exist");
        assert_eq!(dxb.continent.as_deref(), Some("AS"), "OMDB continent must be AS");

        let muc = get_airport_by_icao(&conn, "EDDM").expect("Query EDDM").expect("EDDM must exist");
        assert_eq!(muc.continent.as_deref(), Some("EU"), "EDDM continent must be EU");

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn test_filter_helipads_and_heliports() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("test_apollo_heli_{}.db", uuid::Uuid::new_v4()));
        let conn = init_database(&db_path).expect("init_database should succeed");

        // Attempt to insert test helipads and heliports
        conn.execute_batch(
            r#"
            INSERT OR REPLACE INTO airports (icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent)
            VALUES
                ('TEST', 'City Hospital Helipad', 48.0, 11.0, 1500, 'DE', 'Germany', 'Munich', 'small_airport', 'EU'),
                ('HELI', 'Downtown Heliport', 48.1, 11.1, 1600, 'DE', 'Germany', 'Munich', 'heliport', 'EU'),
                ('PAD1', 'Mountain Helipad Base', 48.2, 11.2, 2000, 'DE', 'Germany', 'Munich', 'helipad', 'EU'),
                ('STOP', 'Corporate Helistop', 48.3, 11.3, 1700, 'DE', 'Germany', 'Munich', 'medium_airport', 'EU');
            "#
        ).expect("Insert test heli records");

        // get_airport_by_icao must filter them out
        assert!(get_airport_by_icao(&conn, "TEST").expect("Query TEST").is_none());
        assert!(get_airport_by_icao(&conn, "HELI").expect("Query HELI").is_none());
        assert!(get_airport_by_icao(&conn, "PAD1").expect("Query PAD1").is_none());
        assert!(get_airport_by_icao(&conn, "STOP").expect("Query STOP").is_none());

        // search_airports_near must filter them out
        let near = search_airports_near(&conn, 48.0, 11.0, 50.0).expect("search near");
        if let Some(apt) = near {
            assert_ne!(apt.icao, "TEST");
            assert_ne!(apt.icao, "HELI");
            assert_ne!(apt.icao, "PAD1");
            assert_ne!(apt.icao, "STOP");
        }

        // search_route_airports must filter them out
        let filter = RouteSearchFilter {
            continent: Some("EU".to_string()),
            country_code: Some("DE".to_string()),
            airport_type: None,
            surface: None,
            min_runway_ft: None,
            max_runway_ft: None,
            from_lat: None,
            from_lon: None,
            min_dist_nm: None,
            max_dist_nm: None,
            limit: Some(100),
        };
        let res = search_route_airports(&conn, &filter).expect("search route");
        for apt in res {
            assert_ne!(apt.icao, "TEST");
            assert_ne!(apt.icao, "HELI");
            assert_ne!(apt.icao, "PAD1");
            assert_ne!(apt.icao, "STOP");
            let name_lower = apt.name.to_lowercase();
            assert!(!name_lower.contains("heliport"));
            assert!(!name_lower.contains("helipad"));
            assert!(!name_lower.contains("helistop"));
            assert_ne!(apt.airport_type.as_deref(), Some("heliport"));
            assert_ne!(apt.airport_type.as_deref(), Some("helipad"));
        }

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn test_export_logbook_format() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("test_apollo_export_{}.db", uuid::Uuid::new_v4()));
        let conn = init_database(&db_path).expect("init_database should succeed");

        let flight = FlightRecord {
            id: "test-flight-123".to_string(),
            aircraft_type: "Cessna 172 Skyhawk".to_string(),
            departure_icao: Some("LOWW".to_string()),
            arrival_icao: Some("LOWI".to_string()),
            start_time: "2026-11-02T10:00:00Z".to_string(),
            end_time: Some("2026-11-02T11:15:00Z".to_string()),
            flight_time_seconds: 4500,
            max_altitude: 8500,
            max_ground_speed: 135,
            distance_flown_nm: 220.5,
            landing_rate_fpm: Some(-150.0),
            status: "COMPLETED".to_string(),
        };

        save_flight(&conn, &flight).expect("save flight");

        // CSV export
        let csv = export_logbook_format(&conn, "csv").expect("export csv");
        assert!(csv.contains("Flight ID,Departure ICAO,Arrival ICAO"));
        assert!(csv.contains("test-flight-123"));
        assert!(csv.contains("LOWW"));
        assert!(csv.contains("LOWI"));
        assert!(csv.contains("Cessna 172 Skyhawk"));
        assert!(csv.contains("1h 15m"));
        // Ensure no telemetry data/headers are present
        assert!(!csv.contains("altitude_msl"));
        assert!(!csv.contains("indicated_airspeed"));

        // JSON export
        let json = export_logbook_format(&conn, "json").expect("export json");
        assert!(json.contains("\"id\": \"test-flight-123\""));
        assert!(json.contains("\"departureIcao\": \"LOWW\""));
        assert!(json.contains("\"arrivalIcao\": \"LOWI\""));
        assert!(json.contains("\"flightTimeFormatted\": \"1h 15m\""));
        assert!(!json.contains("telemetryPoints"));

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn test_calculate_flight_distance() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("test_apollo_dist_{}.db", uuid::Uuid::new_v4()));
        let conn = init_database(&db_path).expect("init_database should succeed");

        // Insert test airports with known coordinates
        conn.execute(
            "INSERT OR REPLACE INTO airports (icao, name, latitude, longitude, country_code, country_name, airport_type, continent)
             VALUES ('TESTDEP', 'Test Dep', 48.0, 16.0, 'AT', 'Austria', 'medium_airport', 'EU'),
                    ('TESTARR', 'Test Arr', 48.0, 18.0, 'AT', 'Austria', 'medium_airport', 'EU')",
            [],
        ).expect("insert test airports");

        // Insert initial legacy flight record with 0.0 distance directly into SQL
        conn.execute(
            "INSERT INTO flights (
                id, aircraft_type, departure_icao, arrival_icao, start_time, end_time,
                flight_time_seconds, max_altitude, max_ground_speed, distance_flown_nm,
                landing_rate_fpm, status
            ) VALUES ('fl-dist-1', 'Diamond DA40', 'TESTDEP', 'TESTARR', '2026-11-03T10:00:00Z', '2026-11-03T10:45:00Z', 2700, 5000, 130, 0.0, -120.0, 'COMPLETED')",
            [],
        ).expect("insert legacy flight");

        // Save a telemetry batch
        let pts = vec![
            TelemetryPointRecord {
                flight_id: "fl-dist-1".to_string(),
                timestamp: "2026-11-03T10:00:00Z".to_string(),
                latitude: 48.0,
                longitude: 16.5,
                altitude_msl: 5000.0,
                altitude_agl: None,
                indicated_airspeed: 120.0,
                ground_speed: 120.0,
                heading: 90.0,
                pitch: None,
                bank: None,
                vertical_speed: None,
                is_on_ground: false,
            },
            TelemetryPointRecord {
                flight_id: "fl-dist-1".to_string(),
                timestamp: "2026-11-03T10:30:00Z".to_string(),
                latitude: 48.0,
                longitude: 17.5,
                altitude_msl: 5000.0,
                altitude_agl: None,
                indicated_airspeed: 120.0,
                ground_speed: 120.0,
                heading: 90.0,
                pitch: None,
                bank: None,
                vertical_speed: None,
                is_on_ground: false,
            },
        ];
        save_telemetry_batch(&conn, &pts).expect("save telemetry");

        // Calculate distance: TESTDEP (16.0) -> Point 1 (16.5) -> Point 2 (17.5) -> TESTARR (18.0)
        let dist = calculate_flight_distance(&conn, "fl-dist-1", Some("TESTDEP"), Some("TESTARR"))
            .expect("calc distance");

        // Total distance along latitude 48 from lon 16.0 to 18.0 is 2 degrees of longitude
        let direct = haversine_distance_nm(48.0, 16.0, 48.0, 18.0);
        assert!((dist - direct).abs() < 0.5);
        assert!(dist > 50.0);

        // get_flight_details auto-heals legacy flight with 0.0 distance
        let details = get_flight_details(&conn, "fl-dist-1").expect("get details").expect("flight exists");
        assert_eq!(details.flight.distance_flown_nm, dist);

        // get_flights also auto-heals and reads persisted distance
        let flights = get_flights(&conn).expect("get flights");
        assert_eq!(flights[0].distance_flown_nm, dist);

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn test_saved_routes_crud() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("test_apollo_saved_route_{}.db", uuid::Uuid::new_v4()));
        let conn = init_database(&db_path).expect("init_database should succeed");

        let route = SavedRouteRecord {
            id: "route-test-1".to_string(),
            name: "LOWI to EDDM".to_string(),
            aircraft_name: "Cessna 172 Skyhawk".to_string(),
            aircraft_category: "A".to_string(),
            departure_icao: "LOWI".to_string(),
            arrival_icao: "EDDM".to_string(),
            sector_count: 1,
            total_distance_nm: 65.4,
            total_airborne_minutes: 35,
            total_duration_minutes: 50,
            total_ground_minutes: 15,
            include_ground_time: true,
            is_round_trip: false,
            status: "draft".to_string(),
            is_favorite: false,
            sectors_json: "[]".to_string(),
            created_at: "2026-11-03T16:00:00Z".to_string(),
            flown_at: None,
            linked_flight_id: None,
        };

        save_route(&conn, &route).expect("save route");
        let all = get_saved_routes(&conn).expect("get routes");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "route-test-1");
        assert_eq!(all[0].status, "draft");
        assert!(!all[0].is_favorite);

        let new_fav = toggle_route_favorite(&conn, "route-test-1").expect("toggle favorite");
        assert!(new_fav);

        // Insert mock flight to satisfy foreign key constraint on linked_flight_id
        let mock_flight = FlightRecord {
            id: "fl-123".to_string(),
            aircraft_type: "C172".to_string(),
            departure_icao: Some("LOWI".to_string()),
            arrival_icao: Some("EDDM".to_string()),
            start_time: "2026-11-03T16:00:00Z".to_string(),
            end_time: Some("2026-11-03T17:00:00Z".to_string()),
            flight_time_seconds: 3600,
            max_altitude: 10000,
            max_ground_speed: 130,
            distance_flown_nm: 60.0,
            landing_rate_fpm: Some(-150.0),
            status: "COMPLETED".to_string(),
        };
        save_flight(&conn, &mock_flight).expect("save flight");

        update_route_status(&conn, "route-test-1", "flown", Some("fl-123")).expect("update status");
        let all_after = get_saved_routes(&conn).expect("get routes after update");
        assert_eq!(all_after[0].status, "flown");
        assert!(all_after[0].flown_at.is_some());
        assert_eq!(all_after[0].linked_flight_id.as_deref(), Some("fl-123"));

        delete_saved_route(&conn, "route-test-1").expect("delete route");
        let all_empty = get_saved_routes(&conn).expect("get routes after delete");
        assert_eq!(all_empty.len(), 0);

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn test_recompute_visited_stats_deduplication() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("test_apollo_visited_dedup_{}.db", uuid::Uuid::new_v4()));
        let conn = init_database(&db_path).expect("init_database should succeed");

        // Seed test airports: LOWI (AT), LOWS (AT), EDDM (DE)
        conn.execute(
            "INSERT OR REPLACE INTO airports (icao, name, latitude, longitude, country_code, country_name, airport_type, continent)
             VALUES ('LOWI', 'Innsbruck Airport', 47.26, 11.34, 'AT', 'Austria', 'medium_airport', 'EU'),
                    ('LOWS', 'Salzburg Airport', 47.79, 13.00, 'AT', 'Austria', 'medium_airport', 'EU'),
                    ('EDDM', 'Munich Airport', 48.35, 11.78, 'DE', 'Germany', 'large_airport', 'EU')",
            [],
        ).expect("insert test airports");

        // Flight 1: Local pattern flight LOWI -> LOWI (Should be 1 visit to LOWI, 1 operation to AT)
        conn.execute(
            "INSERT INTO flights (id, aircraft_type, departure_icao, arrival_icao, start_time, end_time, status)
             VALUES ('fl-pattern', 'C172', 'LOWI', 'LOWI', '2026-11-03T10:00:00Z', '2026-11-03T10:45:00Z', 'COMPLETED')",
            [],
        ).expect("insert flight 1");

        // Flight 2: Domestic flight LOWI -> LOWS (Should be 1 visit to LOWI, 1 visit to LOWS, 1 operation to AT)
        conn.execute(
            "INSERT INTO flights (id, aircraft_type, departure_icao, arrival_icao, start_time, end_time, status)
             VALUES ('fl-domestic', 'C172', 'LOWI', 'LOWS', '2026-11-03T11:00:00Z', '2026-11-03T11:50:00Z', 'COMPLETED')",
            [],
        ).expect("insert flight 2");

        // Flight 3: International flight LOWS -> EDDM (Should be 1 visit to LOWS, 1 visit to EDDM, 1 op to AT, 1 op to DE)
        conn.execute(
            "INSERT INTO flights (id, aircraft_type, departure_icao, arrival_icao, start_time, end_time, status)
             VALUES ('fl-intl', 'C172', 'LOWS', 'EDDM', '2026-11-03T12:00:00Z', '2026-11-03T12:45:00Z', 'COMPLETED')",
            [],
        ).expect("insert flight 3");

        recompute_visited_stats(&conn).expect("recompute visited stats");
        let stats = get_visited_stats(&conn).expect("get visited stats");

        // Airports:
        // LOWI: Flown in Flight 1 (LOWI -> LOWI = 1 visit), Flight 2 (LOWI -> LOWS = 1 visit) => Total 2 visits
        // LOWS: Flown in Flight 2 (LOWI -> LOWS = 1 visit), Flight 3 (LOWS -> EDDM = 1 visit) => Total 2 visits
        // EDDM: Flown in Flight 3 (LOWS -> EDDM = 1 visit) => Total 1 visit
        let lowi = stats.visited_airports.iter().find(|a| a.icao == "LOWI").expect("LOWI found");
        assert_eq!(lowi.visit_count, 2);

        let lows = stats.visited_airports.iter().find(|a| a.icao == "LOWS").expect("LOWS found");
        assert_eq!(lows.visit_count, 2);

        let eddm = stats.visited_airports.iter().find(|a| a.icao == "EDDM").expect("EDDM found");
        assert_eq!(eddm.visit_count, 1);

        // Countries:
        // Austria (AT): Flight 1 = 1 op, Flight 2 = 1 op, Flight 3 = 1 op => Total 3 operations
        // Germany (DE): Flight 3 = 1 op => Total 1 operation
        let at = stats.visited_countries.iter().find(|c| c.iso_a2 == "AT").expect("AT found");
        assert_eq!(at.flight_count, 3);

        let de = stats.visited_countries.iter().find(|c| c.iso_a2 == "DE").expect("DE found");
        assert_eq!(de.flight_count, 1);

        let _ = std::fs::remove_file(db_path);
    }
}
