use rusqlite::{params, Connection, Result};
use serde::Serialize;
use super::*;

pub fn get_flights(conn: &Connection) -> Result<Vec<FlightRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, aircraft_type, departure_icao, arrival_icao, start_time, end_time,
                flight_time_seconds, max_altitude, max_ground_speed, distance_flown_nm,
                landing_rate_fpm, status, min_oat, max_oat, min_visibility,
                avg_cruise_wind_speed, avg_cruise_wind_direction, max_wind_speed, max_wind_direction,
                total_weight
         FROM flights
         ORDER BY start_time DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(FlightRecord {
            id: row.get(0)?,
            aircraft_type: row.get(1)?,
            departure_icao: row.get(2)?,
            arrival_icao: row.get(3)?,
            start_time: row.get(4)?,
            end_time: row.get(5)?,
            flight_time_seconds: row.get(6)?,
            max_altitude: row.get(7)?,
            max_ground_speed: row.get(8)?,
            distance_flown_nm: row.get(9)?,
            landing_rate_fpm: row.get(10)?,
            status: row.get(11)?,
            min_oat: row.get(12)?,
            max_oat: row.get(13)?,
            min_visibility: row.get(14)?,
            avg_cruise_wind_speed: row.get(15)?,
            avg_cruise_wind_direction: row.get(16)?,
            max_wind_speed: row.get(17)?,
            max_wind_direction: row.get(18)?,
            total_weight: row.get(19)?,
        })
    })?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    drop(stmt);

    for flight in &mut result {
        if flight.distance_flown_nm <= 0.0 {
            if let Ok(dist) = calculate_flight_distance(
                conn,
                &flight.id,
                flight.departure_icao.as_deref(),
                flight.arrival_icao.as_deref(),
            ) {
                if dist > 0.0 {
                    flight.distance_flown_nm = dist;
                    let _ = conn.execute(
                        "UPDATE flights SET distance_flown_nm = ?1 WHERE id = ?2",
                        params![dist, flight.id],
                    );
                }
            }
        }
    }

    Ok(result)
}

pub fn get_flight_details(conn: &Connection, id: &str) -> Result<Option<FlightDetails>> {
    let mut flight_stmt = conn.prepare(
        "SELECT id, aircraft_type, departure_icao, arrival_icao, start_time, end_time,
                flight_time_seconds, max_altitude, max_ground_speed, distance_flown_nm,
                landing_rate_fpm, status, min_oat, max_oat, min_visibility,
                avg_cruise_wind_speed, avg_cruise_wind_direction, max_wind_speed, max_wind_direction,
                total_weight
         FROM flights WHERE id = ?1",
    )?;

    let mut flight_rows = flight_stmt.query_map(params![id], |row| {
        Ok(FlightRecord {
            id: row.get(0)?,
            aircraft_type: row.get(1)?,
            departure_icao: row.get(2)?,
            arrival_icao: row.get(3)?,
            start_time: row.get(4)?,
            end_time: row.get(5)?,
            flight_time_seconds: row.get(6)?,
            max_altitude: row.get(7)?,
            max_ground_speed: row.get(8)?,
            distance_flown_nm: row.get(9)?,
            landing_rate_fpm: row.get(10)?,
            status: row.get(11)?,
            min_oat: row.get(12)?,
            max_oat: row.get(13)?,
            min_visibility: row.get(14)?,
            avg_cruise_wind_speed: row.get(15)?,
            avg_cruise_wind_direction: row.get(16)?,
            max_wind_speed: row.get(17)?,
            max_wind_direction: row.get(18)?,
            total_weight: row.get(19)?,
        })
    })?;

    let mut flight = match flight_rows.next() {
        Some(f) => f?,
        None => return Ok(None),
    };
    drop(flight_rows);
    drop(flight_stmt);

    if flight.distance_flown_nm <= 0.0 {
        if let Ok(dist) = calculate_flight_distance(
            conn,
            &flight.id,
            flight.departure_icao.as_deref(),
            flight.arrival_icao.as_deref(),
        ) {
            if dist > 0.0 {
                flight.distance_flown_nm = dist;
                let _ = conn.execute(
                    "UPDATE flights SET distance_flown_nm = ?1 WHERE id = ?2",
                    params![dist, flight.id],
                );
            }
        }
    }

    let mut telem_stmt = conn.prepare(
        "SELECT flight_id, timestamp, latitude, longitude, altitude_msl, altitude_agl,
                indicated_airspeed, ground_speed, heading, pitch, bank, vertical_speed, is_on_ground,
                wind_speed, wind_direction, oat, tat, visibility
         FROM flight_telemetry
         WHERE flight_id = ?1
         ORDER BY id ASC",
    )?;

    let telem_rows = telem_stmt.query_map(params![id], |row| {
        Ok(TelemetryPointRecord {
            flight_id: row.get(0)?,
            timestamp: row.get(1)?,
            latitude: row.get(2)?,
            longitude: row.get(3)?,
            altitude_msl: row.get(4)?,
            altitude_agl: row.get(5)?,
            indicated_airspeed: row.get(6)?,
            ground_speed: row.get(7)?,
            heading: row.get(8)?,
            pitch: row.get(9)?,
            bank: row.get(10)?,
            vertical_speed: row.get(11)?,
            is_on_ground: row.get(12)?,
            wind_speed: row.get(13)?,
            wind_direction: row.get(14)?,
            oat: row.get(15)?,
            tat: row.get(16)?,
            visibility: row.get(17)?,
        })
    })?;

    let mut points = Vec::new();
    for p in telem_rows {
        points.push(p?);
    }

    Ok(Some(FlightDetails {
        flight,
        telemetry_points: points,
    }))
}

pub fn save_flight(conn: &Connection, flight: &FlightRecord) -> Result<()> {
    let mut distance = flight.distance_flown_nm;
    // When saved, if distance is <= 0.0, solve it from recorded points and dep/arr airports
    if distance <= 0.0 {
        if let Ok(solved) = calculate_flight_distance(
            conn,
            &flight.id,
            flight.departure_icao.as_deref(),
            flight.arrival_icao.as_deref(),
        ) {
            if solved > 0.0 {
                distance = solved;
            }
        }
    }

    let normalized_status = match flight.status.to_uppercase().as_str() {
        "RECORDING" => "RECORDING",
        "DISCARDED" => "DISCARDED",
        _ => "COMPLETED",
    };

    conn.execute(
        r#"
        INSERT INTO flights (
            id, aircraft_type, departure_icao, arrival_icao, start_time, end_time,
            flight_time_seconds, max_altitude, max_ground_speed, distance_flown_nm,
            landing_rate_fpm, status, min_oat, max_oat, min_visibility,
            avg_cruise_wind_speed, avg_cruise_wind_direction, max_wind_speed, max_wind_direction,
            total_weight
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
        ON CONFLICT(id) DO UPDATE SET
            aircraft_type = excluded.aircraft_type,
            departure_icao = excluded.departure_icao,
            arrival_icao = excluded.arrival_icao,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            flight_time_seconds = excluded.flight_time_seconds,
            max_altitude = excluded.max_altitude,
            max_ground_speed = excluded.max_ground_speed,
            distance_flown_nm = excluded.distance_flown_nm,
            landing_rate_fpm = excluded.landing_rate_fpm,
            status = excluded.status,
            min_oat = excluded.min_oat,
            max_oat = excluded.max_oat,
            min_visibility = excluded.min_visibility,
            avg_cruise_wind_speed = excluded.avg_cruise_wind_speed,
            avg_cruise_wind_direction = excluded.avg_cruise_wind_direction,
            max_wind_speed = excluded.max_wind_speed,
            max_wind_direction = excluded.max_wind_direction,
            total_weight = excluded.total_weight
        "#,
        params![
            flight.id,
            flight.aircraft_type,
            flight.departure_icao,
            flight.arrival_icao,
            flight.start_time,
            flight.end_time,
            flight.flight_time_seconds,
            flight.max_altitude,
            flight.max_ground_speed,
            distance,
            flight.landing_rate_fpm,
            normalized_status,
            flight.min_oat,
            flight.max_oat,
            flight.min_visibility,
            flight.avg_cruise_wind_speed,
            flight.avg_cruise_wind_direction,
            flight.max_wind_speed,
            flight.max_wind_direction,
            flight.total_weight,
        ],
    )?;

    Ok(())
}

pub fn delete_flight(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM flights WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn wipe_all_user_data(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "DELETE FROM flight_telemetry;
         DELETE FROM flights;
         DELETE FROM visited_airports;
         DELETE FROM visited_countries;
         DELETE FROM saved_routes;
         DELETE FROM user_settings;
         DELETE FROM document_metadata;
         VACUUM;",
    )?;
    Ok(())
}

fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn export_flight_format(conn: &Connection, id: &str, format: &str) -> Result<String, String> {
    let details = match get_flight_details(conn, id) {
        Ok(Some(d)) => d,
        Ok(None) => return Err(format!("Flight with id '{}' not found", id)),
        Err(e) => return Err(e.to_string()),
    };

    let f = &details.flight;
    let pts = &details.telemetry_points;

    match format.to_lowercase().as_str() {
        "gpx" => {
            let dep = xml_escape(f.departure_icao.as_deref().unwrap_or("UNKNOWN"));
            let arr = xml_escape(f.arrival_icao.as_deref().unwrap_or("UNKNOWN"));
            let ac_type = xml_escape(&f.aircraft_type);
            let fl_id = xml_escape(&f.id);
            let start_time = xml_escape(&f.start_time);

            let mut out = String::new();
            out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            out.push_str("<gpx version=\"1.1\" creator=\"Apollo Flight\"\n");
            out.push_str("  xmlns=\"http://www.topografix.com/GPX/1/1\">\n");
            out.push_str(&format!(
                "  <metadata><name>{} to {} - {}</name><time>{}</time></metadata>\n",
                dep, arr, ac_type, start_time
            ));
            out.push_str("  <trk>\n");
            out.push_str(&format!("    <name>Flight {}</name>\n", fl_id));
            out.push_str("    <trkseg>\n");
            for p in pts {
                let ele_m = p.altitude_msl * 0.3048;
                let ts = xml_escape(&p.timestamp);
                out.push_str(&format!(
                    "      <trkpt lat=\"{:.6}\" lon=\"{:.6}\"><ele>{:.1}</ele><time>{}</time></trkpt>\n",
                    p.latitude, p.longitude, ele_m, ts
                ));
            }
            out.push_str("    </trkseg>\n");
            out.push_str("  </trk>\n");
            out.push_str("</gpx>\n");
            Ok(out)
        }
        "kml" => {
            let mut out = String::new();
            let dep = xml_escape(f.departure_icao.as_deref().unwrap_or("UNKNOWN"));
            let arr = xml_escape(f.arrival_icao.as_deref().unwrap_or("UNKNOWN"));
            let ac_type = xml_escape(&f.aircraft_type);

            out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            out.push_str("<kml xmlns=\"http://www.opengis.net/kml/2.2\">\n");
            out.push_str("  <Document>\n");
            out.push_str(&format!("    <name>Flight {} to {} ({})</name>\n", dep, arr, ac_type));
            out.push_str("    <Style id=\"airborneTrajectory\">\n");
            out.push_str("      <LineStyle><color>ffff7000</color><width>3</width></LineStyle>\n");
            out.push_str("      <PolyStyle><color>44ff7000</color></PolyStyle>\n");
            out.push_str("    </Style>\n");
            out.push_str("    <Style id=\"groundTrack\">\n");
            out.push_str("      <LineStyle><color>ff00aa00</color><width>3</width></LineStyle>\n");
            out.push_str("    </Style>\n");
            out.push_str("    <Folder>\n");
            out.push_str("      <name>3D Flight Trajectory</name>\n");
            out.push_str("      <Placemark>\n");
            out.push_str(&format!("        <name>Airborne Profile ({} to {})</name>\n", dep, arr));
            out.push_str("        <styleUrl>#airborneTrajectory</styleUrl>\n");
            out.push_str("        <LineString>\n");
            out.push_str("          <extrude>1</extrude>\n");
            out.push_str("          <tessellate>1</tessellate>\n");
            out.push_str("          <altitudeMode>absolute</altitudeMode>\n");
            out.push_str("          <coordinates>\n");
            for p in pts {
                let ele_m = p.altitude_msl * 0.3048;
                out.push_str(&format!("            {:.6},{:.6},{:.1}\n", p.longitude, p.latitude, ele_m));
            }
            out.push_str("          </coordinates>\n");
            out.push_str("        </LineString>\n");
            out.push_str("      </Placemark>\n");
            out.push_str("    </Folder>\n");
            out.push_str("    <Folder>\n");
            out.push_str("      <name>Ground Track (Surface Footprint)</name>\n");
            out.push_str("      <Placemark>\n");
            out.push_str(&format!("        <name>Runway and Ground Track ({} to {})</name>\n", dep, arr));
            out.push_str("        <styleUrl>#groundTrack</styleUrl>\n");
            out.push_str("        <LineString>\n");
            out.push_str("          <tessellate>1</tessellate>\n");
            out.push_str("          <altitudeMode>clampToGround</altitudeMode>\n");
            out.push_str("          <coordinates>\n");
            for p in pts {
                out.push_str(&format!("            {:.6},{:.6},0\n", p.longitude, p.latitude));
            }
            out.push_str("          </coordinates>\n");
            out.push_str("        </LineString>\n");
            out.push_str("      </Placemark>\n");
            out.push_str("    </Folder>\n");
            out.push_str("  </Document>\n");
            out.push_str("</kml>\n");
            Ok(out)
        }
        "geojson" => {
            let coords: Vec<[f64; 3]> = pts
                .iter()
                .map(|p| [p.longitude, p.latitude, p.altitude_msl * 0.3048])
                .collect();

            let geojson = serde_json::json!({
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {
                            "id": f.id,
                            "aircraftType": f.aircraft_type,
                            "departureIcao": f.departure_icao,
                            "arrivalIcao": f.arrival_icao,
                            "startTime": f.start_time,
                            "endTime": f.end_time,
                            "durationMinutes": (f.flight_time_seconds as f64 / 60.0).round(),
                            "distanceNm": f.distance_flown_nm,
                            "maxAltitudeFt": f.max_altitude,
                            "maxGroundSpeedKt": f.max_ground_speed,
                            "landingRateFpm": f.landing_rate_fpm,
                            "minOat": f.min_oat,
                            "maxOat": f.max_oat,
                            "minVisibility": f.min_visibility,
                            "avgCruiseWindSpeed": f.avg_cruise_wind_speed,
                            "avgCruiseWindDirection": f.avg_cruise_wind_direction,
                            "maxWindSpeed": f.max_wind_speed,
                            "maxWindDirection": f.max_wind_direction
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": coords
                        }
                    }
                ]
            });
            serde_json::to_string_pretty(&geojson).map_err(|e| e.to_string())
        }
        "csv" => {
            let mut out = String::new();
            out.push_str("flight_id,timestamp,latitude,longitude,altitude_msl,altitude_agl,indicated_airspeed,ground_speed,heading,vertical_speed,is_on_ground,wind_speed,wind_direction,oat,tat,visibility\n");
            for p in pts {
                out.push_str(&format!(
                    "{},{},{:.6},{:.6},{:.1},{:.1},{:.1},{:.1},{:.1},{:.1},{},{},{},{},{},{}\n",
                    p.flight_id,
                    p.timestamp,
                    p.latitude,
                    p.longitude,
                    p.altitude_msl,
                    p.altitude_agl.unwrap_or(0.0),
                    p.indicated_airspeed,
                    p.ground_speed,
                    p.heading,
                    p.vertical_speed.unwrap_or(0.0),
                    p.is_on_ground,
                    p.wind_speed.map(|v| format!("{:.1}", v)).unwrap_or_default(),
                    p.wind_direction.map(|v| format!("{:.1}", v)).unwrap_or_default(),
                    p.oat.map(|v| format!("{:.1}", v)).unwrap_or_default(),
                    p.tat.map(|v| format!("{:.1}", v)).unwrap_or_default(),
                    p.visibility.map(|v| format!("{:.1}", v)).unwrap_or_default()
                ));
            }
            Ok(out)
        }
        _ => Err(format!("Unsupported export format '{}'. Supported: gpx, kml, geojson, csv", format)),
    }
}

pub fn export_logbook_format(conn: &Connection, format: &str) -> Result<String, String> {
    let flights = get_flights(conn).map_err(|e| e.to_string())?;

    match format.to_lowercase().as_str() {
        "csv" => {
            let mut out = String::from(
                "Flight ID,Departure ICAO,Arrival ICAO,Aircraft Type,Start Time (UTC),End Time (UTC),Duration (Seconds),Duration,Distance (NM),Max Altitude (ft),Peak Ground Speed (kt),Landing Rate (fpm),Gross Weight (lbs),Status\r\n",
            );
            for f in flights {
                let mins = (f.flight_time_seconds + 30) / 60;
                let hrs = mins / 60;
                let rem_mins = mins % 60;
                let duration_fmt = format!("{}h {:02}m", hrs, rem_mins);

                let escape_csv = |val: &str| -> String {
                    if val.contains(',') || val.contains('"') || val.contains('\n') || val.contains('\r') {
                        format!("\"{}\"", val.replace('"', "\"\""))
                    } else {
                        val.to_string()
                    }
                };

                out.push_str(&format!(
                    "{},{},{},{},{},{},{},{},{:.1},{},{},{},{},{}\r\n",
                    escape_csv(&f.id),
                    escape_csv(f.departure_icao.as_deref().unwrap_or("")),
                    escape_csv(f.arrival_icao.as_deref().unwrap_or("")),
                    escape_csv(&f.aircraft_type),
                    escape_csv(&f.start_time),
                    escape_csv(f.end_time.as_deref().unwrap_or("")),
                    f.flight_time_seconds,
                    escape_csv(&duration_fmt),
                    f.distance_flown_nm,
                    f.max_altitude,
                    f.max_ground_speed,
                    f.landing_rate_fpm
                        .map(|lr| format!("{:.0}", lr.round()))
                        .unwrap_or_default(),
                    f.total_weight
                        .map(|w| format!("{:.0}", w.round()))
                        .unwrap_or_default(),
                    escape_csv(&f.status)
                ));
            }
            Ok(out)
        }
        "json" => {
            #[derive(Serialize)]
            #[serde(rename_all = "camelCase")]
            struct LogbookFlightItem<'a> {
                id: &'a str,
                departure_icao: &'a str,
                arrival_icao: &'a str,
                aircraft_type: &'a str,
                start_time: &'a str,
                end_time: Option<&'a str>,
                flight_time_seconds: i64,
                flight_time_formatted: String,
                distance_nm: f64,
                max_altitude_ft: i64,
                max_ground_speed_kt: i64,
                landing_rate_fpm: Option<f64>,
                gross_weight_lbs: Option<f64>,
                status: &'a str,
            }

            let items: Vec<LogbookFlightItem> = flights
                .iter()
                .map(|f| {
                    let mins = (f.flight_time_seconds + 30) / 60;
                    let hrs = mins / 60;
                    let rem_mins = mins % 60;
                    let duration_fmt = format!("{}h {:02}m", hrs, rem_mins);

                    LogbookFlightItem {
                        id: &f.id,
                        departure_icao: f.departure_icao.as_deref().unwrap_or(""),
                        arrival_icao: f.arrival_icao.as_deref().unwrap_or(""),
                        aircraft_type: &f.aircraft_type,
                        start_time: &f.start_time,
                        end_time: f.end_time.as_deref(),
                        flight_time_seconds: f.flight_time_seconds,
                        flight_time_formatted: duration_fmt,
                        distance_nm: (f.distance_flown_nm * 10.0).round() / 10.0,
                        max_altitude_ft: f.max_altitude,
                        max_ground_speed_kt: f.max_ground_speed,
                        landing_rate_fpm: f.landing_rate_fpm.map(|lr| lr.round()),
                        gross_weight_lbs: f.total_weight.map(|w| w.round()),
                        status: &f.status,
                    }
                })
                .collect();

            serde_json::to_string_pretty(&items).map_err(|e| e.to_string())
        }
        _ => Err(format!(
            "Unsupported logbook export format '{}'. Supported: csv, json",
            format
        )),
    }
}

