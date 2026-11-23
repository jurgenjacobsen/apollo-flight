use rusqlite::{params, Connection, Result};
use super::*;

/// Calculates the perpendicular distance (in nautical miles approximation) from point P to segment AB
fn perpendicular_distance_nm(
    p_lat: f64,
    p_lon: f64,
    a_lat: f64,
    a_lon: f64,
    b_lat: f64,
    b_lon: f64,
) -> f64 {
    let avg_lat_rad = ((a_lat + b_lat) / 2.0).to_radians();
    let cos_lat = avg_lat_rad.cos();
    let dx = (b_lon - a_lon) * cos_lat;
    let dy = b_lat - a_lat;
    let seg_len_sq = dx * dx + dy * dy;

    if seg_len_sq < 1e-12 {
        let px = (p_lon - a_lon) * cos_lat;
        let py = p_lat - a_lat;
        return (px * px + py * py).sqrt() * 60.0;
    }

    let px = (p_lon - a_lon) * cos_lat;
    let py = p_lat - a_lat;
    let num = (dy * px - dx * py).abs();
    let dist_deg = num / seg_len_sq.sqrt();
    dist_deg * 60.0
}

/// Recursive Ramer-Douglas-Peucker simplification indices marker
fn rdp_simplify_indices(
    points: &[TelemetryPointRecord],
    epsilon_nm: f64,
    start_idx: usize,
    end_idx: usize,
    kept: &mut Vec<bool>,
) {
    if end_idx <= start_idx + 1 {
        return;
    }

    let a = &points[start_idx];
    let b = &points[end_idx];

    let mut max_dist = 0.0;
    let mut max_idx = start_idx;

    for i in (start_idx + 1)..end_idx {
        let p = &points[i];
        let d = perpendicular_distance_nm(
            p.latitude,
            p.longitude,
            a.latitude,
            a.longitude,
            b.latitude,
            b.longitude,
        );

        // Vertical profile sensitivity: altitude deviation from linear interpolation
        let t = (i - start_idx) as f64 / (end_idx - start_idx) as f64;
        let expected_alt = a.altitude_msl + t * (b.altitude_msl - a.altitude_msl);
        let alt_diff = (p.altitude_msl - expected_alt).abs();
        let effective_d = d + (alt_diff / 500.0) * 0.1; // 500 ft elevation error weighted as 0.1 NM

        if effective_d > max_dist {
            max_dist = effective_d;
            max_idx = i;
        }
    }

    if max_dist > epsilon_nm {
        kept[max_idx] = true;
        rdp_simplify_indices(points, epsilon_nm, start_idx, max_idx, kept);
        rdp_simplify_indices(points, epsilon_nm, max_idx, end_idx, kept);
    }
}

/// Downsamples telemetry points using the aeronautically tuned Ramer-Douglas-Peucker (RDP) algorithm.
/// - Guarantees 100% preservation of high-density 50 Hz points in terminal/ground zones (< 1,000 ft AGL and on ground).
/// - Recursively simplifies enroute high-altitude cruise segments to stay within the target point budget.
pub fn downsample_telemetry_rdp(
    points: &[TelemetryPointRecord],
    target_points: usize,
) -> Vec<TelemetryPointRecord> {
    if points.len() <= target_points || points.len() <= 2 {
        return points.to_vec();
    }

    let mut kept = vec![false; points.len()];
    kept[0] = true;
    kept[points.len() - 1] = true;

    // 1. Unconditionally preserve terminal / critical low-AGL and ground points (< 1,000 ft AGL or on ground)
    for (i, p) in points.iter().enumerate() {
        if p.is_on_ground || p.altitude_agl.unwrap_or(9999.0) < 1000.0 {
            kept[i] = true;
        }
    }

    // 2. Binary search adaptive epsilon to optimize simplification toward target_points
    let mut low_eps = 0.02;
    let mut high_eps = 5.0;
    let mut best_kept = kept.clone();

    for _ in 0..8 {
        let mid_eps = (low_eps + high_eps) / 2.0;
        let mut test_kept = kept.clone();

        let mut seg_start = 0;
        for i in 1..points.len() {
            if test_kept[i] {
                if i > seg_start + 1 {
                    rdp_simplify_indices(points, mid_eps, seg_start, i, &mut test_kept);
                }
                seg_start = i;
            }
        }
        if points.len() - 1 > seg_start + 1 {
            rdp_simplify_indices(points, mid_eps, seg_start, points.len() - 1, &mut test_kept);
        }

        let count = test_kept.iter().filter(|&&k| k).count();
        best_kept = test_kept;

        if count > target_points {
            low_eps = mid_eps;
        } else {
            high_eps = mid_eps;
        }
    }

    points
        .iter()
        .enumerate()
        .filter_map(|(i, p)| if best_kept[i] { Some(p.clone()) } else { None })
        .collect()
}

/// Retrieves flight details with downsampled telemetry track for optimized UI rendering (Leaflet/Recharts).
pub fn get_flight_details_downsampled(
    conn: &Connection,
    id: &str,
    max_points: Option<usize>,
) -> Result<Option<FlightDetails>> {
    let raw = match get_flight_details(conn, id)? {
        Some(d) => d,
        None => return Ok(None),
    };

    let target = max_points.unwrap_or(1500);
    let simplified_points = downsample_telemetry_rdp(&raw.telemetry_points, target);

    Ok(Some(FlightDetails {
        flight: raw.flight,
        telemetry_points: simplified_points,
    }))
}

pub fn haversine_distance_nm(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    if !lat1.is_finite() || !lon1.is_finite() || !lat2.is_finite() || !lon2.is_finite() {
        return 0.0;
    }
    if (lat1 - lat2).abs() < 1e-9 && (lon1 - lon2).abs() < 1e-9 {
        return 0.0;
    }
    let rad = std::f64::consts::PI / 180.0;
    let d_lat = (lat2 - lat1) * rad;
    let d_lon = (lon2 - lon1) * rad;
    let a = (d_lat / 2.0).sin().powi(2)
        + (lat1 * rad).cos() * (lat2 * rad).cos() * (d_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
    3440.065 * c
}

pub fn calculate_flight_distance(
    conn: &Connection,
    flight_id: &str,
    dep_icao: Option<&str>,
    arr_icao: Option<&str>,
) -> Result<f64> {
    let mut stmt = conn.prepare(
        "SELECT latitude, longitude FROM flight_telemetry WHERE flight_id = ?1 ORDER BY id ASC",
    )?;
    let points: Vec<(f64, f64)> = stmt
        .query_map(params![flight_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    let dep_apt = match dep_icao {
        Some(icao) => get_airport_by_icao(conn, icao).ok().flatten(),
        None => None,
    };
    let arr_apt = match arr_icao {
        Some(icao) => get_airport_by_icao(conn, icao).ok().flatten(),
        None => None,
    };

    let mut total_nm = 0.0;

    if !points.is_empty() {
        let first_point = points[0];
        let last_point = points[points.len() - 1];

        // 1. Distance from departure airport reference point to first recorded point
        if let Some(ref dep) = dep_apt {
            total_nm += haversine_distance_nm(dep.latitude, dep.longitude, first_point.0, first_point.1);
        }

        // 2. Cumulative distance between all consecutive recorded telemetry points
        for i in 0..(points.len() - 1) {
            total_nm += haversine_distance_nm(
                points[i].0,
                points[i].1,
                points[i + 1].0,
                points[i + 1].1,
            );
        }

        // 3. Distance from last recorded point to arrival airport reference point
        if let Some(ref arr) = arr_apt {
            total_nm += haversine_distance_nm(last_point.0, last_point.1, arr.latitude, arr.longitude);
        }
    } else if let (Some(ref dep), Some(ref arr)) = (&dep_apt, &arr_apt) {
        // Fallback: direct great circle distance between dep and arr airports if no telemetry recorded
        total_nm = haversine_distance_nm(dep.latitude, dep.longitude, arr.latitude, arr.longitude);
    }

    Ok((total_nm * 10.0).round() / 10.0)
}

pub fn save_telemetry_batch(conn: &Connection, points: &[TelemetryPointRecord]) -> Result<()> {
    if points.is_empty() {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare(
            r#"
            INSERT INTO flight_telemetry (
                flight_id, timestamp, latitude, longitude, altitude_msl, altitude_agl,
                indicated_airspeed, ground_speed, heading, pitch, bank, vertical_speed, is_on_ground,
                wind_speed, wind_direction, oat, tat, visibility
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
            "#,
        )?;

        for p in points {
            stmt.execute(params![
                p.flight_id,
                p.timestamp,
                p.latitude,
                p.longitude,
                p.altitude_msl,
                p.altitude_agl,
                p.indicated_airspeed,
                p.ground_speed,
                p.heading,
                p.pitch,
                p.bank,
                p.vertical_speed,
                p.is_on_ground,
                p.wind_speed,
                p.wind_direction,
                p.oat,
                p.tat,
                p.visibility,
            ])?;
        }
    }
    tx.commit()?;

    Ok(())
}

