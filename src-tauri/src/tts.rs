use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

const PIPER_VERSION: &str = "2023.11.14-2";
const PIPER_VOICE_NAME: &str = "en_US-lessac-medium";
const PIPER_MODEL_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx";
const PIPER_CONFIG_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsModelStatus {
    pub is_installed: bool,
    pub voice_name: String,
    pub binary_path: String,
    pub model_path: String,
    pub is_downloading: bool,
    pub download_progress: f32,
    pub error: Option<String>,
}

pub struct TtsStateInner {
    pub is_downloading: bool,
    pub download_progress: f32,
    pub error: Option<String>,
}

pub struct TtsState {
    pub inner: Mutex<TtsStateInner>,
}

impl TtsState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(TtsStateInner {
                is_downloading: false,
                download_progress: 0.0,
                error: None,
            }),
        }
    }
}

fn piper_binary_filename() -> &'static str {
    if cfg!(target_os = "windows") {
        "piper.exe"
    } else {
        "piper"
    }
}

fn piper_archive_url() -> Result<(&'static str, bool), String> {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        Ok((
            "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip",
            true,
        ))
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        Ok((
            "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_aarch64.tar.gz",
            false,
        ))
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        Ok((
            "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_x64.tar.gz",
            false,
        ))
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        Ok((
            "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz",
            false,
        ))
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        Ok((
            "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_aarch64.tar.gz",
            false,
        ))
    }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
    )))]
    {
        Err("Unsupported OS/architecture for Piper neural TTS.".to_string())
    }
}

pub fn tts_dir(app: &AppHandle) -> PathBuf {
    crate::get_app_data_dir(app).join("tts")
}

pub fn tts_cache_dir(app: &AppHandle) -> PathBuf {
    crate::get_app_data_dir(app).join("tts_cache")
}

pub fn find_piper_and_model(app: &AppHandle) -> (Option<PathBuf>, Option<PathBuf>) {
    let base = tts_dir(app);
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let resource_tts = app
        .path()
        .resource_dir()
        .ok()
        .map(|d| d.join("tts"))
        .unwrap_or_else(|| PathBuf::from("tts"));

    let bin_name = piper_binary_filename();
    let mut bin_candidates = vec![
        base.join("piper").join(bin_name),
        base.join(bin_name),
        resource_tts.join("piper").join(bin_name),
        resource_tts.join(bin_name),
    ];
    if let Some(ref dir) = exe_dir {
        bin_candidates.push(dir.join("tts").join("piper").join(bin_name));
        bin_candidates.push(dir.join("tts").join(bin_name));
    }

    let model_name = format!("{}.onnx", PIPER_VOICE_NAME);
    let config_name = format!("{}.onnx.json", PIPER_VOICE_NAME);
    let model_candidates = vec![
        base.join(&model_name),
        base.join("voices").join(&model_name),
        resource_tts.join(&model_name),
        resource_tts.join("voices").join(&model_name),
    ];

    let found_bin = bin_candidates.into_iter().find(|p| p.is_file());
    let found_model = model_candidates.into_iter().find(|p| {
        p.is_file()
            && p.parent()
                .map(|dir| dir.join(&config_name).is_file())
                .unwrap_or(false)
    });

    (found_bin, found_model)
}

pub fn compute_tts_cache_key(voice: &str, text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(voice.as_bytes());
    hasher.update(b":");
    hasher.update(text.trim().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn extract_zip_to(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    let reader = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|e| format!("Invalid zip archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Zip entry error: {}", e))?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_tts_model_status(
    app: AppHandle,
    state: tauri::State<'_, TtsState>,
) -> TtsModelStatus {
    let inner = state.inner.lock().unwrap();
    if inner.is_downloading {
        return TtsModelStatus {
            is_installed: false,
            voice_name: PIPER_VOICE_NAME.to_string(),
            binary_path: String::new(),
            model_path: String::new(),
            is_downloading: true,
            download_progress: inner.download_progress,
            error: None,
        };
    }

    let (bin, model) = find_piper_and_model(&app);
    let is_installed = bin.is_some() && model.is_some();

    TtsModelStatus {
        is_installed,
        voice_name: PIPER_VOICE_NAME.to_string(),
        binary_path: bin
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        model_path: model
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        is_downloading: false,
        download_progress: if is_installed { 1.0 } else { 0.0 },
        error: inner.error.clone(),
    }
}

#[tauri::command]
pub async fn download_tts_model(
    app: AppHandle,
    state: tauri::State<'_, TtsState>,
) -> Result<TtsModelStatus, String> {
    {
        let mut inner = state.inner.lock().unwrap();
        if inner.is_downloading {
            return Err("Neural voice download is already in progress.".to_string());
        }
        inner.is_downloading = true;
        inner.download_progress = 0.0;
        inner.error = None;
    }

    let result = download_tts_model_inner(&app, &state).await;
    if let Err(ref err_msg) = result {
        let mut inner = state.inner.lock().unwrap();
        inner.is_downloading = false;
        inner.error = Some(err_msg.clone());
    }
    result
}

async fn download_tts_model_inner(
    app: &AppHandle,
    state: &tauri::State<'_, TtsState>,
) -> Result<TtsModelStatus, String> {
    let target_dir = tts_dir(app);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .user_agent(format!("Apollo-Flight/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;

    let (has_bin, has_model) = find_piper_and_model(app);

    // 1. Download Piper binary for current OS/arch (30% weight)
    if has_bin.is_none() {
        let (archive_url, is_zip) = piper_archive_url()?;
        let _ = app.emit("tts-model-download-progress", 0.05f32);

        let resp = client
            .get(archive_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download Piper TTS runtime: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!(
                "Piper TTS runtime download failed (HTTP {})",
                resp.status()
            ));
        }

        let total_size = resp.content_length().unwrap_or(20_000_000);
        let mut downloaded: u64 = 0;
        let mut stream = resp.bytes_stream();
        let mut bytes = Vec::with_capacity(total_size as usize);

        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("Download stream error: {}", e))?;
            downloaded += chunk.len() as u64;
            bytes.extend_from_slice(&chunk);
            let progress = (downloaded as f32 / total_size as f32).min(1.0) * 0.30;
            let _ = app.emit("tts-model-download-progress", progress);
        }

        if is_zip {
            extract_zip_to(&bytes, &target_dir)?;
        } else {
            let archive_path = target_dir.join(format!("piper-{}.tar.gz", PIPER_VERSION));
            std::fs::write(&archive_path, &bytes).map_err(|e| e.to_string())?;
            let status = Command::new("tar")
                .arg("-xzf")
                .arg(&archive_path)
                .arg("-C")
                .arg(&target_dir)
                .status()
                .map_err(|e| format!("Failed to extract Piper tar.gz: {}", e))?;
            let _ = std::fs::remove_file(&archive_path);
            if !status.success() {
                return Err("Failed to extract Piper TTS archive.".to_string());
            }
        }
    }

    // 2. Download ONNX voice model & config (70% weight)
    if has_model.is_none() {
        let model_path = target_dir.join(format!("{}.onnx", PIPER_VOICE_NAME));
        let config_path = target_dir.join(format!("{}.onnx.json", PIPER_VOICE_NAME));

        let resp = client
            .get(PIPER_MODEL_URL)
            .send()
            .await
            .map_err(|e| format!("Failed to download neural voice model: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!(
                "Neural voice model download failed (HTTP {})",
                resp.status()
            ));
        }

        let total_size = resp.content_length().unwrap_or(63_000_000);
        let mut downloaded: u64 = 0;
        let mut stream = resp.bytes_stream();
        let mut model_bytes = Vec::with_capacity(total_size as usize);

        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("Download stream error: {}", e))?;
            downloaded += chunk.len() as u64;
            model_bytes.extend_from_slice(&chunk);
            let progress = 0.30 + ((downloaded as f32 / total_size as f32).min(1.0) * 0.65);
            let _ = app.emit("tts-model-download-progress", progress);
        }
        std::fs::write(&model_path, &model_bytes).map_err(|e| e.to_string())?;

        let cfg_resp = client
            .get(PIPER_CONFIG_URL)
            .send()
            .await
            .map_err(|e| format!("Failed to download voice config: {}", e))?;
        if !cfg_resp.status().is_success() {
            return Err(format!(
                "Voice config download failed (HTTP {})",
                cfg_resp.status()
            ));
        }
        let cfg_bytes = cfg_resp.bytes().await.map_err(|e| e.to_string())?;
        std::fs::write(&config_path, &cfg_bytes).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("tts-model-download-progress", 1.0f32);

    let (final_bin, final_model) = find_piper_and_model(app);
    let is_installed = final_bin.is_some() && final_model.is_some();

    {
        let mut inner = state.inner.lock().unwrap();
        inner.is_downloading = false;
        inner.download_progress = if is_installed { 1.0 } else { 0.0 };
    }

    Ok(TtsModelStatus {
        is_installed,
        voice_name: PIPER_VOICE_NAME.to_string(),
        binary_path: final_bin
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        model_path: final_model
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        is_downloading: false,
        download_progress: if is_installed { 1.0 } else { 0.0 },
        error: None,
    })
}

#[tauri::command]
pub async fn synthesize_speech(app: AppHandle, text: String) -> Result<Vec<u8>, String> {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Err("Cannot synthesize empty text.".to_string());
    }

    let (bin_path, model_path) = find_piper_and_model(&app);
    let bin_path = bin_path.ok_or_else(|| "Piper TTS binary is not installed.".to_string())?;
    let model_path =
        model_path.ok_or_else(|| "Piper neural voice model is not installed.".to_string())?;

    let cache_dir = tts_cache_dir(&app);
    let _ = std::fs::create_dir_all(&cache_dir);
    let cache_key = compute_tts_cache_key(PIPER_VOICE_NAME, &trimmed);
    let cached_wav = cache_dir.join(format!("{}.wav", cache_key));

    if cached_wav.is_file() {
        if let Ok(bytes) = std::fs::read(&cached_wav) {
            if !bytes.is_empty() {
                return Ok(bytes);
            }
        }
    }

    let tmp_wav = cache_dir.join(format!("{}.tmp.wav", uuid::Uuid::new_v4()));

    let output_bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let mut cmd = Command::new(&bin_path);
        cmd.arg("--model")
            .arg(&model_path)
            .arg("--output_file")
            .arg(&tmp_wav)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start Piper TTS: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(trimmed.as_bytes());
            let _ = stdin.write_all(b"\n");
        }

        let out = child
            .wait_with_output()
            .map_err(|e| format!("Piper TTS execution failed: {}", e))?;

        if !out.status.success() {
            let _ = std::fs::remove_file(&tmp_wav);
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(format!("Piper TTS exited with error: {}", stderr.trim()));
        }

        let bytes = std::fs::read(&tmp_wav)
            .map_err(|e| format!("Failed to read synthesized WAV: {}", e))?;
        let _ = std::fs::rename(&tmp_wav, &cached_wav);
        Ok(bytes)
    })
    .await
    .map_err(|e| format!("TTS synthesis task failed: {}", e))??;

    Ok(output_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_tts_cache_key_is_deterministic_and_trimmed() {
        let a = compute_tts_cache_key("en_US-lessac-medium", "Parking Brake");
        let b = compute_tts_cache_key("en_US-lessac-medium", "  Parking Brake  ");
        let c = compute_tts_cache_key("en_US-lessac-medium", "Flaps");

        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 64);
    }

    #[test]
    fn test_piper_archive_url_resolves_for_current_platform() {
        let res = piper_archive_url();
        assert!(res.is_ok());
        let (url, _is_zip) = res.unwrap();
        assert!(url.starts_with("https://github.com/rhasspy/piper/releases/download/"));
    }
}
