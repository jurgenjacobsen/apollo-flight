pub mod models;
pub mod migrations;
pub mod navdata;
pub mod flights;
pub mod telemetry;
pub mod visited;
pub mod routes;
pub mod settings;

pub use models::*;
pub use migrations::*;
pub use navdata::*;
pub use flights::*;
pub use telemetry::*;
pub use visited::*;
pub use routes::*;
pub use settings::*;

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
            min_oat: None,
            max_oat: None,
            min_visibility: None,
            avg_cruise_wind_speed: None,
            avg_cruise_wind_direction: None,
            max_wind_speed: None,
            max_wind_direction: None,
            total_weight: None,
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
                wind_speed: None,
                wind_direction: None,
                oat: None,
                tat: None,
                visibility: None,
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
                wind_speed: None,
                wind_direction: None,
                oat: None,
                tat: None,
                visibility: None,
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
            min_oat: None,
            max_oat: None,
            min_visibility: None,
            avg_cruise_wind_speed: None,
            avg_cruise_wind_direction: None,
            max_wind_speed: None,
            max_wind_direction: None,
            total_weight: None,
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

    #[test]
    fn test_downsample_telemetry_rdp() {
        let mut points = Vec::new();

        // 1. Point 0 on ground (takeoff)
        points.push(TelemetryPointRecord {
            flight_id: "fl-rdp-test".to_string(),
            timestamp: "2026-11-23T10:00:00Z".to_string(),
            latitude: 47.0,
            longitude: 11.0,
            altitude_msl: 500.0,
            altitude_agl: Some(0.0),
            indicated_airspeed: 0.0,
            ground_speed: 0.0,
            heading: 90.0,
            pitch: None,
            bank: None,
            vertical_speed: None,
            is_on_ground: true,
            wind_speed: None,
            wind_direction: None,
            oat: None,
            tat: None,
            visibility: None,
        });

        // 2. High-density climb points < 1000 ft AGL (must all be preserved)
        for i in 1..=10 {
            points.push(TelemetryPointRecord {
                flight_id: "fl-rdp-test".to_string(),
                timestamp: format!("2026-11-23T10:00:{:02}Z", i),
                latitude: 47.0 + (i as f64) * 0.001,
                longitude: 11.0 + (i as f64) * 0.001,
                altitude_msl: 500.0 + (i as f64) * 80.0,
                altitude_agl: Some((i as f64) * 80.0),
                indicated_airspeed: 100.0,
                ground_speed: 100.0,
                heading: 90.0,
                pitch: None,
                bank: None,
                vertical_speed: Some(800.0),
                is_on_ground: false,
                wind_speed: None,
                wind_direction: None,
                oat: None,
                tat: None,
                visibility: None,
            });
        }

        // 3. Enroute cruise points in a straight line at 35,000 ft MSL (should be heavily simplified)
        for i in 11..=100 {
            points.push(TelemetryPointRecord {
                flight_id: "fl-rdp-test".to_string(),
                timestamp: format!("2026-11-23T10:10:{:02}Z", i),
                latitude: 47.01 + (i as f64) * 0.01,
                longitude: 11.01 + (i as f64) * 0.01,
                altitude_msl: 35000.0,
                altitude_agl: Some(34000.0),
                indicated_airspeed: 250.0,
                ground_speed: 450.0,
                heading: 90.0,
                pitch: None,
                bank: None,
                vertical_speed: Some(0.0),
                is_on_ground: false,
                wind_speed: None,
                wind_direction: None,
                oat: None,
                tat: None,
                visibility: None,
            });
        }

        // Total 101 points
        assert_eq!(points.len(), 101);

        // Downsample requesting target budget of 25 points
        let downsampled = downsample_telemetry_rdp(&points, 25);

        // Verify: all points with AGL < 1000 ft or on ground must be preserved
        let low_agl_count = points.iter().filter(|p| p.is_on_ground || p.altitude_agl.unwrap_or(9999.0) < 1000.0).count();
        let downsampled_low_agl_count = downsampled.iter().filter(|p| p.is_on_ground || p.altitude_agl.unwrap_or(9999.0) < 1000.0).count();
        assert_eq!(low_agl_count, downsampled_low_agl_count);

        // Verify: enroute straight line was simplified
        assert!(downsampled.len() < points.len());
        assert!(downsampled.len() <= 30);
    }
}
