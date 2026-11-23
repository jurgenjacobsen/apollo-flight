use tauri::{AppHandle, Manager};
use crate::{db, get_app_data_dir, DbState};

    #[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
    #[serde(rename_all = "camelCase")]
    pub struct DocFileRecord {
        pub path: String,
        pub name: String,
        pub extension: String,
        pub size_bytes: u64,
        pub modified: Option<String>,
        pub source: String,
        pub source_dir: Option<String>,
        pub title: Option<String>,
        pub last_seen: Option<String>,
        pub tags: Vec<String>,
    }

    #[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
    #[serde(rename_all = "camelCase")]
    pub struct DocFileContent {
        pub path: String,
        pub extension: String,
        pub text_content: Option<String>,
        pub base64_content: Option<String>,
    }

    fn to_base64(bytes: &[u8]) -> String {
        const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
        for chunk in bytes.chunks(3) {
            let b0 = chunk[0] as usize;
            let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
            let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
            out.push(CHARSET[(b0 >> 2) & 0x3F] as char);
            out.push(CHARSET[((b0 << 4) | (b1 >> 4)) & 0x3F] as char);
            if chunk.len() > 1 {
                out.push(CHARSET[((b1 << 2) | (b2 >> 6)) & 0x3F] as char);
            } else {
                out.push('=');
            }
            if chunk.len() > 2 {
                out.push(CHARSET[b2 & 0x3F] as char);
            } else {
                out.push('=');
            }
        }
        out
    }

    fn scan_dir_for_docs(
        dir: &std::path::Path,
        source: &str,
        meta_map: &std::collections::HashMap<String, db::DocumentMetadata>,
        results: &mut Vec<DocFileRecord>,
        depth: usize,
    ) {
        if depth > 4 || !dir.is_dir() {
            return;
        }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    scan_dir_for_docs(&p, source, meta_map, results, depth + 1);
                } else if p.is_file() {
                    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                    if ext == "md" || ext == "markdown" || ext == "pdf" {
                        let norm_ext = if ext == "markdown" { "md" } else { &ext };
                        let norm_path = p.to_string_lossy().to_string();
                        let file_name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
                        let (size, modified) = std::fs::metadata(&p).map(|m| {
                            let sz = m.len();
                            let mod_time = m.modified().ok().and_then(|t| {
                                let dt: chrono::DateTime<chrono::Utc> = t.into();
                                Some(dt.to_rfc3339())
                            });
                            (sz, mod_time)
                        }).unwrap_or((0, None));

                        let meta = meta_map.get(&norm_path);
                        let title = meta.and_then(|m| m.title.clone()).or_else(|| {
                            p.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string())
                        });
                        let last_seen = meta.and_then(|m| m.last_seen.clone());
                        let tags = meta.map(|m| m.tags.clone()).unwrap_or_default();

                        results.push(DocFileRecord {
                            path: norm_path,
                            name: file_name,
                            extension: norm_ext.to_string(),
                            size_bytes: size,
                            modified,
                            source: source.to_string(),
                            source_dir: Some(dir.to_string_lossy().to_string()),
                            title,
                            last_seen,
                            tags,
                        });
                    }
                }
            }
        }
    }

    #[tauri::command]
    pub fn get_documentation_files(
        app: AppHandle,
        state: tauri::State<'_, DbState>,
        custom_dirs: Vec<String>,
    ) -> Result<Vec<DocFileRecord>, String> {
        let conn = state.logbook_read.lock().map_err(|e| e.to_string())?;
        let meta_map = db::get_all_document_metadata(&conn).unwrap_or_default();
        let app_data_dir = get_app_data_dir(&app);

        let mut results = Vec::new();

        // 1. App user-docs directory (%APPDATA%/Apollo Flight/user-docs)
        let user_docs_dir = app_data_dir.join("user-docs");
        let _ = std::fs::create_dir_all(&user_docs_dir);
        scan_dir_for_docs(&user_docs_dir, "user-docs", &meta_map, &mut results, 0);

        // 2. Bundled / docs directory
        let mut docs_dirs = Vec::new();
        docs_dirs.push(std::path::PathBuf::from("docs"));
        docs_dirs.push(std::path::PathBuf::from("../docs"));
        docs_dirs.push(app_data_dir.join("docs"));
        if let Ok(res_dir) = app.path().resource_dir() {
            docs_dirs.push(res_dir.join("docs"));
            docs_dirs.push(res_dir);
        }

        let mut scanned_docs = false;
        for d in docs_dirs {
            if d.is_dir() && !scanned_docs {
                let prev_len = results.len();
                scan_dir_for_docs(&d, "docs", &meta_map, &mut results, 0);
                if results.len() > prev_len {
                    scanned_docs = true;
                }
            }
        }

        // 3. User custom directories
        for cd in custom_dirs {
            let p = std::path::PathBuf::from(&cd);
            if p.is_dir() {
                scan_dir_for_docs(&p, "custom", &meta_map, &mut results, 0);
            }
        }

        Ok(results)
    }

    #[tauri::command]
    pub fn save_document_metadata(
        state: tauri::State<'_, DbState>,
        file_path: String,
        title: Option<String>,
        tags: Vec<String>,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::save_document_metadata(&conn, &file_path, title.as_deref(), &tags)
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn record_document_opened(
        state: tauri::State<'_, DbState>,
        file_path: String,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::record_document_opened(&conn, &file_path).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn read_document_file(file_path: String) -> Result<DocFileContent, String> {
        let path = std::path::Path::new(&file_path);
        if !path.exists() {
            return Err("File does not exist".to_string());
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        if ext == "md" || ext == "markdown" {
            let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            Ok(DocFileContent {
                path: file_path,
                extension: "md".to_string(),
                text_content: Some(text),
                base64_content: None,
            })
        } else if ext == "pdf" {
            let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
            let b64 = to_base64(&bytes);
            Ok(DocFileContent {
                path: file_path,
                extension: "pdf".to_string(),
                text_content: None,
                base64_content: Some(b64),
            })
        } else {
            Err("Unsupported file format".to_string())
        }
    }

    #[tauri::command]
    pub fn open_user_docs_folder(app: AppHandle) -> Result<(), String> {
        let app_data_dir = get_app_data_dir(&app);
        let user_docs_dir = app_data_dir.join("user-docs");
        let _ = std::fs::create_dir_all(&user_docs_dir);
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(&user_docs_dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

