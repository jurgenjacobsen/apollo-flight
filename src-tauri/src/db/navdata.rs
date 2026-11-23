use rusqlite::{params, Connection, Result};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use super::*;

pub fn seed_or_import_airports(conn: &mut Connection, resource_dirs: &[std::path::PathBuf]) -> Result<()> {
    let apt_count: i64 = conn.query_row("SELECT COUNT(*) FROM airports", [], |row| row.get(0)).unwrap_or(0);
    let rwy_count: i64 = conn.query_row("SELECT COUNT(*) FROM runways", [], |row| row.get(0)).unwrap_or(0);

    // Check if OurAirports CSV files exist in the app workspace, resources, or data directory
    let mut candidate_dirs: Vec<std::path::PathBuf> = Vec::new();
    for d in resource_dirs {
        candidate_dirs.push(d.clone());
    }
    candidate_dirs.push(std::path::PathBuf::from("data"));
    candidate_dirs.push(std::path::PathBuf::from("../data"));
    candidate_dirs.push(std::path::PathBuf::from("src-tauri/data"));
    candidate_dirs.push(std::path::PathBuf::from("src-tauri"));
    candidate_dirs.push(std::path::PathBuf::from("."));

    for dir in candidate_dirs {
        let apt_file = dir.join("airports.csv");
        let ctry_file = dir.join("countries.csv");
        let rwy_file = dir.join("runways.csv");

        if !cfg!(test) && apt_file.exists() && ctry_file.exists() {
            if apt_count < 500 {
                log::info!("Found OurAirports CSV files at {:?}, importing into aerotrack.db...", dir);
                if let Ok(imported) = import_ourairports_files(conn, &apt_file, &ctry_file) {
                    log::info!("Successfully imported {} airports from OurAirports CSV dataset.", imported);
                }
            }
            if rwy_file.exists() && (rwy_count == 0 || apt_count < 500) {
                if let Ok(imported_rwys) = import_runways_file(conn, &rwy_file) {
                    log::info!("Successfully imported {} runways from OurAirports.", imported_rwys);
                }
            }
            let total_now: i64 = conn.query_row("SELECT COUNT(*) FROM airports", [], |row| row.get(0)).unwrap_or(0);
            if total_now >= 500 {
                return Ok(());
            }
        }
    }

    // Fallback seed of top international hubs
    seed_fallback_airports(conn)?;
    Ok(())
}

pub fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_quotes && chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = !in_quotes;
                }
            }
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current = String::new();
            }
            _ => {
                current.push(c);
            }
        }
    }
    fields.push(current.trim().to_string());
    fields
}

pub fn import_ourairports_files<P: AsRef<Path>>(
    conn: &mut Connection,
    airports_path: P,
    countries_path: P,
) -> Result<usize> {
    import_ourairports_files_with_progress(conn, airports_path, countries_path, |_| {})
}

pub fn import_ourairports_files_with_progress<P: AsRef<Path>, F: FnMut(usize)>(
    conn: &mut Connection,
    airports_path: P,
    countries_path: P,
    mut on_batch: F,
) -> Result<usize> {
    // 1. Build countries map (ISO_A2 -> Full Name)
    let mut countries_map: HashMap<String, String> = HashMap::new();
    if let Ok(file) = File::open(countries_path) {
        let reader = BufReader::new(file);
        for (idx, line) in reader.lines().enumerate() {
            if idx == 0 {
                continue; // Skip header
            }
            if let Ok(l) = line {
                let cols = parse_csv_line(&l);
                if cols.len() >= 3 {
                    let code = cols[1].to_uppercase();
                    let name = cols[2].clone();
                    if !code.is_empty() && !name.is_empty() {
                        countries_map.insert(code, name);
                    }
                }
            }
        }
    }

    // 2. Stream airports into chunked SQLite transactions of 5,000 items
    let airports_file = File::open(airports_path)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let reader = BufReader::new(airports_file);

    let is_valid_icao = |s: &str| s.len() == 4 && s.chars().all(|c| c.is_ascii_alphabetic());

    let mut imported = 0usize;
    let mut batch_count = 0usize;
    const BATCH_SIZE: usize = 5000;

    let mut tx = conn.transaction()?;

    for (idx, line) in reader.lines().enumerate() {
        if idx == 0 {
            continue; // Skip header
        }
        let l = match line {
            Ok(s) => s,
            Err(_) => continue,
        };

        let cols = parse_csv_line(&l);
        if cols.len() < 11 {
            continue;
        }

        let apt_type = cols[2].trim().to_lowercase();
        let name = &cols[3];
        let name_lower = name.to_lowercase();

        // Strictly exclude closed facilities, helipads, heliports, seaplane bases, and balloonports
        if apt_type == "closed"
            || apt_type == "heliport"
            || apt_type == "helipad"
            || apt_type.contains("heli")
            || apt_type.contains("pad")
            || apt_type == "seaplane_base"
            || apt_type == "balloonport"
            || name_lower.contains("heliport")
            || name_lower.contains("helipad")
            || name_lower.contains("helistop")
        {
            continue;
        }

        let ident = cols[1].trim();
        if ident.is_empty() {
            continue;
        }

        // Strictly require official 4-letter alphabetic ICAO aerodrome designators (e.g. LOWI, EDDM, KJFK)
        let icao = if cols.len() > 12 && is_valid_icao(cols[12].trim()) {
            cols[12].trim().to_uppercase()
        } else if is_valid_icao(ident) {
            ident.to_uppercase()
        } else {
            // Not an official 4-letter ICAO airfield (e.g. PT-02313, 00AA, regional local codes), skip
            continue;
        };

        let lat: f64 = match cols[4].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };
        let lon: f64 = match cols[5].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };

        let ele: Option<i32> = cols[6].parse().ok();
        let country_code = cols[8].to_uppercase();
        let country_name = countries_map
            .get(&country_code)
            .cloned()
            .unwrap_or_else(|| country_code.clone());
        let municipality = if !cols[10].is_empty() {
            Some(cols[10].clone())
        } else {
            None
        };
        let continent = if cols.len() > 7 && !cols[7].is_empty() {
            cols[7].trim()
        } else {
            "NA"
        };

        tx.execute(
            "INSERT OR REPLACE INTO airports (
                icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                icao,
                name,
                lat,
                lon,
                ele,
                country_code,
                country_name,
                municipality,
                apt_type,
                continent
            ],
        )?;

        imported += 1;
        batch_count += 1;

        if batch_count >= BATCH_SIZE {
            tx.commit()?;
            on_batch(imported);
            std::thread::yield_now();
            tx = conn.transaction()?;
            batch_count = 0;
        }
    }

    if batch_count > 0 {
        tx.commit()?;
        on_batch(imported);
    } else {
        drop(tx);
    }

    Ok(imported)
}

pub fn is_paved_surface(surface: &str) -> bool {
    let s = surface.to_uppercase();
    s.contains("ASP") || s.contains("CON") || s.contains("BIT") 
       || s.contains("TAR") || s.contains("PEM") || s.contains("MAC") 
       || s.contains("PAVED") || s.contains("BRICK")
}

pub fn is_unpaved_surface(surface: &str) -> bool {
    let s = surface.to_uppercase();
    s.contains("TURF") || s.contains("GRS") || s.contains("GRASS") 
       || s.contains("DIRT") || s.contains("GRAVEL") || s.contains("GRVL") 
       || s.contains("GVL") || s.contains("EARTH") || s.contains("SAND") 
       || s.contains("CLAY") || s.contains("SOD") || s.contains("LATE") 
       || s.contains("CORAL") || s.contains("UNPAVED")
}

pub fn import_runways_file<P: AsRef<Path>>(conn: &mut Connection, runways_path: P) -> Result<usize> {
    import_runways_file_with_progress(conn, runways_path, |_| {})
}

pub fn import_runways_file_with_progress<P: AsRef<Path>, F: FnMut(usize)>(
    conn: &mut Connection,
    runways_path: P,
    mut on_batch: F,
) -> Result<usize> {
    let file = File::open(runways_path).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let reader = BufReader::new(file);

    let is_valid_icao = |s: &str| s.len() == 4 && s.chars().all(|c| c.is_ascii_alphabetic());

    let mut imported = 0usize;
    let mut batch_count = 0usize;
    const BATCH_SIZE: usize = 5000;

    let mut tx = conn.transaction()?;

    for (idx, line) in reader.lines().enumerate() {
        if idx == 0 {
            continue; // Skip header
        }
        let l = match line {
            Ok(s) => s,
            Err(_) => continue,
        };

        let cols = parse_csv_line(&l);
        if cols.len() < 8 {
            continue;
        }

        let ident = cols[2].trim().to_uppercase();
        if !is_valid_icao(&ident) {
            continue;
        }

        let id: Option<i64> = cols[0].parse().ok();
        let length_ft: Option<i32> = cols[3].parse().ok();
        let width_ft: Option<i32> = cols[4].parse().ok();
        let surface = cols[5].trim().to_uppercase();
        let lighted: bool = cols[6].trim() == "1";
        let closed: bool = cols[7].trim() == "1";

        let is_paved = is_paved_surface(&surface);
        let is_unpaved = is_unpaved_surface(&surface) || (!is_paved && surface != "WATER");

        tx.execute(
            "INSERT OR REPLACE INTO runways (
                id, airport_ident, length_ft, width_ft, surface, is_paved, is_unpaved, lighted, closed
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                ident,
                length_ft,
                width_ft,
                surface,
                is_paved,
                is_unpaved,
                lighted,
                closed
            ],
        )?;

        imported += 1;
        batch_count += 1;

        if batch_count >= BATCH_SIZE {
            tx.commit()?;
            on_batch(imported);
            std::thread::yield_now();
            tx = conn.transaction()?;
            batch_count = 0;
        }
    }

    if batch_count > 0 {
        tx.commit()?;
        on_batch(imported);
    } else {
        drop(tx);
    }

    // Update airport summary metrics
    conn.execute_batch(
        r#"
        UPDATE airports SET
            max_runway_length_ft = (
                SELECT MAX(length_ft) FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0
            ),
            max_paved_runway_length_ft = (
                SELECT MAX(length_ft) FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0 AND runways.is_paved = 1
            ),
            max_unpaved_runway_length_ft = (
                SELECT MAX(length_ft) FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0 AND runways.is_unpaved = 1
            ),
            has_paved = EXISTS (
                SELECT 1 FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0 AND runways.is_paved = 1
            ),
            has_unpaved = EXISTS (
                SELECT 1 FROM runways 
                WHERE runways.airport_ident = airports.icao AND runways.closed = 0 AND runways.is_unpaved = 1
            ),
            all_runways_closed = CASE
                WHEN EXISTS (SELECT 1 FROM runways WHERE runways.airport_ident = airports.icao)
                 AND NOT EXISTS (SELECT 1 FROM runways WHERE runways.airport_ident = airports.icao AND runways.closed = 0)
                THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM runways WHERE runways.airport_ident = airports.icao);
        "#
    )?;

    Ok(imported)
}

pub fn sync_ourairports_data<F>(
    conn: &mut Connection,
    work_dir: &Path,
    on_progress: F,
) -> Result<OurAirportsSyncResult, String>
where
    F: Fn(OurAirportsSyncProgress),
{
    let airports_path = work_dir.join("airports.csv");
    let countries_path = work_dir.join("countries.csv");
    let runways_path = work_dir.join("runways.csv");

    let curl_bin = if cfg!(windows) { "curl.exe" } else { "curl" };

    on_progress(OurAirportsSyncProgress {
        stage: "downloading".to_string(),
        percent: 5,
        message: "Fetching countries dataset from OurAirports...".to_string(),
    });

    let mut cmd1 = std::process::Command::new(curl_bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd1.creation_flags(0x08000000);
    }
    let _ = cmd1
        .args(["-L", "-s", "-o", countries_path.to_str().unwrap(), "https://davidmegginson.github.io/ourairports-data/countries.csv"])
        .status();

    on_progress(OurAirportsSyncProgress {
        stage: "downloading".to_string(),
        percent: 25,
        message: "Fetching runways dataset...".to_string(),
    });

    let mut cmd2 = std::process::Command::new(curl_bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd2.creation_flags(0x08000000);
    }
    let _ = cmd2
        .args(["-L", "-s", "-o", runways_path.to_str().unwrap(), "https://davidmegginson.github.io/ourairports-data/runways.csv"])
        .status();

    on_progress(OurAirportsSyncProgress {
        stage: "downloading".to_string(),
        percent: 50,
        message: "Fetching global airports dataset (13MB)...".to_string(),
    });

    let mut cmd3 = std::process::Command::new(curl_bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd3.creation_flags(0x08000000);
    }
    let status = cmd3
        .args(["-L", "-s", "-o", airports_path.to_str().unwrap(), "https://davidmegginson.github.io/ourairports-data/airports.csv"])
        .status();

    let download_success = match status {
        Ok(s) => s.success() && airports_path.exists() && airports_path.metadata().map(|m| m.len() > 1000).unwrap_or(false),
        Err(_) => false,
    };

    if !download_success {
        log::warn!("OurAirports download failed or offline. Searching for local cached datasets...");

        // Clean up partial or empty temporary download files
        if airports_path.exists() && airports_path.metadata().map(|m| m.len() < 1000).unwrap_or(false) {
            let _ = std::fs::remove_file(&airports_path);
        }
        if countries_path.exists() && countries_path.metadata().map(|m| m.len() < 100).unwrap_or(false) {
            let _ = std::fs::remove_file(&countries_path);
        }
        if runways_path.exists() && runways_path.metadata().map(|m| m.len() < 100).unwrap_or(false) {
            let _ = std::fs::remove_file(&runways_path);
        }

        // Check candidate local directories for pre-existing or bundled datasets
        let candidate_dirs = [
            work_dir.to_path_buf(),
            std::path::PathBuf::from("data"),
            std::path::PathBuf::from("../data"),
            std::path::PathBuf::from("src-tauri/data"),
            std::path::PathBuf::from("src-tauri"),
            std::path::PathBuf::from("."),
        ];

        let mut local_apt = None;
        let mut local_ctry = None;
        let mut local_rwy = None;

        for dir in &candidate_dirs {
            let apt = dir.join("airports.csv");
            if apt.exists() && apt.metadata().map(|m| m.len() > 1000).unwrap_or(false) {
                let ctry = dir.join("countries.csv");
                let rwy = dir.join("runways.csv");
                local_apt = Some(apt);
                if ctry.exists() && ctry.metadata().map(|m| m.len() > 100).unwrap_or(false) {
                    local_ctry = Some(ctry);
                }
                if rwy.exists() && rwy.metadata().map(|m| m.len() > 100).unwrap_or(false) {
                    local_rwy = Some(rwy);
                }
                break;
            }
        }

        if let Some(apt_file) = local_apt {
            on_progress(OurAirportsSyncProgress {
                stage: "importing".to_string(),
                percent: 65,
                message: "Indexing local aerodromes dataset into SQLite...".to_string(),
            });

            let ctry_file = local_ctry.unwrap_or_else(|| apt_file.clone());
            let apt_count = import_ourairports_files_with_progress(conn, &apt_file, &ctry_file, |imported| {
                let pct = 65 + ((imported as f32 / 80000.0) * 15.0).min(15.0) as u32;
                on_progress(OurAirportsSyncProgress {
                    stage: "importing".to_string(),
                    percent: pct,
                    message: format!("Indexed {} aerodromes from local dataset...", imported),
                });
            }).map_err(|e| format!("Failed to parse local OurAirports airports file: {}", e))?;

            let rwy_count = if let Some(rwy_file) = local_rwy {
                import_runways_file_with_progress(conn, &rwy_file, |imported| {
                    let pct = 82 + ((imported as f32 / 45000.0) * 10.0).min(10.0) as u32;
                    on_progress(OurAirportsSyncProgress {
                        stage: "importing".to_string(),
                        percent: pct,
                        message: format!("Indexed {} runways from local dataset...", imported),
                    });
                }).unwrap_or(0)
            } else {
                0
            };

            on_progress(OurAirportsSyncProgress {
                stage: "complete".to_string(),
                percent: 100,
                message: format!("Local dataset imported: {} aerodromes and {} runways indexed.", apt_count, rwy_count),
            });

            return Ok(OurAirportsSyncResult {
                success: true,
                total_airports: apt_count,
                message: format!("Imported {} airports and {} runways from local files.", apt_count, rwy_count),
            });
        }

        // Offline fallback: No local CSV dataset present, seed bundled core international aerodromes and runways
        let _ = seed_fallback_airports(conn);
        let apt_count = get_airports_count(conn).unwrap_or(75) as usize;

        on_progress(OurAirportsSyncProgress {
            stage: "complete".to_string(),
            percent: 100,
            message: format!("Offline core database active ({} aerodromes ready). Full global sync will be available when connected.", apt_count),
        });

        return Ok(OurAirportsSyncResult {
            success: true,
            total_airports: apt_count,
            message: format!("Offline core database ready ({} international aerodromes). Full 75,000+ dataset can be synced when online.", apt_count),
        });
    }

    on_progress(OurAirportsSyncProgress {
        stage: "importing".to_string(),
        percent: 65,
        message: "Parsing & indexing aerodromes into SQLite in batches...".to_string(),
    });

    let apt_count = import_ourairports_files_with_progress(conn, &airports_path, &countries_path, |imported| {
        let pct = 65 + ((imported as f32 / 80000.0) * 15.0).min(15.0) as u32;
        on_progress(OurAirportsSyncProgress {
            stage: "importing".to_string(),
            percent: pct,
            message: format!("Indexed {} aerodromes...", imported),
        });
    }).map_err(|e| format!("Failed to parse OurAirports airports file: {}", e))?;

    on_progress(OurAirportsSyncProgress {
        stage: "importing".to_string(),
        percent: 82,
        message: "Parsing & indexing runway dimensions and surface data in batches...".to_string(),
    });

    let rwy_count = if runways_path.exists() {
        import_runways_file_with_progress(conn, &runways_path, |imported| {
            let pct = 82 + ((imported as f32 / 45000.0) * 10.0).min(10.0) as u32;
            on_progress(OurAirportsSyncProgress {
                stage: "importing".to_string(),
                percent: pct,
                message: format!("Indexed {} runways...", imported),
            });
        }).map_err(|e| format!("Failed to parse OurAirports runways file: {}", e))?
    } else {
        0
    };

    // Clean up temporary downloaded CSV files now that SQLite indexing is complete
    let _ = std::fs::remove_file(&airports_path);
    let _ = std::fs::remove_file(&countries_path);
    let _ = std::fs::remove_file(&runways_path);

    on_progress(OurAirportsSyncProgress {
        stage: "complete".to_string(),
        percent: 100,
        message: format!("Successfully synced and indexed {} airports and {} runways from OurAirports.", apt_count, rwy_count),
    });

    Ok(OurAirportsSyncResult {
        success: true,
        total_airports: apt_count,
        message: format!("Successfully synced and indexed {} airports and {} runways from OurAirports.", apt_count, rwy_count),
    })
}

pub fn get_airports_count(conn: &Connection) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM airports 
         WHERE airport_type IN ('large_airport', 'medium_airport', 'small_airport')
           AND airport_type NOT IN ('heliport', 'helipad')
           AND airport_type NOT LIKE '%heli%'
           AND airport_type NOT LIKE '%pad%'
           AND LOWER(name) NOT LIKE '%heliport%'
           AND LOWER(name) NOT LIKE '%helipad%'
           AND LOWER(name) NOT LIKE '%helistop%'",
        [],
        |row| row.get(0),
    )
}

fn seed_fallback_airports(conn: &Connection) -> Result<()> {
    let seed_data: &[(&str, &str, f64, f64, i32, &str, &str, &str, &str, &str)] = &[
        // Europe - Hubs & International
        ("LOWI", "Innsbruck Kranebitten Airport", 47.2602, 11.3440, 1906, "AT", "Austria", "Innsbruck", "medium_airport", "EU"),
        ("LOWS", "Salzburg Airport W. A. Mozart", 47.7944, 13.0044, 1411, "AT", "Austria", "Salzburg", "medium_airport", "EU"),
        ("LOWW", "Vienna International Airport", 48.1103, 16.5697, 600, "AT", "Austria", "Vienna", "large_airport", "EU"),
        ("EDDM", "Munich Franz Josef Strauss Airport", 48.3538, 11.7861, 1487, "DE", "Germany", "Munich", "large_airport", "EU"),
        ("EDDF", "Frankfurt am Main Airport", 50.0379, 8.5622, 364, "DE", "Germany", "Frankfurt", "large_airport", "EU"),
        ("EDDB", "Berlin Brandenburg Airport", 52.3667, 13.5033, 157, "DE", "Germany", "Berlin", "large_airport", "EU"),
        ("EDDS", "Stuttgart Airport", 48.6899, 9.2219, 1276, "DE", "Germany", "Stuttgart", "medium_airport", "EU"),
        ("EDDN", "Nuremberg Airport", 49.4987, 11.0780, 1046, "DE", "Germany", "Nuremberg", "medium_airport", "EU"),
        ("EDMA", "Augsburg Airport", 48.4253, 10.9317, 1515, "DE", "Germany", "Augsburg", "small_airport", "EU"),
        ("LOIK", "Kufstein-Langkampfen Airfield", 47.5333, 12.1167, 1600, "AT", "Austria", "Kufstein", "small_airport", "EU"),
        ("EGLL", "London Heathrow Airport", 51.4700, -0.4543, 83, "GB", "United Kingdom", "London", "large_airport", "EU"),
        ("EGKK", "London Gatwick Airport", 51.1481, -0.1903, 202, "GB", "United Kingdom", "London", "large_airport", "EU"),
        ("EGPH", "Edinburgh Airport", 55.9500, -3.3725, 135, "GB", "United Kingdom", "Edinburgh", "medium_airport", "EU"),
        ("EGTR", "Elstree Aerodrome", 51.6558, -0.3256, 332, "GB", "United Kingdom", "London/Elstree", "small_airport", "EU"),
        ("LFPG", "Paris Charles de Gaulle Airport", 49.0097, 2.5479, 392, "FR", "France", "Paris", "large_airport", "EU"),
        ("LFMN", "Nice Côte d'Azur Airport", 43.6653, 7.2150, 12, "FR", "France", "Nice", "large_airport", "EU"),
        ("LFRS", "Nantes Atlantique Airport", 47.1532, -1.6107, 90, "FR", "France", "Nantes", "medium_airport", "EU"),
        ("LFLJ", "Courchevel Altiport", 45.3967, 6.6347, 6588, "FR", "France", "Courchevel", "small_airport", "EU"),
        ("EHAM", "Amsterdam Airport Schiphol", 52.3086, 4.7639, -11, "NL", "Netherlands", "Amsterdam", "large_airport", "EU"),
        ("LSZH", "Zurich Airport", 47.4647, 8.5492, 1416, "CH", "Switzerland", "Zurich", "large_airport", "EU"),
        ("LSGG", "Geneva Airport", 46.2381, 6.1089, 1411, "CH", "Switzerland", "Geneva", "large_airport", "EU"),
        ("LEMD", "Adolfo Suárez Madrid–Barajas Airport", 40.4719, -3.5626, 2001, "ES", "Spain", "Madrid", "large_airport", "EU"),
        ("LEBL", "Josep Tarradellas Barcelona-El Prat", 41.2974, 2.0785, 14, "ES", "Spain", "Barcelona", "large_airport", "EU"),
        ("LIRF", "Rome Leonardo da Vinci–Fiumicino", 41.8003, 12.2389, 15, "IT", "Italy", "Rome", "large_airport", "EU"),
        ("LIMC", "Milan Malpensa Airport", 45.6306, 8.7281, 768, "IT", "Italy", "Milan", "large_airport", "EU"),
        ("EBBR", "Brussels Airport", 50.9014, 4.4844, 184, "BE", "Belgium", "Brussels", "large_airport", "EU"),
        ("EKCH", "Copenhagen Kastrup Airport", 55.6180, 12.6508, 17, "DK", "Denmark", "Copenhagen", "large_airport", "EU"),
        ("ENGM", "Oslo Airport Gardermoen", 60.1976, 11.1004, 681, "NO", "Norway", "Oslo", "large_airport", "EU"),
        ("ESSA", "Stockholm Arlanda Airport", 59.6519, 17.9186, 137, "SE", "Sweden", "Stockholm", "large_airport", "EU"),
        ("EFHK", "Helsinki-Vantaa Airport", 60.3172, 24.9633, 179, "FI", "Finland", "Helsinki", "large_airport", "EU"),
        ("LPPT", "Humberto Delgado Airport (Lisbon)", 38.7756, -9.1354, 374, "PT", "Portugal", "Lisbon", "large_airport", "EU"),
        ("LGAV", "Athens Eleftherios Venizelos", 37.9364, 23.9445, 308, "GR", "Greece", "Athens", "large_airport", "EU"),
        ("EPWA", "Warsaw Chopin Airport", 52.1657, 20.9671, 362, "PL", "Poland", "Warsaw", "large_airport", "EU"),
        ("LKPR", "Václav Havel Airport Prague", 50.1008, 14.2600, 1247, "CZ", "Czech Republic", "Prague", "large_airport", "EU"),
        ("LHBP", "Budapest Ferenc Liszt", 47.4369, 19.2556, 495, "HU", "Hungary", "Budapest", "large_airport", "EU"),
        ("LTFM", "Istanbul Airport", 41.2753, 28.7519, 325, "TR", "Turkey", "Istanbul", "large_airport", "EU"),
        ("EIDW", "Dublin Airport", 53.4213, -6.2701, 242, "IE", "Ireland", "Dublin", "large_airport", "EU"),

        // North America
        ("KJFK", "John F. Kennedy International Airport", 40.6413, -73.7781, 13, "US", "United States", "New York", "large_airport", "NA"),
        ("KLGA", "LaGuardia Airport", 40.7769, -73.8740, 21, "US", "United States", "New York", "large_airport", "NA"),
        ("KEWR", "Newark Liberty International", 40.6895, -74.1745, 18, "US", "United States", "Newark", "large_airport", "NA"),
        ("KLAX", "Los Angeles International Airport", 33.9425, -118.4081, 128, "US", "United States", "Los Angeles", "large_airport", "NA"),
        ("KSFO", "San Francisco International Airport", 37.6213, -122.3790, 13, "US", "United States", "San Francisco", "large_airport", "NA"),
        ("KORD", "O'Hare International Airport", 41.9742, -87.9073, 672, "US", "United States", "Chicago", "large_airport", "NA"),
        ("KATL", "Hartsfield-Jackson Atlanta", 33.6407, -84.4277, 1026, "US", "United States", "Atlanta", "large_airport", "NA"),
        ("KDFW", "Dallas/Fort Worth International", 32.8998, -97.0403, 607, "US", "United States", "Dallas", "large_airport", "NA"),
        ("KMIA", "Miami International Airport", 25.7959, -80.2870, 8, "US", "United States", "Miami", "large_airport", "NA"),
        ("KBOS", "Boston Logan International", 42.3656, -71.0096, 20, "US", "United States", "Boston", "large_airport", "NA"),
        ("KSEA", "Seattle-Tacoma International", 47.4502, -122.3088, 433, "US", "United States", "Seattle", "large_airport", "NA"),
        ("KDEN", "Denver International Airport", 39.8561, -104.6737, 5431, "US", "United States", "Denver", "large_airport", "NA"),
        ("KLAS", "Harry Reid International Airport", 36.0840, -115.1537, 2181, "US", "United States", "Las Vegas", "large_airport", "NA"),
        ("PHNL", "Daniel K. Inouye International (Honolulu)", 21.3187, -157.9224, 13, "US", "United States", "Honolulu", "large_airport", "NA"),
        ("PANC", "Ted Stevens Anchorage International", 61.1743, -149.9962, 151, "US", "United States", "Anchorage", "large_airport", "NA"),
        ("KSNA", "John Wayne Airport", 33.6757, -117.8682, 56, "US", "United States", "Santa Ana", "medium_airport", "NA"),
        ("KBUR", "Hollywood Burbank Airport", 34.2007, -118.3587, 778, "US", "United States", "Burbank", "medium_airport", "NA"),
        ("KSQL", "San Carlos Airport", 37.5119, -122.2494, 5, "US", "United States", "San Carlos", "small_airport", "NA"),
        ("KSMO", "Santa Monica Municipal Airport", 34.0158, -118.4513, 177, "US", "United States", "Santa Monica", "small_airport", "NA"),
        ("KTRK", "Truckee Tahoe Airport", 39.3200, -120.1396, 5901, "US", "United States", "Truckee", "small_airport", "NA"),
        ("CYYZ", "Toronto Pearson International", 43.6777, -79.6248, 569, "CA", "Canada", "Toronto", "large_airport", "NA"),
        ("CYVR", "Vancouver International Airport", 49.1967, -123.1815, 14, "CA", "Canada", "Vancouver", "large_airport", "NA"),
        ("CYUL", "Montréal-Trudeau International", 45.4706, -73.7408, 118, "CA", "Canada", "Montreal", "large_airport", "NA"),
        ("MMMX", "Mexico City International", 19.4363, -99.0721, 7316, "MX", "Mexico", "Mexico City", "large_airport", "NA"),
        ("MMUN", "Cancún International Airport", 21.0365, -86.8771, 20, "MX", "Mexico", "Cancun", "large_airport", "NA"),

        // Asia & Middle East
        ("OMDB", "Dubai International Airport", 25.2532, 55.3657, 62, "AE", "United Arab Emirates", "Dubai", "large_airport", "AS"),
        ("OMAA", "Zayed International Airport (Abu Dhabi)", 24.4330, 54.6511, 88, "AE", "United Arab Emirates", "Abu Dhabi", "large_airport", "AS"),
        ("OTHH", "Hamad International Airport", 25.2731, 51.6081, 13, "QA", "Qatar", "Doha", "large_airport", "AS"),
        ("OERK", "King Khalid International Airport", 24.9576, 46.6988, 2049, "SA", "Saudi Arabia", "Riyadh", "large_airport", "AS"),
        ("RJTT", "Tokyo Haneda Airport", 35.5494, 139.7798, 21, "JP", "Japan", "Tokyo", "large_airport", "AS"),
        ("RJAA", "Narita International Airport", 35.7647, 140.3863, 141, "JP", "Japan", "Tokyo", "large_airport", "AS"),
        ("RKSI", "Incheon International Airport", 37.4602, 126.4407, 23, "KR", "South Korea", "Seoul", "large_airport", "AS"),
        ("VHHH", "Hong Kong International Airport", 22.3080, 113.9185, 28, "HK", "Hong Kong", "Hong Kong", "large_airport", "AS"),
        ("WSSS", "Singapore Changi Airport", 1.3644, 103.9915, 22, "SG", "Singapore", "Singapore", "large_airport", "AS"),
        ("VTBS", "Suvarnabhumi Airport (Bangkok)", 13.6900, 100.7501, 5, "TH", "Thailand", "Bangkok", "large_airport", "AS"),
        ("WMKK", "Kuala Lumpur International Airport", 2.7456, 101.7072, 69, "MY", "Malaysia", "Kuala Lumpur", "large_airport", "AS"),
        ("WIII", "Soekarno-Hatta International", -6.1256, 106.6559, 34, "ID", "Indonesia", "Jakarta", "large_airport", "AS"),
        ("VIDP", "Indira Gandhi International (Delhi)", 28.5562, 77.1000, 777, "IN", "India", "Delhi", "large_airport", "AS"),
        ("VABB", "Chhatrapati Shivaji Maharaj (Mumbai)", 19.0896, 72.8656, 39, "IN", "India", "Mumbai", "large_airport", "AS"),
        ("ZBAA", "Beijing Capital International", 40.0799, 116.6031, 116, "CN", "China", "Beijing", "large_airport", "AS"),
        ("ZSPD", "Shanghai Pudong International", 31.1443, 121.8083, 13, "CN", "China", "Shanghai", "large_airport", "AS"),
        ("RCTP", "Taiwan Taoyuan International", 25.0797, 121.2342, 106, "TW", "Taiwan", "Taipei", "large_airport", "AS"),

        // Oceania
        ("YSSY", "Sydney Kingsford Smith Airport", -33.9399, 151.1753, 21, "AU", "Australia", "Sydney", "large_airport", "OC"),
        ("YMML", "Melbourne Airport", -37.6690, 144.8410, 434, "AU", "Australia", "Melbourne", "large_airport", "OC"),
        ("YBBN", "Brisbane Airport", -27.3842, 153.1175, 13, "AU", "Australia", "Brisbane", "large_airport", "OC"),
        ("NZAA", "Auckland Airport", -37.0082, 174.7850, 23, "NZ", "New Zealand", "Auckland", "large_airport", "OC"),
        ("NZWN", "Wellington International Airport", -41.3272, 174.8053, 41, "NZ", "New Zealand", "Wellington", "large_airport", "OC"),

        // South America
        ("SBGR", "São Paulo/Guarulhos International", -23.4356, -46.4731, 2461, "BR", "Brazil", "Sao Paulo", "large_airport", "SA"),
        ("SBGL", "Rio de Janeiro/Galeão International", -22.8089, -43.2436, 28, "BR", "Brazil", "Rio de Janeiro", "large_airport", "SA"),
        ("SAEZ", "Ezeiza International (Buenos Aires)", -34.8222, -58.5358, 67, "AR", "Argentina", "Buenos Aires", "large_airport", "SA"),
        ("SCEL", "Arturo Merino Benítez (Santiago)", -33.3930, -70.7858, 1555, "CL", "Chile", "Santiago", "large_airport", "SA"),
        ("SKBO", "El Dorado International (Bogotá)", 4.7016, -74.1469, 8361, "CO", "Colombia", "Bogota", "large_airport", "SA"),
        ("SPJC", "Jorge Chávez International (Lima)", -12.0219, -77.1143, 113, "PE", "Peru", "Lima", "large_airport", "SA"),

        // Africa
        ("FACT", "Cape Town International Airport", -33.9715, 18.6021, 151, "ZA", "South Africa", "Cape Town", "large_airport", "AF"),
        ("FAOR", "O.R. Tambo International (Johannesburg)", -26.1367, 28.2411, 5558, "ZA", "South Africa", "Johannesburg", "large_airport", "AF"),
        ("HECA", "Cairo International Airport", 30.1219, 31.4056, 382, "EG", "Egypt", "Cairo", "large_airport", "AF"),
        ("GMMN", "Mohammed V International (Casablanca)", 33.3675, -7.5899, 656, "MA", "Morocco", "Casablanca", "large_airport", "AF"),
        ("HKJK", "Jomo Kenyatta International (Nairobi)", -1.3192, 36.9275, 5327, "KE", "Kenya", "Nairobi", "large_airport", "AF"),
    ];

    let mut stmt = conn.prepare(
        "INSERT INTO airports (icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(icao) DO UPDATE SET
            name=excluded.name,
            latitude=excluded.latitude,
            longitude=excluded.longitude,
            elevation_ft=excluded.elevation_ft,
            country_code=excluded.country_code,
            country_name=excluded.country_name,
            municipality=excluded.municipality,
            airport_type=excluded.airport_type,
            continent=excluded.continent"
    )?;

    for a in seed_data {
        stmt.execute(params![a.0, a.1, a.2, a.3, a.4, a.5, a.6, a.7, a.8, a.9])?;
    }

    // Seed default runway data for fallback hubs if runways table is empty
    let rwy_count: i64 = conn.query_row("SELECT COUNT(*) FROM runways", [], |row| row.get(0)).unwrap_or(0);
    if rwy_count == 0 {
        let _ = conn.execute_batch(
            r#"
            UPDATE airports SET
                max_runway_length_ft = CASE
                    WHEN icao = 'LOWI' THEN 6562
                    WHEN icao = 'LOWS' THEN 9022
                    WHEN icao = 'EDMA' THEN 4921
                    WHEN icao = 'LOIK' THEN 2198
                    WHEN icao = 'LOIH' THEN 2067
                    WHEN icao = 'EGTR' THEN 2400
                    WHEN icao = 'LFLJ' THEN 1762
                    WHEN icao = 'KSQL' THEN 2600
                    WHEN icao = 'KSMO' THEN 3500
                    WHEN icao = 'KTRK' THEN 7000
                    WHEN airport_type = 'large_airport' THEN 12000
                    WHEN airport_type = 'medium_airport' THEN 7500
                    ELSE 2500
                END,
                max_paved_runway_length_ft = CASE
                    WHEN icao = 'LOIK' THEN NULL
                    WHEN icao = 'LOWI' THEN 6562
                    WHEN icao = 'LOWS' THEN 9022
                    WHEN icao = 'EDMA' THEN 4921
                    WHEN icao = 'LOIH' THEN 2067
                    WHEN icao = 'EGTR' THEN 2400
                    WHEN icao = 'LFLJ' THEN 1762
                    WHEN icao = 'KSQL' THEN 2600
                    WHEN icao = 'KSMO' THEN 3500
                    WHEN icao = 'KTRK' THEN 7000
                    WHEN airport_type = 'large_airport' THEN 12000
                    WHEN airport_type = 'medium_airport' THEN 7500
                    ELSE NULL
                END,
                max_unpaved_runway_length_ft = CASE
                    WHEN icao IN ('LOIK', 'LOIH', 'EDMA', 'EGTR') THEN 2100
                    WHEN airport_type = 'small_airport' THEN 2200
                    ELSE NULL
                END,
                has_paved = CASE WHEN icao = 'LOIK' THEN 0 ELSE 1 END,
                has_unpaved = CASE WHEN icao IN ('LOIK', 'LOIH', 'EDMA', 'EGTR') OR airport_type = 'small_airport' THEN 1 ELSE 0 END,
                all_runways_closed = 0
            WHERE max_runway_length_ft IS NULL;
            "#
        );
    }

    Ok(())
}

pub fn search_airports_near(
    conn: &Connection,
    lat: f64,
    lon: f64,
    radius_nm: f64,
) -> Result<Option<Airport>> {
    // 1 deg latitude ~ 60 NM
    let lat_delta = radius_nm / 60.0;
    let lon_delta = radius_nm / (60.0 * lat.to_radians().cos().abs().max(0.1));

    let mut stmt = conn.prepare(
        "SELECT icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent,
                max_runway_length_ft, has_paved, has_unpaved
         FROM airports
         WHERE latitude BETWEEN ?1 AND ?2
           AND longitude BETWEEN ?3 AND ?4
           AND LENGTH(icao) = 4
           AND icao GLOB '[A-Za-z][A-Za-z][A-Za-z][A-Za-z]'
           AND airport_type IN ('large_airport', 'medium_airport', 'small_airport')
           AND airport_type NOT IN ('heliport', 'helipad')
           AND airport_type NOT LIKE '%heli%'
           AND airport_type NOT LIKE '%pad%'
           AND LOWER(name) NOT LIKE '%heliport%'
           AND LOWER(name) NOT LIKE '%helipad%'
           AND LOWER(name) NOT LIKE '%helistop%'",
    )?;

    let rows = stmt.query_map(
        params![
            lat - lat_delta,
            lat + lat_delta,
            lon - lon_delta,
            lon + lon_delta
        ],
        |row| {
            Ok(Airport {
                icao: row.get(0)?,
                name: row.get(1)?,
                latitude: row.get(2)?,
                longitude: row.get(3)?,
                elevation_ft: row.get(4)?,
                country_code: row.get(5)?,
                country_name: row.get(6)?,
                municipality: row.get(7)?,
                airport_type: row.get(8)?,
                continent: row.get(9)?,
                max_runway_length_ft: row.get(10)?,
                has_paved: row.get(11)?,
                has_unpaved: row.get(12)?,
            })
        },
    )?;

    let mut nearest: Option<(Airport, f64)> = None;

    for r in rows {
        let apt = r?;
        // Haversine distance in NM
        let d_lat = (apt.latitude - lat).to_radians();
        let d_lon = (apt.longitude - lon).to_radians();
        let a = (d_lat / 2.0).sin().powi(2)
            + lat.to_radians().cos() * apt.latitude.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
        let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
        let dist_nm = 3440.065 * c;

        if dist_nm <= radius_nm {
            match &nearest {
                Some((_, best_d)) if dist_nm < *best_d => nearest = Some((apt, dist_nm)),
                None => nearest = Some((apt, dist_nm)),
                _ => {}
            }
        }
    }

    Ok(nearest.map(|(apt, _)| apt))
}

pub fn get_airport_by_icao(conn: &Connection, icao: &str) -> Result<Option<Airport>> {
    let mut stmt = conn.prepare(
        "SELECT icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent,
                max_runway_length_ft, has_paved, has_unpaved
         FROM airports WHERE icao = ?1 COLLATE NOCASE
           AND airport_type IN ('large_airport', 'medium_airport', 'small_airport')
           AND airport_type NOT IN ('heliport', 'helipad')
           AND airport_type NOT LIKE '%heli%'
           AND airport_type NOT LIKE '%pad%'
           AND LOWER(name) NOT LIKE '%heliport%'
           AND LOWER(name) NOT LIKE '%helipad%'
           AND LOWER(name) NOT LIKE '%helistop%'
         LIMIT 1",
    )?;

    let mut rows = stmt.query(params![icao.trim()])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Airport {
            icao: row.get(0)?,
            name: row.get(1)?,
            latitude: row.get(2)?,
            longitude: row.get(3)?,
            elevation_ft: row.get(4)?,
            country_code: row.get(5)?,
            country_name: row.get(6)?,
            municipality: row.get(7)?,
            airport_type: row.get(8)?,
            continent: row.get(9)?,
            max_runway_length_ft: row.get(10)?,
            has_paved: row.get(11)?,
            has_unpaved: row.get(12)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_airport_runways(conn: &Connection, icao: &str) -> Result<Vec<Runway>> {
    let mut stmt = conn.prepare(
        "SELECT id, airport_ident, length_ft, width_ft, surface, is_paved, is_unpaved, lighted, closed
         FROM runways WHERE airport_ident = ?1 COLLATE NOCASE ORDER BY length_ft DESC"
    )?;
    let rows = stmt.query_map([icao.trim()], |row| {
        Ok(Runway {
            id: row.get(0)?,
            airport_ident: row.get(1)?,
            length_ft: row.get(2)?,
            width_ft: row.get(3)?,
            surface: row.get(4)?,
            is_paved: row.get(5)?,
            is_unpaved: row.get(6)?,
            lighted: row.get(7)?,
            closed: row.get(8)?,
        })
    })?;
    let mut runways = Vec::new();
    for r in rows {
        runways.push(r?);
    }
    Ok(runways)
}

pub fn get_all_airports(conn: &Connection) -> Result<Vec<Airport>> {
    let mut stmt = conn.prepare(
        "SELECT icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent,
                max_runway_length_ft, has_paved, has_unpaved
         FROM airports WHERE LENGTH(icao) = 4 AND icao GLOB '[A-Za-z][A-Za-z][A-Za-z][A-Za-z]'
           AND latitude IS NOT NULL AND longitude IS NOT NULL
           AND airport_type IN ('large_airport', 'medium_airport', 'small_airport')
           AND (all_runways_closed = 0 OR all_runways_closed IS NULL)
         GROUP BY icao
         ORDER BY CASE airport_type WHEN 'large_airport' THEN 1 WHEN 'medium_airport' THEN 2 ELSE 3 END, icao ASC
         LIMIT 2000"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Airport {
            icao: row.get(0)?,
            name: row.get(1)?,
            latitude: row.get(2)?,
            longitude: row.get(3)?,
            elevation_ft: row.get(4)?,
            country_code: row.get(5)?,
            country_name: row.get(6)?,
            municipality: row.get(7)?,
            airport_type: row.get(8)?,
            continent: row.get(9)?,
            max_runway_length_ft: row.get(10)?,
            has_paved: row.get(11)?,
            has_unpaved: row.get(12)?,
        })
    })?;
    let mut airports = Vec::new();
    for r in rows {
        airports.push(r?);
    }
    Ok(airports)
}

pub fn search_route_airports(conn: &Connection, filter: &RouteSearchFilter) -> Result<Vec<Airport>> {
    let mut sql = String::from(
        "SELECT icao, name, latitude, longitude, elevation_ft, country_code, country_name, municipality, airport_type, continent,
                max_runway_length_ft, has_paved, has_unpaved
         FROM airports WHERE LENGTH(icao) = 4 AND icao GLOB '[A-Za-z][A-Za-z][A-Za-z][A-Za-z]'
         AND airport_type IN ('large_airport', 'medium_airport', 'small_airport')
         AND airport_type NOT IN ('heliport', 'helipad')
         AND airport_type NOT LIKE '%heli%'
         AND airport_type NOT LIKE '%pad%'
         AND LOWER(name) NOT LIKE '%heliport%'
         AND LOWER(name) NOT LIKE '%helipad%'
         AND LOWER(name) NOT LIKE '%helistop%'
         AND (all_runways_closed = 0 OR all_runways_closed IS NULL)"
    );
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(cont) = &filter.continent {
        if !cont.is_empty() && cont != "ALL" && cont != "WORLDWIDE" {
            sql.push_str(" AND continent = ?");
            params_vec.push(rusqlite::types::Value::Text(cont.to_uppercase()));
        }
    }

    if let Some(cc) = &filter.country_code {
        if !cc.is_empty() && cc != "ALL" {
            sql.push_str(" AND country_code = ?");
            params_vec.push(rusqlite::types::Value::Text(cc.to_uppercase()));
        }
    }

    if let Some(atype) = &filter.airport_type {
        if !atype.is_empty() && atype != "all" {
            sql.push_str(" AND airport_type = ?");
            params_vec.push(rusqlite::types::Value::Text(atype.clone()));
        }
    }

    // Runway Surface Filter combined with Runway Length Filter
    let min_rwy = filter.min_runway_ft.unwrap_or(0);
    let surface = filter.surface.as_deref().unwrap_or("any").to_lowercase();

    match surface.as_str() {
        "paved" => {
            sql.push_str(" AND has_paved = 1");
            if min_rwy > 0 {
                sql.push_str(" AND (max_paved_runway_length_ft IS NULL OR max_paved_runway_length_ft >= ?)");
                params_vec.push(rusqlite::types::Value::Integer(min_rwy as i64));
            }
        }
        "unpaved" => {
            sql.push_str(" AND has_unpaved = 1");
            if min_rwy > 0 {
                sql.push_str(" AND (max_unpaved_runway_length_ft IS NULL OR max_unpaved_runway_length_ft >= ?)");
                params_vec.push(rusqlite::types::Value::Integer(min_rwy as i64));
            }
        }
        _ => {
            if min_rwy > 0 {
                sql.push_str(" AND (max_runway_length_ft IS NULL OR max_runway_length_ft >= ?)");
                params_vec.push(rusqlite::types::Value::Integer(min_rwy as i64));
            }
        }
    }

    if let Some(max_rwy) = filter.max_runway_ft {
        if max_rwy > 0 {
            sql.push_str(" AND (max_runway_length_ft IS NULL OR max_runway_length_ft <= ?)");
            params_vec.push(rusqlite::types::Value::Integer(max_rwy as i64));
        }
    }

    // If from_lat and from_lon are provided with max_dist_nm, filter by bounding box
    if let (Some(lat), Some(lon), Some(max_d)) = (filter.from_lat, filter.from_lon, filter.max_dist_nm) {
        let lat_delta = (max_d / 60.0) * 1.15;
        let lon_delta = (max_d / (60.0 * lat.to_radians().cos().abs().max(0.1))) * 1.15;
        sql.push_str(" AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?");
        params_vec.push(rusqlite::types::Value::Real(lat - lat_delta));
        params_vec.push(rusqlite::types::Value::Real(lat + lat_delta));
        params_vec.push(rusqlite::types::Value::Real(lon - lon_delta));
        params_vec.push(rusqlite::types::Value::Real(lon + lon_delta));
    }

    let max_results = filter.limit.unwrap_or(200).min(500);
    sql.push_str(&format!(" ORDER BY RANDOM() LIMIT {}", max_results));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
        Ok(Airport {
            icao: row.get(0)?,
            name: row.get(1)?,
            latitude: row.get(2)?,
            longitude: row.get(3)?,
            elevation_ft: row.get(4)?,
            country_code: row.get(5)?,
            country_name: row.get(6)?,
            municipality: row.get(7)?,
            airport_type: row.get(8)?,
            continent: row.get(9)?,
            max_runway_length_ft: row.get(10)?,
            has_paved: row.get(11)?,
            has_unpaved: row.get(12)?,
        })
    })?;

    let mut results = Vec::new();
    for r in rows {
        let apt = r?;
        if let (Some(lat), Some(lon)) = (filter.from_lat, filter.from_lon) {
            let d_lat = (apt.latitude - lat).to_radians();
            let d_lon = (apt.longitude - lon).to_radians();
            let a = (d_lat / 2.0).sin().powi(2)
                + lat.to_radians().cos() * apt.latitude.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
            let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
            let dist_nm = 3440.065 * c;

            if let Some(min_d) = filter.min_dist_nm {
                if dist_nm < min_d {
                    continue;
                }
            }
            if let Some(max_d) = filter.max_dist_nm {
                if dist_nm > max_d {
                    continue;
                }
            }
        }
        results.push(apt);
    }

    Ok(results)
}

