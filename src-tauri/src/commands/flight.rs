use tauri::AppHandle;
use crate::{db, get_app_data_dir, DbState};

    #[tauri::command]
    pub fn get_flights(state: tauri::State<'_, DbState>) -> Result<Vec<db::FlightRecord>, String> {
        let conn = state.logbook_read.lock().map_err(|e| e.to_string())?;
        db::get_flights(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_flight_details(
        state: tauri::State<'_, DbState>,
        id: String,
        downsample: Option<bool>,
    ) -> Result<Option<db::FlightDetails>, String> {
        let conn = state.logbook_read.lock().map_err(|e| e.to_string())?;
        if downsample.unwrap_or(true) {
            db::get_flight_details_downsampled(&conn, &id, Some(1500)).map_err(|e| e.to_string())
        } else {
            db::get_flight_details(&conn, &id).map_err(|e| e.to_string())
        }
    }

    #[tauri::command]
    pub fn get_downsampled_flight_telemetry(
        state: tauri::State<'_, DbState>,
        id: String,
        max_points: Option<usize>,
    ) -> Result<Vec<db::TelemetryPointRecord>, String> {
        let conn = state.logbook_read.lock().map_err(|e| e.to_string())?;
        match db::get_flight_details_downsampled(&conn, &id, max_points).map_err(|e| e.to_string())? {
            Some(details) => Ok(details.telemetry_points),
            None => Ok(Vec::new()),
        }
    }

    #[tauri::command]
    pub fn save_flight(
        state: tauri::State<'_, DbState>,
        flight: db::FlightRecord,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::save_flight(&conn, &flight).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn delete_flight(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::delete_flight(&conn, &id).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn wipe_all_user_data(app: AppHandle, state: tauri::State<'_, DbState>) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::wipe_all_user_data(&conn).map_err(|e| e.to_string())?;

        // Remove Navigraph session token file if it exists
        let app_dir = get_app_data_dir(&app);
        let session_file = app_dir.join("navigraph_session.json");
        if session_file.exists() {
            let _ = std::fs::remove_file(session_file);
        }

        Ok(())
    }

    #[tauri::command]
    pub fn export_flight(
        state: tauri::State<'_, DbState>,
        id: String,
        format: String,
    ) -> Result<String, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::export_flight_format(&conn, &id, &format)
    }

    #[tauri::command]
    pub fn export_logbook(
        state: tauri::State<'_, DbState>,
        format: String,
    ) -> Result<String, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::export_logbook_format(&conn, &format)
    }

