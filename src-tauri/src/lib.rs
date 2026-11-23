pub mod db;
pub mod fsuipc;
pub mod efb;
pub mod navigraph_auth;
pub mod navigraph_airac;
pub mod navigraph_procedures;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

pub struct DbState {
    pub logbook: Mutex<rusqlite::Connection>,
    pub logbook_read: Mutex<rusqlite::Connection>,
    pub navdata: Mutex<rusqlite::Connection>,
}

pub(crate) static WORKER_RUNNING: OnceLock<Arc<AtomicBool>> = OnceLock::new();
pub(crate) static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
pub(crate) static IS_SYNCING_DATASET: AtomicBool = AtomicBool::new(false);

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

pub(crate) fn get_worker_state() -> Arc<AtomicBool> {
    WORKER_RUNNING.get_or_init(|| Arc::new(AtomicBool::new(true))).clone()
}


pub mod commands;
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

            // Dedicated read connection with query_only = ON in WAL mode to eliminate reader/writer lock contention
            let logbook_read_conn = rusqlite::Connection::open(&logbook_path)
                .map_err(|e| Box::<dyn std::error::Error>::from(format!("Failed to open logbook read connection: {}", e)))?;
            let _ = logbook_read_conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA query_only = ON;");

            // Read persisted user settings directly from SQLite on cold boot
            if let Ok(Some(val)) = db::get_user_setting(&logbook_conn, "closeToTray") {
                CLOSE_TO_TRAY.store(val == "true", Ordering::SeqCst);
            }

            app.manage(DbState {
                logbook: Mutex::new(logbook_conn),
                logbook_read: Mutex::new(logbook_read_conn),
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
                if window.label() == "touchdown-overlay" {
                    api.prevent_close();
                    let _ = window.hide();
                } else if CLOSE_TO_TRAY.load(Ordering::SeqCst) {
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
            commands::get_downsampled_flight_telemetry,
            commands::save_flight,
            commands::delete_flight,
            commands::wipe_all_user_data,
            commands::save_telemetry_batch,
            commands::search_airports_near,
            commands::get_visited_stats,
            commands::record_airport_visit,
            commands::export_flight,
            commands::export_logbook,
            commands::get_airports_count,
            commands::get_airport,
            commands::get_all_airports,
            commands::get_airport_runways,
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
            commands::set_efb_route,
            commands::get_documentation_files,
            commands::save_document_metadata,
            commands::record_document_opened,
            commands::read_document_file,
            commands::open_user_docs_folder,
            commands::open_directory_dialog,
            commands::show_touchdown_overlay,
            commands::hide_touchdown_overlay,
            navigraph_auth::navigraph_start_device_auth,
            navigraph_auth::navigraph_poll_device_token,
            navigraph_auth::navigraph_get_auth_status,
            navigraph_auth::navigraph_logout,
            navigraph_airac::navigraph_get_airac_status,
            navigraph_airac::navigraph_check_airac_packages,
            navigraph_airac::navigraph_download_airac,
            navigraph_procedures::navigraph_get_airport_procedures,
            navigraph_procedures::navigraph_calculate_airway_route
        ])
        .run(tauri::generate_context!())
        .expect("error while running apollo flight application");
}
