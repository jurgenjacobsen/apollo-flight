use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};
use crate::{db, fsuipc, get_worker_state, DbState};

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
    pub fn save_telemetry_batch(
        state: tauri::State<'_, DbState>,
        points: Vec<db::TelemetryPointRecord>,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::save_telemetry_batch(&conn, &points).map_err(|e| e.to_string())
    }


    #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct TouchdownOverlayPayload {
        pub vertical_speed_fpm: f64,
        pub g_force: f64,
        pub indicated_airspeed_kt: Option<f64>,
        pub ground_speed_kt: f64,
        pub headwind_kt: Option<f64>,
        pub crosswind_kt: Option<f64>,
        pub pitch_deg: Option<f64>,
        pub bank_deg: Option<f64>,
        pub airport_icao: Option<String>,
        pub runway_ident: Option<String>,
        pub grade: String,
        pub duration_seconds: Option<u64>,
        pub position: Option<String>,
        pub theme: Option<String>,
    }

    #[tauri::command]
    pub fn show_touchdown_overlay(
        app: AppHandle,
        payload: TouchdownOverlayPayload,
    ) -> Result<(), String> {
        let _ = app.emit("touchdown-overlay-data", &payload);

        if let Some(window) = app.get_webview_window("touchdown-overlay") {
            let pos_str = payload.position.as_deref().unwrap_or("top-right");
            if let Ok(Some(monitor)) = window.current_monitor() {
                let mon_size = monitor.size();
                let mon_pos = monitor.position();
                let scale = monitor.scale_factor();

                let win_width = (380.0 * scale) as i32;
                let win_height = (250.0 * scale) as i32;

                let left_x = mon_pos.x + (28.0 * scale) as i32;
                let center_x = mon_pos.x + (mon_size.width as i32 - win_width) / 2;
                let right_x = mon_pos.x + mon_size.width as i32 - win_width - (28.0 * scale) as i32;
                let top_y = mon_pos.y + (32.0 * scale) as i32;
                let middle_y = mon_pos.y + (mon_size.height as i32 - win_height) / 2;
                let bottom_y = mon_pos.y + mon_size.height as i32 - win_height - (48.0 * scale) as i32;

                let (x, y) = match pos_str {
                    "top-left" => (left_x, top_y),
                    "top-center" => (center_x, top_y),
                    "top-right" => (right_x, top_y),
                    "middle-left" => (left_x, middle_y),
                    "middle-right" => (right_x, middle_y),
                    "bottom-left" => (left_x, bottom_y),
                    "bottom-center" => (center_x, bottom_y),
                    "bottom-right" => (right_x, bottom_y),
                    _ => (right_x, top_y),
                };
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)));
            }
            let _ = window.set_always_on_top(true);
            let _ = window.show();
        }
        Ok(())
    }

    #[tauri::command]
    pub fn hide_touchdown_overlay(app: AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("touchdown-overlay") {
            let _ = window.hide();
        }
        Ok(())
    }
