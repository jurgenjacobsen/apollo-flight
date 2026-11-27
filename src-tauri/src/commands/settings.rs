use std::sync::atomic::Ordering;
use tauri::AppHandle;
use crate::{db, get_log_dir, DbState, LogFileInfo, CLOSE_TO_TRAY};

    #[tauri::command]
    pub fn get_close_to_tray() -> bool {
        CLOSE_TO_TRAY.load(Ordering::SeqCst)
    }

    #[tauri::command]
    pub fn set_close_to_tray(state: tauri::State<'_, DbState>, enabled: bool) -> Result<(), String> {
        CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::set_user_setting(&conn, "closeToTray", if enabled { "true" } else { "false" })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn get_user_setting(
        state: tauri::State<'_, DbState>,
        key: String,
    ) -> Result<Option<String>, String> {
        let conn = state.logbook_read.lock().map_err(|e| e.to_string())?;
        db::get_user_setting(&conn, &key).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn set_user_setting(
        state: tauri::State<'_, DbState>,
        key: String,
        value: String,
    ) -> Result<(), String> {
        let conn = state.logbook.lock().map_err(|e| e.to_string())?;
        db::set_user_setting(&conn, &key, &value).map_err(|e| e.to_string())?;
        if key == "closeToTray" {
            CLOSE_TO_TRAY.store(value == "true", Ordering::SeqCst);
        }
        Ok(())
    }

    #[tauri::command]
    pub fn get_all_user_settings(
        state: tauri::State<'_, DbState>,
    ) -> Result<std::collections::HashMap<String, String>, String> {
        let conn = state.logbook_read.lock().map_err(|e| e.to_string())?;
        db::get_all_user_settings(&conn).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn list_log_files(app: AppHandle) -> Result<Vec<LogFileInfo>, String> {
        let log_dir = get_log_dir(&app);
        let mut files = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&log_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(".log") || name.ends_with(".txt") {
                        if let Ok(metadata) = entry.metadata() {
                            let size_bytes = metadata.len();
                            let modified: chrono::DateTime<chrono::Utc> = metadata
                                .modified()
                                .map(|st| st.into())
                                .unwrap_or_else(|_| chrono::Utc::now());
                            let is_crash = name.starts_with("crash");
                            files.push(LogFileInfo {
                                name,
                                path: path.to_string_lossy().to_string(),
                                size_bytes,
                                modified_iso: modified.to_rfc3339(),
                                is_crash,
                            });
                        }
                    }
                }
            }
        }
        files.sort_by(|a, b| b.modified_iso.cmp(&a.modified_iso));
        Ok(files)
    }

    #[tauri::command]
    pub fn get_log_file_content(app: AppHandle, file_name: String) -> Result<String, String> {
        let safe_name = std::path::Path::new(&file_name)
            .file_name()
            .ok_or_else(|| "Invalid file name".to_string())?;
        let log_dir = get_log_dir(&app);
        let file_path = log_dir.join(safe_name);
        if !file_path.exists() {
            return Err("Log file does not exist".to_string());
        }
        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read log file: {}", e))?;
        const MAX_BYTES: usize = 256 * 1024;
        if content.len() > MAX_BYTES {
            let mut start = content.len() - MAX_BYTES;
            while !content.is_char_boundary(start) {
                start += 1;
            }
            Ok(format!("... [truncated first {} bytes]\n{}", start, &content[start..]))
        } else {
            Ok(content)
        }
    }

    #[tauri::command]
    pub fn log_client_message(
        app: AppHandle,
        level: String,
        message: String,
        context: Option<String>,
    ) -> Result<(), String> {
        let log_dir = get_log_dir(&app);
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let log_path = log_dir.join(format!("apollo-flight-{}.log", today));
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        let ctx_str = context.map(|c| format!(" [{}]", c)).unwrap_or_default();
        let line = format!("[{}] [{}] [CLIENT{}] {}\n", timestamp, level.to_uppercase(), ctx_str, message);
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| e.to_string())?;
        file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn open_external_url(url: String) -> Result<(), String> {
        if !url.starts_with("https://") && !url.starts_with("http://") {
            return Err("Invalid URL protocol".to_string());
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let mut cmd = std::process::Command::new("rundll32.exe");
            cmd.creation_flags(0x08000000);
            let _ = cmd.args(["url.dll,FileProtocolHandler", &url]).spawn()
                .map_err(|e| format!("Failed to launch browser: {}", e))?;
        }
        #[cfg(not(windows))]
        {
            let _ = std::process::Command::new("xdg-open").arg(&url).spawn()
                .map_err(|e| format!("Failed to launch browser: {}", e))?;
        }
        Ok(())
    }

    #[tauri::command]
    pub fn save_file_dialog(
        default_filename: String,
        content: String,
        filter_name: String,
        filter_ext: String,
    ) -> Result<Option<String>, String> {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let temp_dir = std::env::temp_dir();
            let temp_id = uuid::Uuid::new_v4().to_string();
            let temp_file = temp_dir.join(format!("apollo_export_{}.tmp", temp_id));
            std::fs::write(&temp_file, &content).map_err(|e| e.to_string())?;

            let clean_filter = format!("{} (*.{})|*.{}", filter_name, filter_ext, filter_ext);
            let ps_script = format!(
                "Add-Type -AssemblyName System.Windows.Forms;\
                 $d = New-Object System.Windows.Forms.SaveFileDialog;\
                 $d.Title = 'Save Export';\
                 $d.Filter = '{}';\
                 $d.FileName = '{}';\
                 if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{\
                     [System.IO.File]::Copy('{}', $d.FileName, $true);\
                     [Console]::Out.Write($d.FileName);\
                 }}",
                clean_filter.replace('\'', "''"),
                default_filename.replace('\'', "''"),
                temp_file.to_string_lossy().replace('\'', "''")
            );

            let output = std::process::Command::new("powershell.exe")
                .creation_flags(0x08000000)
                .args(["-NoProfile", "-Sta", "-Command", &ps_script])
                .output();

            let _ = std::fs::remove_file(&temp_file);

            match output {
                Ok(out) => {
                    let chosen_path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !chosen_path.is_empty() {
                        Ok(Some(chosen_path))
                    } else {
                        Ok(None)
                    }
                }
                Err(e) => Err(format!("Failed to show save file dialog: {}", e)),
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (default_filename, content, filter_name, filter_ext);
            Ok(None)
        }
    }

    #[tauri::command]
    pub fn open_directory_dialog() -> Result<Option<String>, String> {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let output = std::process::Command::new("powershell")
                .creation_flags(0x08000000)
                .args([
                    "-NoProfile",
                    "-Command",
                    "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Documentation Folder'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }",
                ])
                .output()
                .map_err(|e| e.to_string())?;
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                Ok(None)
            } else {
                Ok(Some(stdout))
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(None)
        }
    }
