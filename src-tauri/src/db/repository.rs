use std::sync::Mutex;
use rusqlite::Connection;

use super::{flights, telemetry, FlightDetails, FlightRecord};

/// Abstract persistence boundary for flight logbook records, telemetry details, and exports.
///
/// Decouples Tauri command handlers from direct SQLite calls so command logic can be
/// tested with mock repositories and future cloud-sync backends (e.g. PostgreSQL / Supabase)
/// can implement the same contract.
pub trait FlightRepository: Send + Sync {
    fn get_flights(&self) -> Result<Vec<FlightRecord>, String>;

    fn get_flight_details(
        &self,
        id: &str,
        downsample: bool,
        max_points: Option<usize>,
    ) -> Result<Option<FlightDetails>, String>;

    fn save_flight(&self, flight: &FlightRecord) -> Result<(), String>;

    fn delete_flight(&self, id: &str) -> Result<(), String>;

    fn wipe_all_user_data(&self) -> Result<(), String>;

    fn export_flight(&self, id: &str, format: &str) -> Result<String, String>;

    fn export_logbook(&self, format: &str) -> Result<String, String>;
}

/// SQLite-backed implementation of [`FlightRepository`] supporting separated read/write
/// connections in WAL mode to avoid reader/writer lock contention.
pub struct SqliteFlightRepository<'a> {
    write_conn: &'a Mutex<Connection>,
    read_conn: &'a Mutex<Connection>,
}

impl<'a> SqliteFlightRepository<'a> {
    pub fn new(write_conn: &'a Mutex<Connection>, read_conn: &'a Mutex<Connection>) -> Self {
        Self {
            write_conn,
            read_conn,
        }
    }

    pub fn single(conn: &'a Mutex<Connection>) -> Self {
        Self {
            write_conn: conn,
            read_conn: conn,
        }
    }
}

impl FlightRepository for SqliteFlightRepository<'_> {
    fn get_flights(&self) -> Result<Vec<FlightRecord>, String> {
        let conn = self.read_conn.lock().map_err(|e| e.to_string())?;
        flights::get_flights(&conn).map_err(|e| e.to_string())
    }

    fn get_flight_details(
        &self,
        id: &str,
        downsample: bool,
        max_points: Option<usize>,
    ) -> Result<Option<FlightDetails>, String> {
        let conn = self.read_conn.lock().map_err(|e| e.to_string())?;
        if downsample {
            telemetry::get_flight_details_downsampled(&conn, id, max_points)
                .map_err(|e| e.to_string())
        } else {
            flights::get_flight_details(&conn, id).map_err(|e| e.to_string())
        }
    }

    fn save_flight(&self, flight: &FlightRecord) -> Result<(), String> {
        let conn = self.write_conn.lock().map_err(|e| e.to_string())?;
        flights::save_flight(&conn, flight).map_err(|e| e.to_string())
    }

    fn delete_flight(&self, id: &str) -> Result<(), String> {
        let conn = self.write_conn.lock().map_err(|e| e.to_string())?;
        flights::delete_flight(&conn, id).map_err(|e| e.to_string())
    }

    fn wipe_all_user_data(&self) -> Result<(), String> {
        let conn = self.write_conn.lock().map_err(|e| e.to_string())?;
        flights::wipe_all_user_data(&conn).map_err(|e| e.to_string())
    }

    fn export_flight(&self, id: &str, format: &str) -> Result<String, String> {
        let conn = self.read_conn.lock().map_err(|e| e.to_string())?;
        flights::export_flight_format(&conn, id, format)
    }

    fn export_logbook(&self, format: &str) -> Result<String, String> {
        let conn = self.read_conn.lock().map_err(|e| e.to_string())?;
        flights::export_logbook_format(&conn, format)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_database;

    struct MockFlightRepository {
        flights: Mutex<Vec<FlightRecord>>,
    }

    impl MockFlightRepository {
        fn new() -> Self {
            Self {
                flights: Mutex::new(Vec::new()),
            }
        }
    }

    impl FlightRepository for MockFlightRepository {
        fn get_flights(&self) -> Result<Vec<FlightRecord>, String> {
            Ok(self.flights.lock().unwrap().clone())
        }

        fn get_flight_details(
            &self,
            id: &str,
            _downsample: bool,
            _max_points: Option<usize>,
        ) -> Result<Option<FlightDetails>, String> {
            let guard = self.flights.lock().unwrap();
            Ok(guard.iter().find(|f| f.id == id).cloned().map(|flight| {
                FlightDetails {
                    flight,
                    telemetry_points: Vec::new(),
                }
            }))
        }

        fn save_flight(&self, flight: &FlightRecord) -> Result<(), String> {
            let mut guard = self.flights.lock().unwrap();
            if let Some(existing) = guard.iter_mut().find(|f| f.id == flight.id) {
                *existing = flight.clone();
            } else {
                guard.push(flight.clone());
            }
            Ok(())
        }

        fn delete_flight(&self, id: &str) -> Result<(), String> {
            let mut guard = self.flights.lock().unwrap();
            guard.retain(|f| f.id != id);
            Ok(())
        }

        fn wipe_all_user_data(&self) -> Result<(), String> {
            self.flights.lock().unwrap().clear();
            Ok(())
        }

        fn export_flight(&self, id: &str, format: &str) -> Result<String, String> {
            let guard = self.flights.lock().unwrap();
            let exists = guard.iter().any(|f| f.id == id);
            if !exists {
                return Err(format!("Flight '{}' not found", id));
            }
            Ok(format!("{}:{}", format, id))
        }

        fn export_logbook(&self, format: &str) -> Result<String, String> {
            let count = self.flights.lock().unwrap().len();
            Ok(format!("{}:{}", format, count))
        }
    }

    fn sample_flight(id: &str) -> FlightRecord {
        FlightRecord {
            id: id.to_string(),
            aircraft_type: "Cessna 172 Skyhawk".to_string(),
            departure_icao: Some("EGLL".to_string()),
            arrival_icao: Some("LFPG".to_string()),
            start_time: "2026-11-25T09:00:00Z".to_string(),
            end_time: Some("2026-11-25T10:30:00Z".to_string()),
            flight_time_seconds: 5400,
            max_altitude: 7500,
            max_ground_speed: 120,
            distance_flown_nm: 190.0,
            landing_rate_fpm: Some(-110.0),
            status: "COMPLETED".to_string(),
            min_oat: None,
            max_oat: None,
            min_visibility: None,
            avg_cruise_wind_speed: None,
            avg_cruise_wind_direction: None,
            max_wind_speed: None,
            max_wind_direction: None,
            total_weight: None,
        }
    }

    #[test]
    fn test_mock_flight_repository_trait_object_crud() {
        let mock = MockFlightRepository::new();
        let repo: &dyn FlightRepository = &mock;

        assert!(repo.get_flights().unwrap().is_empty());

        let mut f1 = sample_flight("mock-1");
        repo.save_flight(&f1).unwrap();
        assert_eq!(repo.get_flights().unwrap().len(), 1);

        // Upsert updates existing record
        f1.max_altitude = 9500;
        repo.save_flight(&f1).unwrap();
        assert_eq!(repo.get_flights().unwrap().len(), 1);
        assert_eq!(
            repo.get_flight_details("mock-1", true, None)
                .unwrap()
                .unwrap()
                .flight
                .max_altitude,
            9500
        );

        assert_eq!(repo.export_flight("mock-1", "csv").unwrap(), "csv:mock-1");
        assert_eq!(repo.export_logbook("json").unwrap(), "json:1");

        repo.delete_flight("mock-1").unwrap();
        assert!(repo.get_flights().unwrap().is_empty());

        repo.save_flight(&sample_flight("mock-2")).unwrap();
        repo.wipe_all_user_data().unwrap();
        assert!(repo.get_flights().unwrap().is_empty());
    }

    #[test]
    fn test_sqlite_flight_repository_crud_and_exports() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("test_apollo_repo_{}.db", uuid::Uuid::new_v4()));
        let conn = Mutex::new(init_database(&db_path).expect("init_database should succeed"));
        let repo = SqliteFlightRepository::single(&conn);

        let f1 = sample_flight("repo-flight-1");
        repo.save_flight(&f1).expect("save_flight");

        let all = repo.get_flights().expect("get_flights");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "repo-flight-1");

        let details = repo
            .get_flight_details("repo-flight-1", false, None)
            .expect("get_flight_details")
            .expect("flight must exist");
        assert_eq!(details.flight.departure_icao.as_deref(), Some("EGLL"));

        let downsampled = repo
            .get_flight_details("repo-flight-1", true, Some(100))
            .expect("get_flight_details downsampled")
            .expect("flight must exist");
        assert_eq!(downsampled.flight.id, "repo-flight-1");

        let logbook_csv = repo.export_logbook("csv").expect("export_logbook csv");
        assert!(logbook_csv.contains("repo-flight-1"));

        repo.delete_flight("repo-flight-1").expect("delete_flight");
        assert!(repo.get_flights().expect("get_flights after delete").is_empty());

        repo.save_flight(&sample_flight("repo-flight-2"))
            .expect("save second flight");
        repo.wipe_all_user_data().expect("wipe_all_user_data");
        assert!(repo.get_flights().expect("get_flights after wipe").is_empty());

        drop(conn);
        let _ = std::fs::remove_file(db_path);
    }
}
