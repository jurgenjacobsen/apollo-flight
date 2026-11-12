pub mod db;
pub mod fsuipc;
pub mod efb;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

pub struct DbState {
    pub logbook: Mutex<rusqlite::Connection>,
    pub navdata: Mutex<rusqlite::Connection>,
}

static WORKER_RUNNING: OnceLock<Arc<AtomicBool>> = OnceLock::new();
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
static IS_SYNCING_DATASET: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFileInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_iso: String,
    pub is_crash: bool,
}

pub fn get_app_data_dir(app: &AppHandle) -> std::path::PathBuf {
    if let Ok(data_dir) = app.path().data_dir() {
        let dir = data_dir.join("Apollo Flight");
        let _ = std::fs::create_dir_all(&dir);
        dir
    } else if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        dir
    } else {
        std::path::PathBuf::from(".")
    }
}

pub fn get_log_dir(app: &AppHandle) -> std::path::PathBuf {
    let app_dir = get_app_data_dir(app);
    let log_dir = app_dir.join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    log_dir
}

fn migrate_legacy_com_apollo_flight_dir(app: &AppHandle, new_dir: &std::path::Path) {
    if let Ok(old_dir) = app.path().app_data_dir() {
        if old_dir.exists() && old_dir != new_dir {
            // Migrate logbook.db and wal/shm files if new_dir doesn't have it yet
            let old_logbook = old_dir.join("logbook.db");
            let new_logbook = new_dir.join("logbook.db");
            if old_logbook.exists() && !new_logbook.exists() {
                let _ = std::fs::copy(&old_logbook, &new_logbook);
                let _ = std::fs::copy(old_dir.join("logbook.db-wal"), new_dir.join("logbook.db-wal"));
                let _ = std::fs::copy(old_dir.join("logbook.db-shm"), new_dir.join("logbook.db-shm"));
            }

            // Migrate navdata.db and wal/shm files
            let old_navdata = old_dir.join("navdata.db");
            let new_navdata = new_dir.join("navdata.db");
            if old_navdata.exists() && !new_navdata.exists() {
                let _ = std::fs::copy(&old_navdata, &new_navdata);
                let _ = std::fs::copy(old_dir.join("navdata.db-wal"), new_dir.join("navdata.db-wal"));
                let _ = std::fs::copy(old_dir.join("navdata.db-shm"), new_dir.join("navdata.db-shm"));
            }

            // Migrate legacy aerotrack.db if present
            let old_aerotrack = old_dir.join("aerotrack.db");
            let new_aerotrack = new_dir.join("aerotrack.db");
            if old_aerotrack.exists() && !new_aerotrack.exists() {
                let _ = std::fs::copy(&old_aerotrack, &new_aerotrack);
            }

            // Migrate logs folder
            let old_logs = old_dir.join("logs");
            let new_logs = new_dir.join("logs");
            if old_logs.exists() {
                let _ = std::fs::create_dir_all(&new_logs);
                if let Ok(entries) = std::fs::read_dir(&old_logs) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let dest = new_logs.join(entry.file_name());
                            if !dest.exists() {
                                let _ = std::fs::copy(&path, &dest);
                            }
                        }
                    }
                }
            }
        }
    }
}

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
    pub fn set_close_to_tray(state: tauri::State<'_, DbState>, enabled: bool) -> Result<(), String> {
        CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::set_user_setting(&conn, "closeToTray", if enabled { "true" } else { "false" })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn get_user_setting(
        state: tauri::State<'_, DbState>,
        key: String,
    ) -> Result<Option<String>, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::get_user_setting(&conn, &key).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn set_user_setting(
        state: tauri::State<'_, DbState>,
        key: String,
        value: String,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::set_user_setting(&conn, &key, &value).map_err(|e| e.to_string())?;
        if key == "closeToTray" {
            CLOSE_TO_TRAY.store(value == "true", Ordering::SeqCst);
        }
        Ok(())
    }

    #[tauri::command]
    pub fn get_all_user_settings(
        state: tauri::State<'_, DbState>,
    ) -> Result<std::collections::HashMap<String, String>, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::get_all_user_settings(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_flights(state: tauri::State<'_, DbState>) -> Result<Vec<db::FlightRecord>, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::get_flights(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_flight_details(
        state: tauri::State<'_, DbState>,
        id: String,
    ) -> Result<Option<db::FlightDetails>, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::get_flight_details(&conn, &id).map_err(|e| e.to_string())
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
    pub fn save_telemetry_batch(
        state: tauri::State<'_, DbState>,
        points: Vec<db::TelemetryPointRecord>,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::save_telemetry_batch(&conn, &points).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn search_airports_near(
        state: tauri::State<'_, DbState>,
        lat: f64,
        lon: f64,
        radius_nm: Option<f64>,
    ) -> Result<Option<db::Airport>, String> {
        let conn = state.navdata.lock().map_err(|e| e.to_string())?;
        let radius = radius_nm.unwrap_or(3.0);
        db::search_airports_near(&conn, lat, lon, radius).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_visited_stats(
        state: tauri::State<'_, DbState>,
    ) -> Result<db::VisitedStats, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::get_visited_stats(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn record_airport_visit(
        state: tauri::State<'_, DbState>,
        airport: db::Airport,
        timestamp: String,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::record_airport_visit(&conn, &airport, &timestamp).map_err(|e| e.to_string())
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

    #[tauri::command]
    pub fn get_airports_count(state: tauri::State<'_, DbState>) -> Result<i64, String> {
        let conn = state.navdata.lock().map_err(|e| e.to_string())?;
        db::get_airports_count(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_airport(
        state: tauri::State<'_, DbState>,
        icao: String,
    ) -> Result<Option<db::Airport>, String> {
        let conn = state.navdata.lock().map_err(|e| e.to_string())?;
        db::get_airport_by_icao(&conn, &icao).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn search_route_airports(
        state: tauri::State<'_, DbState>,
        filter: db::RouteSearchFilter,
    ) -> Result<Vec<db::Airport>, String> {
        let conn = state.navdata.lock().map_err(|e| e.to_string())?;
        db::search_route_airports(&conn, &filter).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn is_dataset_syncing() -> bool {
        IS_SYNCING_DATASET.load(Ordering::Relaxed)
    }

    #[tauri::command]
    pub async fn sync_ourairports(
        app: AppHandle,
    ) -> Result<db::OurAirportsSyncResult, String> {
        if IS_SYNCING_DATASET.swap(true, Ordering::SeqCst) {
            return Err("A dataset synchronization is already in progress.".to_string());
        }

        struct SyncGuard;
        impl Drop for SyncGuard {
            fn drop(&mut self) {
                IS_SYNCING_DATASET.store(false, Ordering::SeqCst);
            }
        }
        let _guard = SyncGuard;

        let app_clone = app.clone();
        let app_worker = app.clone();
        let work_dir = get_app_data_dir(&app_worker);

        let res = tokio::task::spawn_blocking(move || {
            let state = app_worker.state::<DbState>();
            let mut conn = state.navdata.lock().map_err(|e| e.to_string())?;
            db::sync_ourairports_data(&mut conn, &work_dir, |progress| {
                let _ = app_clone.emit("ourairports-sync-progress", &progress);
            })
        })
        .await
        .map_err(|e| format!("Worker thread failed: {}", e))??;

        Ok(res)
    }

    #[tauri::command]
    pub fn list_log_files(app: AppHandle) -> Result<Vec<LogFileInfo>, String> {
        let log_dir = get_log_dir(&app);
        let mut files = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&log_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(".log") || name.ends_with(".txt") {
                        if let Ok(metadata) = entry.metadata() {
                            let size_bytes = metadata.len();
                            let modified: chrono::DateTime<chrono::Utc> = metadata
                                .modified()
                                .map(|st| st.into())
                                .unwrap_or_else(|_| chrono::Utc::now());
                            let is_crash = name.starts_with("crash");
                            files.push(LogFileInfo {
                                name,
                                path: path.to_string_lossy().to_string(),
                                size_bytes,
                                modified_iso: modified.to_rfc3339(),
                                is_crash,
                            });
                        }
                    }
                }
            }
        }
        files.sort_by(|a, b| b.modified_iso.cmp(&a.modified_iso));
        Ok(files)
    }

    #[tauri::command]
    pub fn get_log_file_content(app: AppHandle, file_name: String) -> Result<String, String> {
        let safe_name = std::path::Path::new(&file_name)
            .file_name()
            .ok_or_else(|| "Invalid file name".to_string())?;
        let log_dir = get_log_dir(&app);
        let file_path = log_dir.join(safe_name);
        if !file_path.exists() {
            return Err("Log file does not exist".to_string());
        }
        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read log file: {}", e))?;
        const MAX_BYTES: usize = 256 * 1024;
        if content.len() > MAX_BYTES {
            let start = content.len() - MAX_BYTES;
            Ok(format!("... [truncated first {} bytes]\n{}", start, &content[start..]))
        } else {
            Ok(content)
        }
    }

    #[tauri::command]
    pub fn log_client_message(
        app: AppHandle,
        level: String,
        message: String,
        context: Option<String>,
    ) -> Result<(), String> {
        let log_dir = get_log_dir(&app);
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let log_path = log_dir.join(format!("apollo-flight-{}.log", today));
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        let ctx_str = context.map(|c| format!(" [{}]", c)).unwrap_or_default();
        let line = format!("[{}] [{}] [CLIENT{}] {}\n", timestamp, level.to_uppercase(), ctx_str, message);
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| e.to_string())?;
        file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn open_external_url(url: String) -> Result<(), String> {
        if !url.starts_with("https://") && !url.starts_with("http://") {
            return Err("Invalid URL protocol".to_string());
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let mut cmd = std::process::Command::new("rundll32.exe");
            cmd.creation_flags(0x08000000);
            let _ = cmd.args(["url.dll,FileProtocolHandler", &url]).spawn()
                .map_err(|e| format!("Failed to launch browser: {}", e))?;
        }
        #[cfg(not(windows))]
        {
            let _ = std::process::Command::new("xdg-open").arg(&url).spawn()
                .map_err(|e| format!("Failed to launch browser: {}", e))?;
        }
        Ok(())
    }

    #[tauri::command]
    pub fn save_file_dialog(
        default_filename: String,
        content: String,
        filter_name: String,
        filter_ext: String,
    ) -> Result<Option<String>, String> {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let temp_dir = std::env::temp_dir();
            let temp_id = uuid::Uuid::new_v4().to_string();
            let temp_file = temp_dir.join(format!("apollo_export_{}.tmp", temp_id));
            std::fs::write(&temp_file, &content).map_err(|e| e.to_string())?;

            let clean_filter = format!("{} (*.{})|*.{}", filter_name, filter_ext, filter_ext);
            let ps_script = format!(
                "Add-Type -AssemblyName System.Windows.Forms;\
                 $d = New-Object System.Windows.Forms.SaveFileDialog;\
                 $d.Title = 'Save Export';\
                 $d.Filter = '{}';\
                 $d.FileName = '{}';\
                 if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{\
                     [System.IO.File]::Copy('{}', $d.FileName, $true);\
                     [Console]::Out.Write($d.FileName);\
                 }}",
                clean_filter.replace('\'', "''"),
                default_filename.replace('\'', "''"),
                temp_file.to_string_lossy().replace('\'', "''")
            );

            let output = std::process::Command::new("powershell.exe")
                .creation_flags(0x08000000)
                .args(["-NoProfile", "-Sta", "-Command", &ps_script])
                .output();

            let _ = std::fs::remove_file(&temp_file);

            match output {
                Ok(out) => {
                    let chosen_path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !chosen_path.is_empty() {
                        Ok(Some(chosen_path))
                    } else {
                        Ok(None)
                    }
                }
                Err(e) => Err(format!("Failed to show save file dialog: {}", e)),
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (default_filename, content, filter_name, filter_ext);
            Ok(None)
        }
    }

    #[tauri::command]
    pub fn save_route(
        state: tauri::State<'_, DbState>,
        route: db::SavedRouteRecord,
    ) -> Result<db::SavedRouteRecord, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::save_route(&conn, &route).map_err(|e| e.to_string())?;
        Ok(route)
    }

    #[tauri::command]
    pub fn get_saved_routes(
        state: tauri::State<'_, DbState>,
    ) -> Result<Vec<db::SavedRouteRecord>, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::get_saved_routes(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn toggle_route_favorite(
        state: tauri::State<'_, DbState>,
        id: String,
    ) -> Result<bool, String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::toggle_route_favorite(&conn, &id).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn update_route_status(
        state: tauri::State<'_, DbState>,
        id: String,
        status: String,
        linked_flight_id: Option<String>,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::update_route_status(&conn, &id, &status, linked_flight_id.as_deref())
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn delete_saved_route(
        state: tauri::State<'_, DbState>,
        id: String,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::delete_saved_route(&conn, &id).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn recompute_visited_destinations(
        state: tauri::State<'_, DbState>,
    ) -> Result<db::VisitedStats, String> {
        let logbook = state.logbook.lock().map_err(|e| e.to_string())?;
        let navdata = state.navdata.lock().map_err(|e| e.to_string())?;
        db::recompute_visited_stats_with_navdata(&logbook, &navdata).map_err(|e| e.to_string())?;
        db::get_visited_stats(&logbook).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_efb_status() -> Result<efb::EfbStatus, String> {
        Ok(efb::get_status())
    }

    #[tauri::command]
    pub async fn start_efb(app: AppHandle, port: Option<u16>) -> Result<efb::EfbStatus, String> {
        efb::start_server(app, port).await
    }

    #[tauri::command]
    pub async fn stop_efb() -> Result<(), String> {
        efb::stop_server().await
    }

    #[tauri::command]
    pub fn set_efb_route(route: Option<serde_json::Value>) -> Result<(), String> {
        efb::set_active_route(route);
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Resolve app data directory as %APPDATA%/Apollo Flight
            let app_data_dir = get_app_data_dir(app.handle());

            // Check and seamlessly migrate existing files from %APPDATA%/com.apollo.flight if needed
            migrate_legacy_com_apollo_flight_dir(app.handle(), &app_data_dir);

            let logbook_path = app_data_dir.join("logbook.db");
            let navdata_path = app_data_dir.join("navdata.db");

            let mut search_dirs = Vec::new();
            search_dirs.push(app_data_dir.clone());
            if let Ok(data_dir) = app.path().app_data_dir() {
                search_dirs.push(data_dir);
            }
            if let Ok(res_dir) = app.path().resource_dir() {
                search_dirs.push(res_dir);
            }

            let (logbook_conn, navdata_conn) = db::init_databases(&logbook_path, &navdata_path, &search_dirs)
                .map_err(|e| Box::<dyn std::error::Error>::from(format!("Failed to initialize databases: {}", e)))?;

            // Read persisted user settings directly from SQLite on cold boot
            if let Ok(Some(val)) = db::get_user_setting(&logbook_conn, "closeToTray") {
                CLOSE_TO_TRAY.store(val == "true", Ordering::SeqCst);
            }

            app.manage(DbState {
                logbook: Mutex::new(logbook_conn),
                navdata: Mutex::new(navdata_conn),
            });

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

            // Initialize logging and crash capture
            let log_dir = get_log_dir(app.handle());
            let panic_dir = log_dir.clone();
            let default_hook = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                let now = chrono::Local::now();
                let crash_file = panic_dir.join(format!("crash-{}.txt", now.format("%Y-%m-%d_%H-%M-%S")));
                let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
                    s.to_string()
                } else if let Some(s) = info.payload().downcast_ref::<String>() {
                    s.clone()
                } else {
                    "Unknown panic".to_string()
                };
                let location = if let Some(loc) = info.location() {
                    format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
                } else {
                    "unknown location".to_string()
                };
                let report = format!(
                    "=========================================\n\
                     APOLLO FLIGHT - CRASH REPORT\n\
                     =========================================\n\
                     Timestamp: {}\n\
                     Panic Reason: {}\n\
                     Location: {}\n\
                     OS: {}\n\
                     Arch: {}\n\
                     =========================================\n",
                    now.to_rfc3339(),
                    payload,
                    location,
                    std::env::consts::OS,
                    std::env::consts::ARCH
                );
                let _ = std::fs::write(&crash_file, report);
                default_hook(info);
            }));

            // Record initial session log entry
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();
            let session_log = log_dir.join(format!("apollo-flight-{}.log", today));
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&session_log) {
                use std::io::Write;
                let _ = writeln!(
                    f,
                    "[{}] [INFO] [SYSTEM] Apollo Flight v{} session initialized. OS: {}, Arch: {}",
                    chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                    env!("CARGO_PKG_VERSION"),
                    std::env::consts::OS,
                    std::env::consts::ARCH
                );
            }

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
            commands::get_user_setting,
            commands::set_user_setting,
            commands::get_all_user_settings,
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
            commands::sync_ourairports,
            commands::is_dataset_syncing,
            commands::list_log_files,
            commands::get_log_file_content,
            commands::log_client_message,
            commands::open_external_url,
            commands::save_file_dialog,
            commands::save_route,
            commands::get_saved_routes,
            commands::toggle_route_favorite,
            commands::update_route_status,
            commands::delete_saved_route,
            commands::recompute_visited_destinations,
            commands::get_efb_status,
            commands::start_efb,
            commands::stop_efb,
            commands::set_efb_route
        ])
        .run(tauri::generate_context!())
        .expect("error while running apollo flight application");
}
