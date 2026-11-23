use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};
use crate::{db, get_app_data_dir, DbState, IS_SYNCING_DATASET};

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
        let conn = state.logbook_read.lock().map_err(|e| e.to_string())?;
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
    pub fn get_all_airports(
        state: tauri::State<'_, DbState>,
    ) -> Result<Vec<db::Airport>, String> {
        let conn = state.navdata.lock().map_err(|e| e.to_string())?;
        db::get_all_airports(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_airport_runways(
        state: tauri::State<'_, DbState>,
        icao: String,
    ) -> Result<Vec<db::Runway>, String> {
        let conn = state.navdata.lock().map_err(|e| e.to_string())?;
        db::get_airport_runways(&conn, &icao).map_err(|e| e.to_string())
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
        let conn = state.logbook_read.lock().map_err(|e| e.to_string())?;
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

