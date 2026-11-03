pub mod db;
pub mod fsuipc;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

pub struct DbState(pub Mutex<rusqlite::Connection>);

static WORKER_RUNNING: OnceLock<Arc<AtomicBool>> = OnceLock::new();
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);

fn get_worker_state() -> Arc<AtomicBool> {
    WORKER_RUNNING.get_or_init(|| Arc::new(AtomicBool::new(true))).clone()
}

mod commands {
    use super::*;

    #[tauri::command]
    pub fn get_connection_status() -> bool {
        fsuipc::IS_CONNECTED_TO_SIM.load(Ordering::SeqCst)
    }

    #[tauri::command]
    pub fn start_polling(app: AppHandle) -> Result<String, String> {
        let state = get_worker_state();
        if !state.load(Ordering::SeqCst) {
            state.store(true, Ordering::SeqCst);
            fsuipc::start_telemetry_loop(app, state);
            Ok("Polling started".to_string())
        } else {
            Ok("Polling already active".to_string())
        }
    }

    #[tauri::command]
    pub fn stop_polling() -> Result<String, String> {
        let state = get_worker_state();
        state.store(false, Ordering::SeqCst);
        fsuipc::IS_CONNECTED_TO_SIM.store(false, Ordering::SeqCst);
        Ok("Polling stopped".to_string())
    }

    #[tauri::command]
    pub fn get_close_to_tray() -> bool {
        CLOSE_TO_TRAY.load(Ordering::SeqCst)
    }

    #[tauri::command]
    pub fn set_close_to_tray(enabled: bool) {
        CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
    }

    #[tauri::command]
    pub fn get_flights(state: tauri::State<'_, DbState>) -> Result<Vec<db::FlightRecord>, String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::get_flights(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_flight_details(
        state: tauri::State<'_, DbState>,
        id: String,
    ) -> Result<Option<db::FlightDetails>, String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::get_flight_details(&conn, &id).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn save_flight(
        state: tauri::State<'_, DbState>,
        flight: db::FlightRecord,
    ) -> Result<(), String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::save_flight(&conn, &flight).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn delete_flight(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::delete_flight(&conn, &id).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn save_telemetry_batch(
        state: tauri::State<'_, DbState>,
        points: Vec<db::TelemetryPointRecord>,
    ) -> Result<(), String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::save_telemetry_batch(&conn, &points).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn search_airports_near(
        state: tauri::State<'_, DbState>,
        lat: f64,
        lon: f64,
        radius_nm: Option<f64>,
    ) -> Result<Option<db::Airport>, String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let radius = radius_nm.unwrap_or(3.0);
        db::search_airports_near(&conn, lat, lon, radius).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_visited_stats(
        state: tauri::State<'_, DbState>,
    ) -> Result<db::VisitedStats, String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::get_visited_stats(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn record_airport_visit(
        state: tauri::State<'_, DbState>,
        airport: db::Airport,
        timestamp: String,
    ) -> Result<(), String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::record_airport_visit(&conn, &airport, &timestamp).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn export_flight(
        state: tauri::State<'_, DbState>,
        id: String,
        format: String,
    ) -> Result<String, String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::export_flight_format(&conn, &id, &format)
    }

    #[tauri::command]
    pub fn export_logbook(
        state: tauri::State<'_, DbState>,
        format: String,
    ) -> Result<String, String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::export_logbook_format(&conn, &format)
    }

    #[tauri::command]
    pub fn get_airports_count(state: tauri::State<'_, DbState>) -> Result<i64, String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::get_airports_count(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_airport(
        state: tauri::State<'_, DbState>,
        icao: String,
    ) -> Result<Option<db::Airport>, String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::get_airport_by_icao(&conn, &icao).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn search_route_airports(
        state: tauri::State<'_, DbState>,
        filter: db::RouteSearchFilter,
    ) -> Result<Vec<db::Airport>, String> {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::search_route_airports(&conn, &filter).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn sync_ourairports(
        app: AppHandle,
        state: tauri::State<'_, DbState>,
    ) -> Result<db::OurAirportsSyncResult, String> {
        let mut conn = state.0.lock().map_err(|e| e.to_string())?;
        let work_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let _ = std::fs::create_dir_all(&work_dir);
        db::sync_ourairports_data(&mut conn, &work_dir)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Initialize SQLite aerotrack.db in app_data_dir or local directory
            let db_path = match app.path().app_data_dir() {
                Ok(dir) => {
                    let _ = std::fs::create_dir_all(&dir);
                    dir.join("aerotrack.db")
                }
                Err(_) => std::path::PathBuf::from("aerotrack.db"),
            };

            let mut search_dirs = Vec::new();
            if let Ok(data_dir) = app.path().app_data_dir() {
                search_dirs.push(data_dir);
            }
            if let Ok(res_dir) = app.path().resource_dir() {
                search_dirs.push(res_dir);
            }

            let conn = db::init_database_with_resources(&db_path, &search_dirs)
                .map_err(|e| Box::<dyn std::error::Error>::from(format!("Failed to initialize database: {}", e)))?;
            app.manage(DbState(Mutex::new(conn)));

            // Setup System Tray
            let open_item = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let start_rec_item = MenuItem::with_id(app, "start_rec", "Start flight recording", true, None::<&str>)?;
            let stop_rec_item = MenuItem::with_id(app, "stop_rec", "Stop flight recording", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &sep1,
                    &start_rec_item,
                    &stop_rec_item,
                    &sep2,
                    &quit_item,
                ],
            )?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "start_rec" => {
                            use tauri::Emitter;
                            let _ = app.emit("tray-start-recording", ());
                        }
                        "stop_rec" => {
                            use tauri::Emitter;
                            let _ = app.emit("tray-stop-recording", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _ = tray_builder.build(app)?;

            let handle = app.handle().clone();
            let state = get_worker_state();
            state.store(true, Ordering::SeqCst);
            fsuipc::start_telemetry_loop(handle, state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if CLOSE_TO_TRAY.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_connection_status,
            commands::start_polling,
            commands::stop_polling,
            commands::get_close_to_tray,
            commands::set_close_to_tray,
            commands::get_flights,
            commands::get_flight_details,
            commands::save_flight,
            commands::delete_flight,
            commands::save_telemetry_batch,
            commands::search_airports_near,
            commands::get_visited_stats,
            commands::record_airport_visit,
            commands::export_flight,
            commands::export_logbook,
            commands::get_airports_count,
            commands::get_airport,
            commands::search_route_airports,
            commands::sync_ourairports
        ])
        .run(tauri::generate_context!())
        .expect("error while running apollo flight application");
}
