use rusqlite::{params, Connection, Result};
use super::*;

pub fn save_route(conn: &Connection, route: &SavedRouteRecord) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO saved_routes (
            id, name, aircraft_name, aircraft_category, departure_icao, arrival_icao,
            sector_count, total_distance_nm, total_airborne_minutes, total_duration_minutes,
            total_ground_minutes, include_ground_time, is_round_trip, status, is_favorite,
            sectors_json, created_at, flown_at, linked_flight_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            aircraft_name = excluded.aircraft_name,
            aircraft_category = excluded.aircraft_category,
            departure_icao = excluded.departure_icao,
            arrival_icao = excluded.arrival_icao,
            sector_count = excluded.sector_count,
            total_distance_nm = excluded.total_distance_nm,
            total_airborne_minutes = excluded.total_airborne_minutes,
            total_duration_minutes = excluded.total_duration_minutes,
            total_ground_minutes = excluded.total_ground_minutes,
            include_ground_time = excluded.include_ground_time,
            is_round_trip = excluded.is_round_trip,
            status = excluded.status,
            is_favorite = excluded.is_favorite,
            sectors_json = excluded.sectors_json,
            flown_at = excluded.flown_at,
            linked_flight_id = excluded.linked_flight_id
        "#,
        params![
            route.id,
            route.name,
            route.aircraft_name,
            route.aircraft_category,
            route.departure_icao,
            route.arrival_icao,
            route.sector_count,
            route.total_distance_nm,
            route.total_airborne_minutes,
            route.total_duration_minutes,
            route.total_ground_minutes,
            route.include_ground_time,
            route.is_round_trip,
            route.status,
            route.is_favorite,
            route.sectors_json,
            route.created_at,
            route.flown_at,
            route.linked_flight_id,
        ],
    )?;
    Ok(())
}

pub fn get_saved_routes(conn: &Connection) -> Result<Vec<SavedRouteRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, aircraft_name, aircraft_category, departure_icao, arrival_icao,
               sector_count, total_distance_nm, total_airborne_minutes, total_duration_minutes,
               total_ground_minutes, include_ground_time, is_round_trip, status, is_favorite,
               sectors_json, created_at, flown_at, linked_flight_id
        FROM saved_routes
        ORDER BY is_favorite DESC, created_at DESC
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SavedRouteRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            aircraft_name: row.get(2)?,
            aircraft_category: row.get(3)?,
            departure_icao: row.get(4)?,
            arrival_icao: row.get(5)?,
            sector_count: row.get(6)?,
            total_distance_nm: row.get(7)?,
            total_airborne_minutes: row.get(8)?,
            total_duration_minutes: row.get(9)?,
            total_ground_minutes: row.get(10)?,
            include_ground_time: row.get(11)?,
            is_round_trip: row.get(12)?,
            status: row.get(13)?,
            is_favorite: row.get(14)?,
            sectors_json: row.get(15)?,
            created_at: row.get(16)?,
            flown_at: row.get(17)?,
            linked_flight_id: row.get(18)?,
        })
    })?;

    let mut routes = Vec::new();
    for r in rows {
        routes.push(r?);
    }
    Ok(routes)
}

pub fn toggle_route_favorite(conn: &Connection, id: &str) -> Result<bool> {
    let current_fav: bool = conn.query_row(
        "SELECT is_favorite FROM saved_routes WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    let new_fav = !current_fav;
    conn.execute(
        "UPDATE saved_routes SET is_favorite = ?1 WHERE id = ?2",
        params![new_fav, id],
    )?;
    Ok(new_fav)
}

pub fn update_route_status(conn: &Connection, id: &str, status: &str, linked_flight_id: Option<&str>) -> Result<()> {
    let flown_at = if status == "flown" {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };
    conn.execute(
        "UPDATE saved_routes SET status = ?1, flown_at = ?2, linked_flight_id = ?3 WHERE id = ?4",
        params![status, flown_at, linked_flight_id, id],
    )?;
    Ok(())
}

pub fn delete_saved_route(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM saved_routes WHERE id = ?1", params![id])?;
    Ok(())
}

