use std::sync::Mutex;
use std::path::PathBuf;
use tauri::AppHandle;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;

const NAVIGRAPH_IDENTITY_URL: &str = "https://identity.api.navigraph.com";

#[derive(Debug, Clone)]
struct PendingAuth {
    code_verifier: String,
    device_code: String,
    client_id: String,
    client_secret: Option<String>,
}

static PENDING_AUTH: Mutex<Option<PendingAuth>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NavigraphSession {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub preferred_username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigraphAuthState {
    pub is_authenticated: bool,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub preferred_username: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthInitResult {
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigraphPollStatus {
    pub status: String, // "pending", "slow_down", "success", "error"
    pub message: Option<String>,
    pub user: Option<NavigraphAuthState>,
}

#[derive(Deserialize)]
struct DeviceAuthResponseRaw {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: Option<String>,
    expires_in: u64,
    interval: Option<u64>,
}

#[derive(Deserialize)]
struct TokenResponseRaw {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
    #[allow(dead_code)]
    token_type: Option<String>,
}

#[derive(Deserialize)]
struct ErrorResponseRaw {
    error: Option<String>,
    #[allow(dead_code)]
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct UserInfoRaw {
    sub: Option<String>,
    name: Option<String>,
    preferred_username: Option<String>,
}

fn get_session_file_path(app: &AppHandle) -> PathBuf {
    crate::get_app_data_dir(app).join("navigraph_session.json")
}

pub fn load_session(app: &AppHandle) -> NavigraphSession {
    let path = get_session_file_path(app);
    if path.exists() {
        if let Ok(bytes) = std::fs::read(&path) {
            if let Ok(sess) = serde_json::from_slice::<NavigraphSession>(&bytes) {
                return sess;
            }
        }
    }
    NavigraphSession::default()
}

pub fn save_session(app: &AppHandle, session: &NavigraphSession) -> Result<(), String> {
    let path = get_session_file_path(app);
    let json = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn generate_pkce() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let code_verifier = URL_SAFE_NO_PAD.encode(bytes);

    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let hash = hasher.finalize();
    let code_challenge = URL_SAFE_NO_PAD.encode(hash);

    (code_verifier, code_challenge)
}

#[tauri::command]
pub async fn navigraph_start_device_auth(
    _app: AppHandle,
    client_id: Option<String>,
    client_secret: Option<String>,
) -> Result<DeviceAuthInitResult, String> {
    let cid = client_id.unwrap_or_else(|| "apollo-flight".to_string());
    let (code_verifier, code_challenge) = generate_pkce();

    let client = reqwest::Client::new();
    let mut form_params = std::collections::HashMap::new();
    form_params.insert("client_id", cid.as_str());
    if let Some(ref sec) = client_secret {
        form_params.insert("client_secret", sec.as_str());
    }
    form_params.insert("code_challenge", code_challenge.as_str());
    form_params.insert("code_challenge_method", "S256");
    form_params.insert("scope", "openid offline_access fmsdata");

    let resp = client
        .post(format!("{}/connect/deviceauthorization", NAVIGRAPH_IDENTITY_URL))
        .form(&form_params)
        .send()
        .await
        .map_err(|e| format!("Navigraph Device Auth request failed: {}", e))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Device Auth error from Navigraph: {}", err_text));
    }

    let auth_data: DeviceAuthResponseRaw = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Device Auth response: {}", e))?;

    // Store pending auth
    {
        let mut pending = PENDING_AUTH.lock().unwrap();
        *pending = Some(PendingAuth {
            code_verifier,
            device_code: auth_data.device_code.clone(),
            client_id: cid,
            client_secret,
        });
    }

    // Auto-launch the verification URL in default system browser
    let target_url = auth_data
        .verification_uri_complete
        .as_ref()
        .unwrap_or(&auth_data.verification_uri);
    let _ = crate::commands::open_external_url(target_url.clone());

    Ok(DeviceAuthInitResult {
        user_code: auth_data.user_code,
        verification_uri: auth_data.verification_uri,
        verification_uri_complete: auth_data.verification_uri_complete,
        expires_in: auth_data.expires_in,
        interval: auth_data.interval.unwrap_or(5),
    })
}

#[tauri::command]
pub async fn navigraph_poll_device_token(
    app: AppHandle,
) -> Result<NavigraphPollStatus, String> {
    let pending = {
        let guard = PENDING_AUTH.lock().unwrap();
        guard.clone()
    };

    let pending = match pending {
        Some(p) => p,
        None => {
            return Ok(NavigraphPollStatus {
                status: "error".to_string(),
                message: Some("No pending authorization flow found. Please start again.".to_string()),
                user: None,
            });
        }
    };

    let client = reqwest::Client::new();
    let mut form_params = std::collections::HashMap::new();
    form_params.insert("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
    form_params.insert("device_code", pending.device_code.as_str());
    form_params.insert("client_id", pending.client_id.as_str());
    if let Some(ref sec) = pending.client_secret {
        form_params.insert("client_secret", sec.as_str());
    }
    form_params.insert("code_verifier", pending.code_verifier.as_str());
    form_params.insert("scope", "openid offline_access fmsdata");

    let resp = client
        .post(format!("{}/connect/token", NAVIGRAPH_IDENTITY_URL))
        .form(&form_params)
        .send()
        .await
        .map_err(|e| format!("Navigraph Token request failed: {}", e))?;

    let status = resp.status();
    if status == reqwest::StatusCode::OK {
        let token_data: TokenResponseRaw = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse token response: {}", e))?;

        let now_sec = chrono::Utc::now().timestamp();
        let expires_at = now_sec + (token_data.expires_in as i64);

        // Fetch User Info
        let user_info_resp = client
            .get(format!("{}/connect/userinfo", NAVIGRAPH_IDENTITY_URL))
            .bearer_auth(&token_data.access_token)
            .send()
            .await;

        let mut user_id = None;
        let mut user_name = None;
        let mut preferred_username = None;

        if let Ok(u_resp) = user_info_resp {
            if u_resp.status().is_success() {
                if let Ok(info) = u_resp.json::<UserInfoRaw>().await {
                    user_id = info.sub;
                    user_name = info.name;
                    preferred_username = info.preferred_username;
                }
            }
        }

        let session = NavigraphSession {
            client_id: Some(pending.client_id),
            client_secret: pending.client_secret,
            access_token: Some(token_data.access_token),
            refresh_token: token_data.refresh_token,
            expires_at: Some(expires_at),
            user_id: user_id.clone(),
            user_name: user_name.clone(),
            preferred_username: preferred_username.clone(),
        };

        save_session(&app, &session)?;

        // Clear pending state
        {
            let mut guard = PENDING_AUTH.lock().unwrap();
            *guard = None;
        }

        let auth_state = NavigraphAuthState {
            is_authenticated: true,
            user_id,
            user_name,
            preferred_username,
            expires_at: Some(expires_at),
        };

        return Ok(NavigraphPollStatus {
            status: "success".to_string(),
            message: None,
            user: Some(auth_state),
        });
    }

    if status == reqwest::StatusCode::BAD_REQUEST {
        let err_json: ErrorResponseRaw = resp.json().await.unwrap_or(ErrorResponseRaw {
            error: None,
            error_description: None,
        });

        match err_json.error.as_deref() {
            Some("authorization_pending") => {
                return Ok(NavigraphPollStatus {
                    status: "pending".to_string(),
                    message: Some("Waiting for browser authorization...".to_string()),
                    user: None,
                });
            }
            Some("slow_down") => {
                return Ok(NavigraphPollStatus {
                    status: "slow_down".to_string(),
                    message: Some("Rate limited, slowing down polling interval.".to_string()),
                    user: None,
                });
            }
            Some("expired_token") => {
                let mut guard = PENDING_AUTH.lock().unwrap();
                *guard = None;
                return Ok(NavigraphPollStatus {
                    status: "error".to_string(),
                    message: Some("Authorization request expired. Please try again.".to_string()),
                    user: None,
                });
            }
            Some("access_denied") => {
                let mut guard = PENDING_AUTH.lock().unwrap();
                *guard = None;
                return Ok(NavigraphPollStatus {
                    status: "error".to_string(),
                    message: Some("Authorization denied in browser.".to_string()),
                    user: None,
                });
            }
            other => {
                return Ok(NavigraphPollStatus {
                    status: "error".to_string(),
                    message: Some(format!("OAuth error: {:?}", other)),
                    user: None,
                });
            }
        }
    }

    Ok(NavigraphPollStatus {
        status: "error".to_string(),
        message: Some(format!("Unexpected server response: {}", status)),
        user: None,
    })
}

#[tauri::command]
pub async fn navigraph_get_auth_status(
    app: AppHandle,
) -> Result<NavigraphAuthState, String> {
    let mut session = load_session(&app);

    if session.access_token.is_none() {
        return Ok(NavigraphAuthState {
            is_authenticated: false,
            user_id: None,
            user_name: None,
            preferred_username: None,
            expires_at: None,
        });
    }

    let now = chrono::Utc::now().timestamp();
    let expires = session.expires_at.unwrap_or(0);

    // If token expires in less than 60 seconds, attempt silent refresh
    if now >= (expires - 60) {
        if let Some(ref r_token) = session.refresh_token {
            let client = reqwest::Client::new();
            let mut form_params = std::collections::HashMap::new();
            form_params.insert("grant_type", "refresh_token");
            form_params.insert("refresh_token", r_token.as_str());
            let default_cid = "apollo-flight".to_string();
            let cid = session.client_id.as_ref().unwrap_or(&default_cid);
            form_params.insert("client_id", cid.as_str());
            if let Some(ref sec) = session.client_secret {
                form_params.insert("client_secret", sec.as_str());
            }

            if let Ok(res) = client
                .post(format!("{}/connect/token", NAVIGRAPH_IDENTITY_URL))
                .form(&form_params)
                .send()
                .await
            {
                if res.status().is_success() {
                    if let Ok(t_data) = res.json::<TokenResponseRaw>().await {
                        session.access_token = Some(t_data.access_token);
                        if let Some(new_rt) = t_data.refresh_token {
                            session.refresh_token = Some(new_rt);
                        }
                        session.expires_at = Some(now + (t_data.expires_in as i64));
                        let _ = save_session(&app, &session);
                    }
                }
            }
        }
    }

    Ok(NavigraphAuthState {
        is_authenticated: session.access_token.is_some(),
        user_id: session.user_id,
        user_name: session.user_name,
        preferred_username: session.preferred_username,
        expires_at: session.expires_at,
    })
}

#[tauri::command]
pub async fn navigraph_logout(app: AppHandle) -> Result<(), String> {
    let path = get_session_file_path(&app);
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    let mut guard = PENDING_AUTH.lock().unwrap();
    *guard = None;
    Ok(())
}
