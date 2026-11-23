use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use futures_util::StreamExt;

const NAVIGRAPH_API_URL: &str = "https://api.navigraph.com/v1/navdata";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiracStatusInfo {
    pub is_installed: bool,
    pub current_cycle: Option<String>,
    pub status: Option<String>,
    pub file_size_mb: Option<f64>,
    pub updated_at: Option<String>,
    pub database_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiracPackageInfo {
    pub cycle: String,
    pub status: String,
    pub format: Option<String>,
    pub file_url: String,
    pub file_sha256: Option<String>,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiracProgressPayload {
    pub percent: f32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub stage: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiracMeta {
    pub cycle: String,
    pub status: String,
    pub updated_at: String,
    pub sha256: Option<String>,
}

#[derive(Deserialize)]
struct NavdataPackageFileRaw {
    url: String,
    #[serde(default)]
    sha256: Option<String>,
    #[serde(default)]
    size: Option<u64>,
}

#[derive(Deserialize)]
struct NavdataPackageRaw {
    cycle: String,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    format: Option<String>,
    file: NavdataPackageFileRaw,
}

fn get_navdata_dir(app: &AppHandle) -> PathBuf {
    let dir = crate::get_app_data_dir(app).join("navdata");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn get_airac_meta_path(app: &AppHandle) -> PathBuf {
    get_navdata_dir(app).join("airac_meta.json")
}

pub fn get_airac_db_path(app: &AppHandle) -> PathBuf {
    get_navdata_dir(app).join("navigraph_dfd.sqlite")
}

#[tauri::command]
pub async fn navigraph_get_airac_status(app: AppHandle) -> Result<AiracStatusInfo, String> {
    let db_path = get_airac_db_path(&app);
    let meta_path = get_airac_meta_path(&app);

    let is_installed = db_path.exists();
    let mut current_cycle = None;
    let mut status = None;
    let mut updated_at = None;
    let mut file_size_mb = None;

    if is_installed {
        if let Ok(metadata) = std::fs::metadata(&db_path) {
            file_size_mb = Some((metadata.len() as f64) / (1024.0 * 1024.0));
        }

        if meta_path.exists() {
            if let Ok(bytes) = std::fs::read(&meta_path) {
                if let Ok(meta) = serde_json::from_slice::<AiracMeta>(&bytes) {
                    current_cycle = Some(meta.cycle);
                    status = Some(meta.status);
                    updated_at = Some(meta.updated_at);
                }
            }
        }
    }

    Ok(AiracStatusInfo {
        is_installed,
        current_cycle,
        status,
        file_size_mb,
        updated_at,
        database_path: if is_installed {
            Some(db_path.to_string_lossy().to_string())
        } else {
            None
        },
    })
}

#[tauri::command]
pub async fn navigraph_check_airac_packages(app: AppHandle) -> Result<AiracPackageInfo, String> {
    let auth = crate::navigraph_auth::navigraph_get_auth_status(app.clone()).await?;
    if !auth.is_authenticated {
        return Err("Navigraph account is not authenticated. Please link your account first.".to_string());
    }

    let session = crate::navigraph_auth::load_session(&app);
    let token = session
        .access_token
        .ok_or_else(|| "No access token found".to_string())?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/packages", NAVIGRAPH_API_URL))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Navigraph packages request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("Navigraph API error ({}): {}", status, err_body));
    }

    let packages: Vec<NavdataPackageRaw> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse packages response: {}", e))?;

    if packages.is_empty() {
        return Err("No AIRAC packages found for your subscription tier.".to_string());
    }

    // Prefer dfd_v2 format, fallback to first available
    let pkg = packages
        .iter()
        .find(|p| p.format.as_deref() == Some("dfd_v2"))
        .or_else(|| packages.first())
        .ok_or_else(|| "No compatible AIRAC package found".to_string())?;

    Ok(AiracPackageInfo {
        cycle: pkg.cycle.clone(),
        status: pkg.status.clone().unwrap_or_else(|| "current".to_string()),
        format: pkg.format.clone(),
        file_url: pkg.file.url.clone(),
        file_sha256: pkg.file.sha256.clone(),
        file_size: pkg.file.size.unwrap_or(0),
    })
}

#[tauri::command]
pub async fn navigraph_download_airac(
    app: AppHandle,
    file_url: String,
    expected_sha256: Option<String>,
    cycle: String,
) -> Result<(), String> {
    let navdata_dir = get_navdata_dir(&app);
    let tmp_path = navdata_dir.join("navigraph_dfd.tmp");
    let final_db_path = get_airac_db_path(&app);
    let meta_path = get_airac_meta_path(&app);

    let client = reqwest::Client::new();
    let resp = client
        .get(&file_url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with status: {}", resp.status()));
    }

    let total_bytes = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();

    let mut tmp_file = std::fs::File::create(&tmp_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut downloaded_bytes: u64 = 0;
    let mut hasher = Sha256::new();
    let mut last_emit_percent: i32 = -1;

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Error while downloading stream: {}", e))?;
        tmp_file
            .write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        hasher.update(&chunk);

        downloaded_bytes += chunk.len() as u64;

        let percent = if total_bytes > 0 {
            (downloaded_bytes as f32 / total_bytes as f32) * 100.0
        } else {
            0.0
        };

        let current_percent_int = percent as i32;
        if current_percent_int != last_emit_percent {
            last_emit_percent = current_percent_int;
            let _ = app.emit(
                "airac:progress",
                AiracProgressPayload {
                    percent,
                    downloaded_bytes,
                    total_bytes,
                    stage: "downloading".to_string(),
                    message: format!(
                        "Downloading AIRAC Cycle {} ({:.1} MB / {:.1} MB)...",
                        cycle,
                        (downloaded_bytes as f64) / (1024.0 * 1024.0),
                        (total_bytes as f64) / (1024.0 * 1024.0),
                    ),
                },
            );
        }
    }

    tmp_file.flush().map_err(|e| e.to_string())?;
    drop(tmp_file);

    // Verify SHA-256
    let computed_hash = format!("{:x}", hasher.finalize());
    if let Some(ref expected) = expected_sha256 {
        if !expected.is_empty() && !computed_hash.eq_ignore_ascii_case(expected) {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(format!(
                "SHA-256 integrity verification mismatch (expected {}, got {})",
                expected, computed_hash
            ));
        }
    }

    let _ = app.emit(
        "airac:progress",
        AiracProgressPayload {
            percent: 95.0,
            downloaded_bytes,
            total_bytes,
            stage: "extracting".to_string(),
            message: "Unpacking SQLite navigation database...".to_string(),
        },
    );

    // Check if the downloaded file is a ZIP archive (magic bytes PK\x03\x04)
    let is_zip = {
        if let Ok(mut f) = std::fs::File::open(&tmp_path) {
            let mut magic = [0u8; 4];
            f.read_exact(&mut magic).is_ok() && &magic == b"PK\x03\x04"
        } else {
            false
        }
    };

    if is_zip {
        let zip_file = std::fs::File::open(&tmp_path)
            .map_err(|e| format!("Failed to read zip: {}", e))?;
        let mut archive = zip::ZipArchive::new(zip_file)
            .map_err(|e| format!("Failed to parse zip archive: {}", e))?;

        let mut extracted = false;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().map_err(|e| e.to_string())?.to_lowercase();
            if name.ends_with(".sqlite") || name.ends_with(".s3db") || name.ends_with(".db") {
                let mut out_file = std::fs::File::create(&final_db_path)
                    .map_err(|e| format!("Failed to create final db: {}", e))?;
                std::io::copy(&mut file, &mut out_file)
                    .map_err(|e| format!("Failed to unpack database: {}", e))?;
                extracted = true;
                break;
            }
        }
        let _ = std::fs::remove_file(&tmp_path);

        if !extracted {
            return Err("ZIP archive did not contain a valid SQLite database file.".to_string());
        }
    } else {
        if final_db_path.exists() {
            let _ = std::fs::remove_file(&final_db_path);
        }
        std::fs::rename(&tmp_path, &final_db_path)
            .map_err(|e| format!("Failed to install SQLite database: {}", e))?;
    }

    let meta = AiracMeta {
        cycle: cycle.clone(),
        status: "current".to_string(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        sha256: Some(computed_hash),
    };

    if let Ok(json) = serde_json::to_string_pretty(&meta) {
        let _ = std::fs::write(&meta_path, json);
    }

    let _ = app.emit(
        "airac:progress",
        AiracProgressPayload {
            percent: 100.0,
            downloaded_bytes,
            total_bytes,
            stage: "complete".to_string(),
            message: format!("AIRAC Cycle {} installed successfully!", cycle),
        },
    );

    Ok(())
}
