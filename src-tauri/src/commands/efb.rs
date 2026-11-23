use tauri::AppHandle;
use crate::efb;

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

