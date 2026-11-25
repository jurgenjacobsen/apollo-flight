use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_float, c_int, c_short, c_void};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use futures_util::StreamExt;
use libloading::Library;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechModelStatus {
    pub is_installed: bool,
    pub model_path: String,
    pub is_downloading: bool,
    pub download_progress: f32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechRecognitionChunkResult {
    pub text: String,
    pub is_final: bool,
}

#[derive(Deserialize)]
struct VoskResultJson {
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct VoskPartialJson {
    #[serde(default)]
    partial: String,
}

struct VoskApi {
    _lib: Library,
    vosk_model_new: unsafe extern "C" fn(*const c_char) -> *mut c_void,
    vosk_model_free: unsafe extern "C" fn(*mut c_void),
    vosk_recognizer_new: unsafe extern "C" fn(*mut c_void, c_float) -> *mut c_void,
    vosk_recognizer_new_grm: unsafe extern "C" fn(*mut c_void, c_float, *const c_char) -> *mut c_void,
    vosk_recognizer_free: unsafe extern "C" fn(*mut c_void),
    vosk_recognizer_accept_waveform_s: unsafe extern "C" fn(*mut c_void, *const c_short, c_int) -> c_int,
    vosk_recognizer_result: unsafe extern "C" fn(*mut c_void) -> *const c_char,
    vosk_recognizer_partial_result: unsafe extern "C" fn(*mut c_void) -> *const c_char,
    vosk_recognizer_final_result: unsafe extern "C" fn(*mut c_void) -> *const c_char,
}

impl VoskApi {
    unsafe fn load(dll_path: &Path) -> Result<Self, String> {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            if let Some(parent) = dll_path.parent() {
                let wide: Vec<u16> = parent.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
                extern "system" {
                    fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
                }
                SetDllDirectoryW(wide.as_ptr());
            }
        }

        let lib = Library::new(dll_path).map_err(|e| format!("Failed to load Vosk DLL at {:?}: {}", dll_path, e))?;
        let vosk_model_new = *lib.get(b"vosk_model_new\0").map_err(|e| e.to_string())?;
        let vosk_model_free = *lib.get(b"vosk_model_free\0").map_err(|e| e.to_string())?;
        let vosk_recognizer_new = *lib.get(b"vosk_recognizer_new\0").map_err(|e| e.to_string())?;
        let vosk_recognizer_new_grm = *lib.get(b"vosk_recognizer_new_grm\0").map_err(|e| e.to_string())?;
        let vosk_recognizer_free = *lib.get(b"vosk_recognizer_free\0").map_err(|e| e.to_string())?;
        let vosk_recognizer_accept_waveform_s = *lib.get(b"vosk_recognizer_accept_waveform_s\0").map_err(|e| e.to_string())?;
        let vosk_recognizer_result = *lib.get(b"vosk_recognizer_result\0").map_err(|e| e.to_string())?;
        let vosk_recognizer_partial_result = *lib.get(b"vosk_recognizer_partial_result\0").map_err(|e| e.to_string())?;
        let vosk_recognizer_final_result = *lib.get(b"vosk_recognizer_final_result\0").map_err(|e| e.to_string())?;
        
        if let Ok(set_log_level) = lib.get::<unsafe extern "C" fn(c_int)>(b"vosk_set_log_level\0") {
            set_log_level(-1); // Suppress verbose Kaldi logging
        }

        Ok(Self {
            _lib: lib,
            vosk_model_new,
            vosk_model_free,
            vosk_recognizer_new,
            vosk_recognizer_new_grm,
            vosk_recognizer_free,
            vosk_recognizer_accept_waveform_s,
            vosk_recognizer_result,
            vosk_recognizer_partial_result,
            vosk_recognizer_final_result,
        })
    }
}

unsafe impl Send for VoskApi {}
unsafe impl Sync for VoskApi {}

struct SpeechInner {
    api: Option<Arc<VoskApi>>,
    model_ptr: usize,
    recognizer_ptr: usize,
    current_model_path: Option<PathBuf>,
    is_downloading: bool,
    download_progress: f32,
    error: Option<String>,
}

impl Drop for SpeechInner {
    fn drop(&mut self) {
        if let Some(api) = self.api.as_ref() {
            unsafe {
                if self.recognizer_ptr != 0 {
                    (api.vosk_recognizer_free)(self.recognizer_ptr as *mut c_void);
                    self.recognizer_ptr = 0;
                }
                if self.model_ptr != 0 {
                    (api.vosk_model_free)(self.model_ptr as *mut c_void);
                    self.model_ptr = 0;
                }
            }
        }
    }
}

pub struct SpeechState {
    inner: Arc<Mutex<SpeechInner>>,
}

impl SpeechState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SpeechInner {
                api: None,
                model_ptr: 0,
                recognizer_ptr: 0,
                current_model_path: None,
                is_downloading: false,
                download_progress: 0.0,
                error: None,
            })),
        }
    }
}

fn find_model_and_dll(app: &AppHandle) -> (Option<PathBuf>, Option<PathBuf>) {
    let app_data_models = crate::get_app_data_dir(app).join("models");
    let local_models = PathBuf::from("models");
    let parent_models = PathBuf::from("..").join("models");
    let resource_models = app.path().resource_dir().map(|r| r.join("models")).unwrap_or_else(|_| PathBuf::from("models"));
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf()));

    // Check candidate model directories
    let mut model_candidates = vec![
        app_data_models.join("vosk-model-small-en-us-0.15"),
        local_models.join("vosk-model-small-en-us-0.15"),
        parent_models.join("vosk-model-small-en-us-0.15"),
        resource_models.join("vosk-model-small-en-us-0.15"),
        app_data_models.clone(),
        local_models.clone(),
        parent_models.clone(),
    ];

    if let Some(ref dir) = exe_dir {
        model_candidates.push(dir.join("models").join("vosk-model-small-en-us-0.15"));
        model_candidates.push(dir.join("..").join("models").join("vosk-model-small-en-us-0.15"));
        model_candidates.push(dir.join("..").join("..").join("models").join("vosk-model-small-en-us-0.15"));
        model_candidates.push(dir.join("..").join("..").join("..").join("models").join("vosk-model-small-en-us-0.15"));
    }

    let found_model = model_candidates.into_iter().find(|p| {
        p.is_dir() && (p.join("am").exists() || p.join("conf").exists() || p.join("model").exists())
    });

    // Check candidate DLL paths
    let mut dll_candidates = vec![
        app_data_models.join("libvosk.dll"),
        app_data_models.join("vosk.dll"),
        local_models.join("libvosk.dll"),
        local_models.join("vosk.dll"),
        parent_models.join("libvosk.dll"),
        parent_models.join("vosk.dll"),
        resource_models.join("libvosk.dll"),
        resource_models.join("vosk.dll"),
        PathBuf::from("libvosk.dll"),
        PathBuf::from("vosk.dll"),
    ];

    if let Some(ref dir) = exe_dir {
        dll_candidates.push(dir.join("libvosk.dll"));
        dll_candidates.push(dir.join("vosk.dll"));
        dll_candidates.push(dir.join("models").join("libvosk.dll"));
        dll_candidates.push(dir.join("..").join("models").join("libvosk.dll"));
        dll_candidates.push(dir.join("..").join("..").join("models").join("libvosk.dll"));
        dll_candidates.push(dir.join("..").join("..").join("..").join("models").join("libvosk.dll"));
    }

    let found_dll = dll_candidates.into_iter().find(|p| p.is_file());

    (found_model, found_dll)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vosk_load_and_run() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = manifest_dir.parent().unwrap();
        let models_dir = workspace_root.join("models");
        let model_path = models_dir.join("vosk-model-small-en-us-0.15");
        let dll_path = models_dir.join("libvosk.dll");

        println!("Testing model at: {:?}", model_path);
        println!("Testing DLL at: {:?}", dll_path);

        assert!(model_path.exists(), "Model path must exist");
        assert!(dll_path.exists(), "DLL path must exist");

        let api = unsafe { VoskApi::load(&dll_path).expect("Failed to load libvosk.dll") };
        println!("Loaded VoskApi successfully");

        let c_model_path = CString::new(model_path.to_string_lossy().as_bytes()).unwrap();
        let model_ptr = unsafe { (api.vosk_model_new)(c_model_path.as_ptr()) };
        assert!(!model_ptr.is_null(), "Model ptr should not be null");
        println!("Loaded Vosk Model successfully");

        let grammar_json = CString::new(r#"["checked", "set", "flaps", "[unk]"]"#).unwrap();
        let rec_ptr = unsafe { (api.vosk_recognizer_new_grm)(model_ptr, 16000.0, grammar_json.as_ptr()) };
        assert!(!rec_ptr.is_null(), "Recognizer ptr should not be null");
        println!("Created Recognizer with grammar successfully");

        // Feed 1 second of silence
        let silence = vec![0i16; 16000];
        let res = unsafe { (api.vosk_recognizer_accept_waveform_s)(rec_ptr, silence.as_ptr(), 16000) };
        println!("Feed silence result code: {}", res);

        let final_res = unsafe { (api.vosk_recognizer_final_result)(rec_ptr) };
        let final_str = unsafe { CStr::from_ptr(final_res) }.to_string_lossy();
        println!("Final recognition result: {}", final_str);

        unsafe {
            (api.vosk_recognizer_free)(rec_ptr);
            (api.vosk_model_free)(model_ptr);
        }
        println!("Cleaned up Vosk successfully");
    }
}

#[tauri::command]
pub fn get_speech_model_status(
    app: AppHandle,
    state: tauri::State<'_, SpeechState>,
) -> SpeechModelStatus {
    let inner = state.inner.lock().unwrap();
    if inner.is_downloading {
        return SpeechModelStatus {
            is_installed: false,
            model_path: inner.current_model_path.as_ref().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
            is_downloading: true,
            download_progress: inner.download_progress,
            error: None,
        };
    }

    let (model, dll) = find_model_and_dll(&app);
    let is_installed = model.is_some() && dll.is_some();
    let model_path = model.map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

    SpeechModelStatus {
        is_installed,
        model_path,
        is_downloading: false,
        download_progress: if is_installed { 1.0 } else { 0.0 },
        error: inner.error.clone(),
    }
}

fn extract_zip_bytes(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    let reader = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("Invalid zip archive: {}", e))?;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Zip entry error: {}", e))?;
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
pub async fn download_speech_model(
    app: AppHandle,
    state: tauri::State<'_, SpeechState>,
) -> Result<SpeechModelStatus, String> {
    {
        let mut inner = state.inner.lock().unwrap();
        if inner.is_downloading {
            return Err("Model download is already in progress".to_string());
        }
        inner.is_downloading = true;
        inner.download_progress = 0.0;
        inner.error = None;
    }

    let target_dir = crate::get_app_data_dir(&app).join("models");
    let _ = std::fs::create_dir_all(&target_dir);

    let client = reqwest::Client::builder()
        .user_agent("Apollo-Flight/0.0.5")
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Download Vosk Windows x64 DLL archive (weight 30% of progress)
    let dll_zip_url = "https://github.com/alphacep/vosk-api/releases/download/v0.3.45/vosk-win64-0.3.45.zip";
    let (has_model, has_dll) = find_model_and_dll(&app);

    if has_dll.is_none() {
        let _ = app.emit("speech-model-download-progress", 0.05f32);
        let resp = client.get(dll_zip_url).send().await.map_err(|e| format!("Failed to download Vosk binaries: {}", e))?;
        let total_size = resp.content_length().unwrap_or(15_000_000);
        let mut downloaded: u64 = 0;
        let mut stream = resp.bytes_stream();
        let mut dll_bytes = Vec::with_capacity(total_size as usize);

        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("Download stream error: {}", e))?;
            downloaded += chunk.len() as u64;
            dll_bytes.extend_from_slice(&chunk);
            let progress = (downloaded as f32 / total_size as f32) * 0.30;
            let _ = app.emit("speech-model-download-progress", progress);
        }

        extract_zip_bytes(&dll_bytes, &target_dir)?;

        // Find all DLLs in extracted folder and ensure they are in target_dir root
        let subfolder = target_dir.join("vosk-win64-0.3.45");
        if subfolder.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&subfolder) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "dll").unwrap_or(false) {
                        let _ = std::fs::copy(&path, target_dir.join(entry.file_name()));
                    }
                }
            }
        }
    }

    // 2. Download Vosk Small English Acoustic Model (weight 70% of progress)
    let model_zip_url = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip";
    if has_model.is_none() {
        let resp = client.get(model_zip_url).send().await.map_err(|e| format!("Failed to download speech model: {}", e))?;
        let total_size = resp.content_length().unwrap_or(40_000_000);
        let mut downloaded: u64 = 0;
        let mut stream = resp.bytes_stream();
        let mut model_bytes = Vec::with_capacity(total_size as usize);

        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("Download stream error: {}", e))?;
            downloaded += chunk.len() as u64;
            model_bytes.extend_from_slice(&chunk);
            let progress = 0.30 + ((downloaded as f32 / total_size as f32) * 0.70);
            let _ = app.emit("speech-model-download-progress", progress);
        }

        extract_zip_bytes(&model_bytes, &target_dir)?;
    }

    let _ = app.emit("speech-model-download-progress", 1.0f32);

    let (final_model, final_dll) = find_model_and_dll(&app);
    let is_installed = final_model.is_some() && final_dll.is_some();
    let model_path = final_model.map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

    {
        let mut inner = state.inner.lock().unwrap();
        inner.is_downloading = false;
        inner.download_progress = 1.0;
        inner.current_model_path = Some(PathBuf::from(&model_path));
    }

    Ok(SpeechModelStatus {
        is_installed,
        model_path,
        is_downloading: false,
        download_progress: 1.0,
        error: None,
    })
}

#[tauri::command]
pub fn start_speech_session(
    app: AppHandle,
    state: tauri::State<'_, SpeechState>,
    grammar: Vec<String>,
) -> Result<bool, String> {
    let mut inner = state.inner.lock().unwrap();

    let (model_path, dll_path) = find_model_and_dll(&app);
    let model_path = model_path.ok_or_else(|| "Vosk speech model is not installed. Download it first.".to_string())?;
    let dll_path = dll_path.ok_or_else(|| "Vosk runtime dynamic library (libvosk.dll) is missing.".to_string())?;

    // Load library if needed
    if inner.api.is_none() {
        let api = unsafe { VoskApi::load(&dll_path)? };
        inner.api = Some(Arc::new(api));
    }
    let api = inner.api.as_ref().unwrap().clone();

    // Load model if needed or path changed
    if inner.model_ptr == 0 || inner.current_model_path.as_ref() != Some(&model_path) {
        if inner.model_ptr != 0 {
            unsafe { (api.vosk_model_free)(inner.model_ptr as *mut c_void) };
            inner.model_ptr = 0;
        }

        let c_path = CString::new(model_path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        let m_ptr = unsafe { (api.vosk_model_new)(c_path.as_ptr()) };
        if m_ptr.is_null() {
            return Err("Failed to initialize Vosk model from directory.".to_string());
        }
        inner.model_ptr = m_ptr as usize;
        inner.current_model_path = Some(model_path);
    }

    // Free previous recognizer
    if inner.recognizer_ptr != 0 {
        unsafe { (api.vosk_recognizer_free)(inner.recognizer_ptr as *mut c_void) };
        inner.recognizer_ptr = 0;
    }

    // Create recognizer (with grammar if specified)
    let rec_ptr = if !grammar.is_empty() {
        let mut clean_grammar: Vec<String> = grammar
            .into_iter()
            .map(|g| g.trim().to_lowercase())
            .filter(|g| !g.is_empty())
            .collect();
        if !clean_grammar.iter().any(|g| g == "[unk]") {
            clean_grammar.push("[unk]".to_string());
        }
        let grm_json = serde_json::to_string(&clean_grammar).map_err(|e| e.to_string())?;
        let c_grm = CString::new(grm_json).map_err(|e| e.to_string())?;
        unsafe { (api.vosk_recognizer_new_grm)(inner.model_ptr as *mut c_void, 16000.0, c_grm.as_ptr()) }
    } else {
        unsafe { (api.vosk_recognizer_new)(inner.model_ptr as *mut c_void, 16000.0) }
    };

    if rec_ptr.is_null() {
        return Err("Failed to create Vosk speech recognizer instance.".to_string());
    }

    inner.recognizer_ptr = rec_ptr as usize;
    Ok(true)
}

#[tauri::command]
pub fn feed_speech_audio(
    state: tauri::State<'_, SpeechState>,
    samples: Vec<i16>,
) -> Result<Option<SpeechRecognitionChunkResult>, String> {
    let inner = state.inner.lock().unwrap();
    if inner.recognizer_ptr == 0 || inner.api.is_none() || samples.is_empty() {
        return Ok(None);
    }

    let api = inner.api.as_ref().unwrap();
    let rec_ptr = inner.recognizer_ptr as *mut c_void;

    let res = unsafe {
        (api.vosk_recognizer_accept_waveform_s)(rec_ptr, samples.as_ptr(), samples.len() as c_int)
    };

    if res == 1 {
        let c_str = unsafe { (api.vosk_recognizer_result)(rec_ptr) };
        if !c_str.is_null() {
            let json_str = unsafe { CStr::from_ptr(c_str) }.to_string_lossy();
            if let Ok(parsed) = serde_json::from_str::<VoskResultJson>(&json_str) {
                let cleaned = parsed.text.trim().to_string();
                if !cleaned.is_empty() && cleaned != "[unk]" {
                    return Ok(Some(SpeechRecognitionChunkResult {
                        text: cleaned,
                        is_final: true,
                    }));
                }
            }
        }
    } else if res == 0 {
        let c_str = unsafe { (api.vosk_recognizer_partial_result)(rec_ptr) };
        if !c_str.is_null() {
            let json_str = unsafe { CStr::from_ptr(c_str) }.to_string_lossy();
            if let Ok(parsed) = serde_json::from_str::<VoskPartialJson>(&json_str) {
                let cleaned = parsed.partial.trim().to_string();
                if !cleaned.is_empty() && cleaned != "[unk]" {
                    return Ok(Some(SpeechRecognitionChunkResult {
                        text: cleaned,
                        is_final: false,
                    }));
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn stop_speech_session(
    state: tauri::State<'_, SpeechState>,
) -> Result<Option<SpeechRecognitionChunkResult>, String> {
    let mut inner = state.inner.lock().unwrap();
    if inner.recognizer_ptr == 0 || inner.api.is_none() {
        return Ok(None);
    }

    let api = inner.api.as_ref().unwrap().clone();
    let rec_ptr = inner.recognizer_ptr as *mut c_void;

    let c_str = unsafe { (api.vosk_recognizer_final_result)(rec_ptr) };
    let mut final_text = String::new();
    if !c_str.is_null() {
        let json_str = unsafe { CStr::from_ptr(c_str) }.to_string_lossy();
        if let Ok(parsed) = serde_json::from_str::<VoskResultJson>(&json_str) {
            final_text = parsed.text.trim().to_string();
        }
    }

    unsafe {
        (api.vosk_recognizer_free)(rec_ptr);
    }
    inner.recognizer_ptr = 0;

    if !final_text.is_empty() {
        Ok(Some(SpeechRecognitionChunkResult {
            text: final_text,
            is_final: true,
        }))
    } else {
        Ok(None)
    }
}
