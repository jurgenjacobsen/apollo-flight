use tauri::AppHandle;
use crate::{db, db::FlightRepository, get_app_data_dir, DbState};

fn make_repo<'a>(state: &'a tauri::State<'_, DbState>) -> db::SqliteFlightRepository<'a> {
    db::SqliteFlightRepository::new(&state.logbook, &state.logbook_read)
}

pub fn get_flights_with_repo(repo: &dyn db::FlightRepository) -> Result<Vec<db::FlightRecord>, String> {
    repo.get_flights()
}

pub fn get_flight_details_with_repo(
    repo: &dyn db::FlightRepository,
    id: &str,
    downsample: Option<bool>,
) -> Result<Option<db::FlightDetails>, String> {
    repo.get_flight_details(id, downsample.unwrap_or(true), None)
}

#[tauri::command]
pub fn get_flights(state: tauri::State<'_, DbState>) -> Result<Vec<db::FlightRecord>, String> {
    get_flights_with_repo(&make_repo(&state))
}

#[tauri::command]
pub fn get_flight_details(
    state: tauri::State<'_, DbState>,
    id: String,
    downsample: Option<bool>,
) -> Result<Option<db::FlightDetails>, String> {
    get_flight_details_with_repo(&make_repo(&state), &id, downsample)
}

#[tauri::command]
pub fn get_downsampled_flight_telemetry(
    state: tauri::State<'_, DbState>,
    id: String,
    max_points: Option<usize>,
) -> Result<Vec<db::TelemetryPointRecord>, String> {
    match make_repo(&state).get_flight_details(&id, true, max_points)? {
        Some(details) => Ok(details.telemetry_points),
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
pub fn save_flight(
    state: tauri::State<'_, DbState>,
    flight: db::FlightRecord,
) -> Result<(), String> {
    make_repo(&state).save_flight(&flight)
}

#[tauri::command]
pub fn delete_flight(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    make_repo(&state).delete_flight(&id)
}

#[tauri::command]
pub fn wipe_all_user_data(app: AppHandle, state: tauri::State<'_, DbState>) -> Result<(), String> {
    make_repo(&state).wipe_all_user_data()?;

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
    make_repo(&state).export_flight(&id, &format)
}

#[tauri::command]
pub fn export_logbook(
    state: tauri::State<'_, DbState>,
    format: String,
) -> Result<String, String> {
    make_repo(&state).export_logbook(&format)
}
