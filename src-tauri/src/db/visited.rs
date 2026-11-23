use rusqlite::{params, Connection, Result};
use super::*;

pub fn record_airport_visit(
    conn: &Connection,
    airport: &Airport,
    timestamp: &str,
) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO visited_airports (
            icao, name, country_code, country_name, latitude, longitude,
            first_visited, last_visited, visit_count
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, 1)
        ON CONFLICT(icao) DO UPDATE SET
            last_visited = excluded.last_visited,
            visit_count = visit_count + 1
        "#,
        params![
            airport.icao,
            airport.name,
            airport.country_code,
            airport.country_name,
            airport.latitude,
            airport.longitude,
            timestamp,
        ],
    )?;

    conn.execute(
        r#"
        INSERT INTO visited_countries (
            iso_a2, name, first_visited, last_visited, flight_count
        ) VALUES (?1, ?2, ?3, ?3, 1)
        ON CONFLICT(iso_a2) DO UPDATE SET
            last_visited = excluded.last_visited,
            flight_count = flight_count + 1
        "#,
        params![airport.country_code, airport.country_name, timestamp],
    )?;

    Ok(())
}

pub fn get_visited_stats(conn: &Connection) -> Result<VisitedStats> {
    let mut apt_stmt = conn.prepare(
        "SELECT icao, name, country_code, country_name, latitude, longitude,
                first_visited, last_visited, visit_count
         FROM visited_airports
         ORDER BY visit_count DESC, last_visited DESC",
    )?;

    let apt_rows = apt_stmt.query_map([], |row| {
        Ok(VisitedAirport {
            icao: row.get(0)?,
            name: row.get(1)?,
            country_code: row.get(2)?,
            country_name: row.get(3)?,
            latitude: row.get(4)?,
            longitude: row.get(5)?,
            first_visited: row.get(6)?,
            last_visited: row.get(7)?,
            visit_count: row.get(8)?,
        })
    })?;

    let mut airports = Vec::new();
    for a in apt_rows {
        airports.push(a?);
    }

    let mut ctry_stmt = conn.prepare(
        "SELECT iso_a2, name, first_visited, last_visited, flight_count
         FROM visited_countries
         ORDER BY flight_count DESC, last_visited DESC",
    )?;

    let ctry_rows = ctry_stmt.query_map([], |row| {
        Ok(VisitedCountry {
            iso_a2: row.get(0)?,
            name: row.get(1)?,
            first_visited: row.get(2)?,
            last_visited: row.get(3)?,
            flight_count: row.get(4)?,
        })
    })?;

    let mut countries = Vec::new();
    for c in ctry_rows {
        countries.push(c?);
    }

    let total_airports = airports.len();
    let total_countries = countries.len();

    Ok(VisitedStats {
        visited_airports: airports,
        visited_countries: countries,
        total_countries,
        total_airports,
    })
}

pub fn recompute_visited_stats(conn: &Connection) -> Result<()> {
    recompute_visited_stats_with_navdata(conn, conn)
}

pub fn recompute_visited_stats_with_navdata(conn: &Connection, navdata: &Connection) -> Result<()> {
    conn.execute("DELETE FROM visited_airports", [])?;
    conn.execute("DELETE FROM visited_countries", [])?;

    let mut stmt = conn.prepare(
        "SELECT id, departure_icao, arrival_icao, start_time, end_time FROM flights WHERE status != 'DISCARDED'",
    )?;

    struct RawFlight {
        id: String,
        dep_icao: Option<String>,
        arr_icao: Option<String>,
        time_str: String,
    }

    let flights = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let dep: Option<String> = row.get(1)?;
            let arr: Option<String> = row.get(2)?;
            let start_t: String = row.get(3)?;
            let end_t: Option<String> = row.get(4)?;
            let time_str = end_t.unwrap_or(start_t);
            Ok(RawFlight {
                id,
                dep_icao: dep,
                arr_icao: arr,
                time_str,
            })
        })?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    drop(stmt);

    for fl in flights {
        let mut unique_apts: std::collections::HashSet<String> = std::collections::HashSet::new();
        if let Some(ref d) = fl.dep_icao {
            let trimmed = d.trim().to_uppercase();
            if trimmed.len() == 4 && trimmed != "ZZZZ" {
                unique_apts.insert(trimmed);
            }
        }
        if let Some(ref a) = fl.arr_icao {
            let trimmed = a.trim().to_uppercase();
            if trimmed.len() == 4 && trimmed != "ZZZZ" {
                unique_apts.insert(trimmed);
            }
        }

        // Also check if telemetry points have intermediate touchdowns/landings
        if let Ok(mut tel_stmt) = conn.prepare(
            "SELECT latitude, longitude FROM flight_telemetry WHERE flight_id = ?1 AND is_on_ground = 1",
        ) {
            let ground_points = tel_stmt
                .query_map([&fl.id], |row| Ok((row.get(0)?, row.get(1)?)))
                .map(|mapped| mapped.filter_map(|r| r.ok()).collect::<Vec<(f64, f64)>>())
                .unwrap_or_default();
            drop(tel_stmt);

            for (lat, lon) in ground_points {
                if let Ok(Some(apt)) = search_airports_near(navdata, lat, lon, 3.0) {
                    if apt.icao.len() == 4 && apt.icao != "ZZZZ" {
                        unique_apts.insert(apt.icao);
                    }
                }
            }
        }

        let mut unique_countries: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();

        for icao in unique_apts {
            if let Ok(Some(apt)) = get_airport_by_icao(navdata, &icao) {
                conn.execute(
                    r#"
                    INSERT INTO visited_airports (
                        icao, name, country_code, country_name, latitude, longitude,
                        first_visited, last_visited, visit_count
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, 1)
                    ON CONFLICT(icao) DO UPDATE SET
                        last_visited = MAX(last_visited, excluded.last_visited),
                        first_visited = MIN(first_visited, excluded.first_visited),
                        visit_count = visit_count + 1
                    "#,
                    params![
                        apt.icao,
                        apt.name,
                        apt.country_code,
                        apt.country_name,
                        apt.latitude,
                        apt.longitude,
                        fl.time_str,
                    ],
                )?;

                unique_countries.insert((apt.country_code, apt.country_name));
            }
        }

        for (code, name) in unique_countries {
            conn.execute(
                r#"
                INSERT INTO visited_countries (
                    iso_a2, name, first_visited, last_visited, flight_count
                ) VALUES (?1, ?2, ?3, ?3, 1)
                ON CONFLICT(iso_a2) DO UPDATE SET
                    last_visited = MAX(last_visited, excluded.last_visited),
                    first_visited = MIN(first_visited, excluded.first_visited),
                    flight_count = flight_count + 1
                "#,
                params![code, name, fl.time_str],
            )?;
        }
    }

    Ok(())
}

