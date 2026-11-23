use rusqlite::{params, Connection, Result};
use std::path::Path;
use super::*;

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
            status TEXT CHECK(status IN ('RECORDING', 'COMPLETED', 'DISCARDED')) DEFAULT 'RECORDING',
            min_oat REAL,
            max_oat REAL,
            min_visibility REAL,
            avg_cruise_wind_speed REAL,
            avg_cruise_wind_direction REAL,
            max_wind_speed REAL,
            max_wind_direction REAL,
            total_weight REAL
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
            wind_speed REAL,
            wind_direction REAL,
            oat REAL,
            tat REAL,
            visibility REAL,
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

        CREATE TABLE IF NOT EXISTS document_metadata (
            file_path TEXT PRIMARY KEY,
            title TEXT,
            last_seen TEXT,
            tags TEXT
        );
        "#
    )?;

    // Ensure unique indexes exist on user tables so ON CONFLICT clauses match a unique index
    let _ = logbook_conn.execute_batch(
        r#"
        CREATE UNIQUE INDEX IF NOT EXISTS idx_flights_id_uniq ON flights(id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_routes_id_uniq ON saved_routes(id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_visited_airports_icao_uniq ON visited_airports(icao);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_visited_countries_iso_uniq ON visited_countries(iso_a2);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_key_uniq ON user_settings(key);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_document_metadata_path_uniq ON document_metadata(file_path);
        "#
    );

    // Attach navdata to logbook so logbook can query navdata.airports and navdata.runways seamlessly
    let navdata_abs = navdata_path.to_string_lossy().to_string();
    let _ = logbook_conn.execute("ATTACH DATABASE ?1 AS navdata", [&navdata_abs]);
    let _ = logbook_conn.execute("CREATE TEMP VIEW IF NOT EXISTS airports AS SELECT * FROM navdata.airports", []);
    let _ = logbook_conn.execute("CREATE TEMP VIEW IF NOT EXISTS runways AS SELECT * FROM navdata.runways", []);

    apply_telemetry_migrations(&logbook_conn);

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
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_flights_id_uniq ON flights(id);
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_routes_id_uniq ON saved_routes(id);
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_visited_airports_icao_uniq ON visited_airports(icao);
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_visited_countries_iso_uniq ON visited_countries(iso_a2);
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_key_uniq ON user_settings(key);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_document_metadata_path_uniq ON document_metadata(file_path);
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
            status TEXT CHECK(status IN ('RECORDING', 'COMPLETED', 'DISCARDED')) DEFAULT 'RECORDING',
            min_oat REAL,
            max_oat REAL,
            min_visibility REAL,
            avg_cruise_wind_speed REAL,
            avg_cruise_wind_direction REAL,
            max_wind_speed REAL,
            max_wind_direction REAL,
            total_weight REAL
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
            wind_speed REAL,
            wind_direction REAL,
            oat REAL,
            tat REAL,
            visibility REAL,
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

        CREATE TABLE IF NOT EXISTS document_metadata (
            file_path TEXT PRIMARY KEY,
            title TEXT,
            last_seen TEXT,
            tags TEXT
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

    // Ensure telemetry and atmospheric columns exist on legacy tables
    apply_telemetry_migrations(&conn);

    Ok(conn)
}

pub fn apply_telemetry_migrations(conn: &Connection) {
    let _ = conn.execute("ALTER TABLE flight_telemetry ADD COLUMN wind_speed REAL", []);
    let _ = conn.execute("ALTER TABLE flight_telemetry ADD COLUMN wind_direction REAL", []);
    let _ = conn.execute("ALTER TABLE flight_telemetry ADD COLUMN oat REAL", []);
    let _ = conn.execute("ALTER TABLE flight_telemetry ADD COLUMN tat REAL", []);
    let _ = conn.execute("ALTER TABLE flight_telemetry ADD COLUMN visibility REAL", []);

    let _ = conn.execute("ALTER TABLE flights ADD COLUMN min_oat REAL", []);
    let _ = conn.execute("ALTER TABLE flights ADD COLUMN max_oat REAL", []);
    let _ = conn.execute("ALTER TABLE flights ADD COLUMN min_visibility REAL", []);
    let _ = conn.execute("ALTER TABLE flights ADD COLUMN avg_cruise_wind_speed REAL", []);
    let _ = conn.execute("ALTER TABLE flights ADD COLUMN avg_cruise_wind_direction REAL", []);
    let _ = conn.execute("ALTER TABLE flights ADD COLUMN max_wind_speed REAL", []);
    let _ = conn.execute("ALTER TABLE flights ADD COLUMN max_wind_direction REAL", []);
    let _ = conn.execute("ALTER TABLE flights ADD COLUMN total_weight REAL", []);
    let _ = conn.execute("ALTER TABLE flights ADD COLUMN gross_weight REAL", []);
}

