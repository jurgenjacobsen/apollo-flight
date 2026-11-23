use std::collections::{BinaryHeap, HashMap};
use std::cmp::Ordering;
use tauri::AppHandle;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcedureWaypoint {
    pub ident: String,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_desc: Option<String>,
    pub altitude1: Option<i32>,
    pub speed_limit: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcedureItem {
    pub ident: String,
    pub transition: Option<String>,
    pub runway: Option<String>,
    pub waypoints: Vec<ProcedureWaypoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AirportProceduresResult {
    pub icao: String,
    pub has_airac: bool,
    pub sids: Vec<ProcedureItem>,
    pub stars: Vec<ProcedureItem>,
    pub iaps: Vec<ProcedureItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AirwayWaypointResult {
    pub ident: String,
    pub latitude: f64,
    pub longitude: f64,
    pub airway: Option<String>,
    pub sequence: u32,
    pub distance_nm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AirwayRouteResult {
    pub departure_icao: String,
    pub arrival_icao: String,
    pub sid_used: Option<String>,
    pub star_used: Option<String>,
    pub total_distance_nm: f64,
    pub waypoints: Vec<AirwayWaypointResult>,
}

fn haversine_nm(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r_nm = 3440.065;
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let a = (d_lat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();
    r_nm * c
}

fn query_procedure_table(
    conn: &rusqlite::Connection,
    table_name: &str,
    airport_icao: &str,
) -> Result<Vec<ProcedureItem>, String> {
    let sql = format!(
        "SELECT procedure_identifier, transition_identifier, seqno, waypoint_identifier, \
         waypoint_latitude, waypoint_longitude \
         FROM {} WHERE airport_identifier = ?1 \
         ORDER BY procedure_identifier, transition_identifier, seqno ASC",
        table_name
    );

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Ok(Vec::new()),
    };

    struct RawRow {
        proc_id: String,
        trans_id: Option<String>,
        _seqno: i32,
        wpt_id: String,
        lat: Option<f64>,
        lon: Option<f64>,
    }

    let rows = stmt
        .query_map([airport_icao], |row| {
            Ok(RawRow {
                proc_id: row.get(0)?,
                trans_id: row.get(1)?,
                _seqno: row.get(2)?,
                wpt_id: row.get(3)?,
                lat: row.get(4)?,
                lon: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items_map: HashMap<(String, Option<String>), Vec<ProcedureWaypoint>> = HashMap::new();
    let mut order_list: Vec<(String, Option<String>)> = Vec::new();

    for r in rows.flatten() {
        let key = (r.proc_id.clone(), r.trans_id.clone());
        if !items_map.contains_key(&key) {
            order_list.push(key.clone());
        }
        if let (Some(lat), Some(lon)) = (r.lat, r.lon) {
            items_map.entry(key).or_default().push(ProcedureWaypoint {
                ident: r.wpt_id,
                latitude: lat,
                longitude: lon,
                altitude_desc: None,
                altitude1: None,
                speed_limit: None,
            });
        }
    }

    let result = order_list
        .into_iter()
        .map(|(proc_id, trans_id)| {
            let waypoints = items_map.remove(&(proc_id.clone(), trans_id.clone())).unwrap_or_default();
            ProcedureItem {
                ident: proc_id,
                transition: trans_id,
                runway: None,
                waypoints,
            }
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub fn navigraph_get_airport_procedures(
    app: AppHandle,
    airport_icao: String,
) -> Result<AirportProceduresResult, String> {
    let db_path = crate::navigraph_airac::get_airac_db_path(&app);
    let icao = airport_icao.trim().to_uppercase();

    if !db_path.exists() {
        return Ok(AirportProceduresResult {
            icao,
            has_airac: false,
            sids: Vec::new(),
            stars: Vec::new(),
            iaps: Vec::new(),
        });
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ).map_err(|e| format!("Failed to open AIRAC database: {}", e))?;

    let sids = query_procedure_table(&conn, "tbl_sids", &icao)?;
    let stars = query_procedure_table(&conn, "tbl_stars", &icao)?;
    let iaps = query_procedure_table(&conn, "tbl_iaps", &icao)?;

    Ok(AirportProceduresResult {
        icao,
        has_airac: true,
        sids,
        stars,
        iaps,
    })
}

#[derive(Copy, Clone, PartialEq)]
struct AStarState {
    f_cost: f64,
    node_idx: usize,
}

impl Eq for AStarState {}

impl Ord for AStarState {
    fn cmp(&self, other: &Self) -> Ordering {
        other.f_cost.partial_cmp(&self.f_cost).unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for AStarState {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone)]
struct GraphEdge {
    target_idx: usize,
    airway: String,
    distance_nm: f64,
}

#[tauri::command]
pub fn navigraph_calculate_airway_route(
    app: AppHandle,
    departure_icao: String,
    arrival_icao: String,
    cruise_altitude_ft: u32,
    sid_ident: Option<String>,
    star_ident: Option<String>,
) -> Result<AirwayRouteResult, String> {
    let db_path = crate::navigraph_airac::get_airac_db_path(&app);
    let dep = departure_icao.trim().to_uppercase();
    let arr = arrival_icao.trim().to_uppercase();

    if !db_path.exists() {
        return Err("AIRAC SQLite database not installed.".to_string());
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ).map_err(|e| format!("Failed to open AIRAC database: {}", e))?;

    // 1. Get airport coordinates
    let get_airport_coord = |icao: &str| -> Result<(f64, f64), String> {
        conn.query_row(
            "SELECT latitude, longitude FROM tbl_airports WHERE icao_code = ?1",
            [icao],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| format!("Airport {} not found in AIRAC: {}", icao, e))
    };

    let dep_coord = get_airport_coord(&dep)?;
    let arr_coord = get_airport_coord(&arr)?;

    // 2. Resolve SID exit fix
    let mut start_ident = dep.clone();
    let mut start_coord = dep_coord;
    let mut sid_waypoints = Vec::new();

    if let Some(ref sid_name) = sid_ident {
        let procs = query_procedure_table(&conn, "tbl_sids", &dep)?;
        if let Some(p) = procs.into_iter().find(|p| &p.ident == sid_name) {
            if let Some(last_wpt) = p.waypoints.last() {
                start_ident = last_wpt.ident.clone();
                start_coord = (last_wpt.latitude, last_wpt.longitude);
            }
            sid_waypoints = p.waypoints;
        }
    }

    // 3. Resolve STAR entry fix
    let mut end_ident = arr.clone();
    let mut end_coord = arr_coord;
    let mut star_waypoints = Vec::new();

    if let Some(ref star_name) = star_ident {
        let procs = query_procedure_table(&conn, "tbl_stars", &arr)?;
        if let Some(p) = procs.into_iter().find(|p| &p.ident == star_name) {
            if let Some(first_wpt) = p.waypoints.first() {
                end_ident = first_wpt.ident.clone();
                end_coord = (first_wpt.latitude, first_wpt.longitude);
            }
            star_waypoints = p.waypoints;
        }
    }

    // 4. Bounding box for airways (+/- 4 degrees)
    let min_lat = dep_coord.0.min(arr_coord.0) - 4.0;
    let max_lat = dep_coord.0.max(arr_coord.0) + 4.0;
    let min_lon = dep_coord.1.min(arr_coord.1) - 4.0;
    let max_lon = dep_coord.1.max(arr_coord.1) + 4.0;

    // 5. Query candidate airways within bounding box & altitude clamping
    let mut stmt = conn.prepare(
        "SELECT route_identifier, seqno, waypoint_identifier, waypoint_latitude, waypoint_longitude \
         FROM tbl_enroute_airways \
         WHERE waypoint_latitude BETWEEN ?1 AND ?2 \
           AND waypoint_longitude BETWEEN ?3 AND ?4 \
           AND (?5 >= COALESCE(minimum_altitude1, 0)) \
           AND (?5 <= COALESCE(maximum_altitude, 99999)) \
         ORDER BY route_identifier, seqno ASC",
    ).map_err(|e| e.to_string())?;

    struct RawAirwayPt {
        airway: String,
        seqno: i32,
        ident: String,
        lat: f64,
        lon: f64,
    }

    let rows = stmt.query_map(
        rusqlite::params![min_lat, max_lat, min_lon, max_lon, cruise_altitude_ft],
        |row| {
            Ok(RawAirwayPt {
                airway: row.get(0)?,
                seqno: row.get(1)?,
                ident: row.get(2)?,
                lat: row.get(3)?,
                lon: row.get(4)?,
            })
        },
    ).map_err(|e| e.to_string())?;

    let mut points_by_airway: HashMap<String, Vec<RawAirwayPt>> = HashMap::new();
    for r in rows.flatten() {
        points_by_airway.entry(r.airway.clone()).or_default().push(r);
    }

    // 6. Build in-memory adjacency graph
    let mut node_indices: HashMap<String, usize> = HashMap::new();
    let mut node_coords: Vec<(String, f64, f64)> = Vec::new();

    fn get_or_create(
        indices: &mut HashMap<String, usize>,
        coords: &mut Vec<(String, f64, f64)>,
        ident: &str,
        lat: f64,
        lon: f64,
    ) -> usize {
        if let Some(&idx) = indices.get(ident) {
            idx
        } else {
            let idx = coords.len();
            coords.push((ident.to_string(), lat, lon));
            indices.insert(ident.to_string(), idx);
            idx
        }
    }

    let start_node = get_or_create(&mut node_indices, &mut node_coords, &start_ident, start_coord.0, start_coord.1);
    let end_node = get_or_create(&mut node_indices, &mut node_coords, &end_ident, end_coord.0, end_coord.1);

    let mut adj: Vec<Vec<GraphEdge>> = Vec::new();

    for (airway_name, pts) in points_by_airway.iter() {
        for window in pts.windows(2) {
            let p1 = &window[0];
            let p2 = &window[1];
            if (p2.seqno - p1.seqno).abs() == 1 {
                let u = get_or_create(&mut node_indices, &mut node_coords, &p1.ident, p1.lat, p1.lon);
                let v = get_or_create(&mut node_indices, &mut node_coords, &p2.ident, p2.lat, p2.lon);
                let max_idx = std::cmp::max(u, v);
                if max_idx >= adj.len() {
                    adj.resize_with(max_idx + 1, Vec::new);
                }

                let dist = haversine_nm(p1.lat, p1.lon, p2.lat, p2.lon);

                adj[u].push(GraphEdge {
                    target_idx: v,
                    airway: airway_name.clone(),
                    distance_nm: dist,
                });
                adj[v].push(GraphEdge {
                    target_idx: u,
                    airway: airway_name.clone(),
                    distance_nm: dist,
                });
            }
        }
    }

    if adj.len() < node_coords.len() {
        adj.resize_with(node_coords.len(), Vec::new);
    }

    // Connect start node to nearby airway fixes (< 120 NM) if not already on an airway
    if adj[start_node].is_empty() {
        for i in 0..node_coords.len() {
            if i != start_node && i != end_node {
                let d = haversine_nm(start_coord.0, start_coord.1, node_coords[i].1, node_coords[i].2);
                if d <= 120.0 {
                    adj[start_node].push(GraphEdge {
                        target_idx: i,
                        airway: "DCT".to_string(),
                        distance_nm: d,
                    });
                }
            }
        }
    }

    // Connect airway fixes near end node (< 120 NM)
    for i in 0..node_coords.len() {
        if i != end_node && i != start_node && !adj[i].is_empty() {
            let d = haversine_nm(node_coords[i].1, node_coords[i].2, end_coord.0, end_coord.1);
            if d <= 120.0 {
                adj[i].push(GraphEdge {
                    target_idx: end_node,
                    airway: "DCT".to_string(),
                    distance_nm: d,
                });
            }
        }
    }

    // 7. A* Search
    let mut dist: Vec<f64> = vec![f64::INFINITY; node_coords.len()];
    let mut prev: Vec<Option<(usize, String, f64)>> = vec![None; node_coords.len()];
    let mut heap = BinaryHeap::new();

    dist[start_node] = 0.0;
    heap.push(AStarState {
        f_cost: haversine_nm(start_coord.0, start_coord.1, end_coord.0, end_coord.1),
        node_idx: start_node,
    });

    let mut path_found = false;

    while let Some(AStarState { node_idx, .. }) = heap.pop() {
        if node_idx == end_node {
            path_found = true;
            break;
        }

        for edge in &adj[node_idx] {
            let next_cost = dist[node_idx] + edge.distance_nm;
            if next_cost < dist[edge.target_idx] {
                dist[edge.target_idx] = next_cost;
                prev[edge.target_idx] = Some((node_idx, edge.airway.clone(), edge.distance_nm));
                let h = haversine_nm(
                    node_coords[edge.target_idx].1,
                    node_coords[edge.target_idx].2,
                    end_coord.0,
                    end_coord.1,
                );
                heap.push(AStarState {
                    f_cost: next_cost + h,
                    node_idx: edge.target_idx,
                });
            }
        }
    }

    // 8. Reconstruct path
    let mut final_waypoints: Vec<AirwayWaypointResult> = Vec::new();
    let mut seq = 1;

    // Add SID waypoints first
    for (i, w) in sid_waypoints.iter().enumerate() {
        final_waypoints.push(AirwayWaypointResult {
            ident: w.ident.clone(),
            latitude: w.latitude,
            longitude: w.longitude,
            airway: sid_ident.clone(),
            sequence: seq,
            distance_nm: if i == 0 {
                0.0
            } else {
                haversine_nm(sid_waypoints[i - 1].latitude, sid_waypoints[i - 1].longitude, w.latitude, w.longitude)
            },
        });
        seq += 1;
    }

    if path_found {
        let mut curr = end_node;
        let mut enroute_rev = Vec::new();

        while let Some((p_idx, airway, d_nm)) = prev[curr].take() {
            if curr != end_node || star_waypoints.is_empty() {
                enroute_rev.push((curr, airway, d_nm));
            }
            if p_idx == start_node {
                break;
            }
            curr = p_idx;
        }

        enroute_rev.reverse();

        for (idx, airway, d_nm) in enroute_rev {
            let (ref ident, lat, lon) = node_coords[idx];
            final_waypoints.push(AirwayWaypointResult {
                ident: ident.clone(),
                latitude: lat,
                longitude: lon,
                airway: Some(airway),
                sequence: seq,
                distance_nm: d_nm,
            });
            seq += 1;
        }
    } else {
        // Direct leg fallback if no contiguous airway path
        let d = haversine_nm(start_coord.0, start_coord.1, end_coord.0, end_coord.1);
        final_waypoints.push(AirwayWaypointResult {
            ident: end_ident,
            latitude: end_coord.0,
            longitude: end_coord.1,
            airway: Some("DCT".to_string()),
            sequence: seq,
            distance_nm: d,
        });
        seq += 1;
    }

    // Append STAR waypoints
    for (i, w) in star_waypoints.iter().enumerate() {
        final_waypoints.push(AirwayWaypointResult {
            ident: w.ident.clone(),
            latitude: w.latitude,
            longitude: w.longitude,
            airway: star_ident.clone(),
            sequence: seq,
            distance_nm: if i == 0 {
                0.0
            } else {
                haversine_nm(star_waypoints[i - 1].latitude, star_waypoints[i - 1].longitude, w.latitude, w.longitude)
            },
        });
        seq += 1;
    }

    let total_dist = final_waypoints.iter().map(|w| w.distance_nm).sum();

    Ok(AirwayRouteResult {
        departure_icao: dep,
        arrival_icao: arr,
        sid_used: sid_ident,
        star_used: star_ident,
        total_distance_nm: total_dist,
        waypoints: final_waypoints,
    })
}
