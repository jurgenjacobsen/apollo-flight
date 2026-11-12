use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{header, Method, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::get,
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock, RwLock};
use std::time::SystemTime;
use tauri::{AppHandle, Manager};
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use crate::fsuipc::TelemetryPacket;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EfbStatus {
    pub is_running: bool,
    pub port: u16,
    pub local_ip: String,
    pub url: String,
    pub active_clients: usize,
    pub sim_connected: bool,
}

#[derive(Clone)]
struct EfbServerState {
    latest_telemetry: Arc<RwLock<TelemetryPacket>>,
    broadcast_tx: tokio::sync::broadcast::Sender<TelemetryPacket>,
    active_route: Arc<RwLock<Option<serde_json::Value>>>,
    active_clients: Arc<AtomicUsize>,
    port: u16,
}

struct EfbManager {
    is_running: Arc<AtomicBool>,
    port: Arc<RwLock<u16>>,
    active_clients: Arc<AtomicUsize>,
    shutdown_tx: Arc<RwLock<Option<tokio::sync::watch::Sender<bool>>>>,
    latest_telemetry: Arc<RwLock<TelemetryPacket>>,
    broadcast_tx: tokio::sync::broadcast::Sender<TelemetryPacket>,
    active_route: Arc<RwLock<Option<serde_json::Value>>>,
}

static EFB_MANAGER: OnceLock<EfbManager> = OnceLock::new();

fn get_manager() -> &'static EfbManager {
    EFB_MANAGER.get_or_init(|| {
        let (tx, _) = tokio::sync::broadcast::channel(32);
        EfbManager {
            is_running: Arc::new(AtomicBool::new(false)),
            port: Arc::new(RwLock::new(0)),
            active_clients: Arc::new(AtomicUsize::new(0)),
            shutdown_tx: Arc::new(RwLock::new(None)),
            latest_telemetry: Arc::new(RwLock::new(TelemetryPacket::default())),
            broadcast_tx: tx,
            active_route: Arc::new(RwLock::new(None)),
        }
    })
}

/// Dynamically finds an available random port avoiding 8080 and other common ports
pub fn find_available_port(preferred: Option<u16>) -> u16 {
    if let Some(p) = preferred {
        if p > 1024 && p != 8080 && std::net::TcpListener::bind(("0.0.0.0", p)).is_ok() {
            return p;
        }
    }

    // Pick random candidate port between 24000 and 29999
    let seed = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    for offset in 0..100 {
        let candidate = 24000 + ((seed + offset * 17) % 5000) as u16;
        if candidate != 8080 && std::net::TcpListener::bind(("0.0.0.0", candidate)).is_ok() {
            return candidate;
        }
    }

    // Fallback: let OS assign an open ephemeral port
    if let Ok(listener) = std::net::TcpListener::bind(("0.0.0.0", 0)) {
        if let Ok(addr) = listener.local_addr() {
            return addr.port();
        }
    }

    24820
}

/// Resolves the host LAN IP address using local interface binding
pub fn get_local_ip() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

/// Broadcasts latest telemetry to all connected EFB WebSocket clients
pub fn update_telemetry(packet: &TelemetryPacket) {
    let mgr = get_manager();
    if let Ok(mut lock) = mgr.latest_telemetry.write() {
        *lock = packet.clone();
    }
    // Only broadcast if the server is active
    if mgr.is_running.load(Ordering::SeqCst) {
        let _ = mgr.broadcast_tx.send(packet.clone());
    }
}

/// Sets active route data accessible by the EFB companion
pub fn set_active_route(route: Option<serde_json::Value>) {
    let mgr = get_manager();
    if let Ok(mut lock) = mgr.active_route.write() {
        *lock = route;
    }
}

/// Resolves the frontend dist directory for serving static web assets
fn resolve_dist_dir(app: &AppHandle) -> PathBuf {
    // 1. Check relative dist folder in project root (standard when running dev / build)
    let dist = PathBuf::from("dist");
    if dist.exists() && dist.join("index.html").exists() {
        return dist;
    }
    let parent_dist = PathBuf::from("../dist");
    if parent_dist.exists() && parent_dist.join("index.html").exists() {
        return parent_dist;
    }

    // 2. Tauri resource dir in packaged application
    if let Ok(res_dir) = app.path().resource_dir() {
        let res_dist = res_dir.join("dist");
        if res_dist.exists() && res_dist.join("index.html").exists() {
            return res_dist;
        }
        if res_dir.join("index.html").exists() {
            return res_dir;
        }
    }

    PathBuf::from(".")
}

/// Starts the EFB HTTP & WebSocket server
pub async fn start_server(app: AppHandle, requested_port: Option<u16>) -> Result<EfbStatus, String> {
    let mgr = get_manager();

    // If already running with requested port, return status
    if mgr.is_running.load(Ordering::SeqCst) {
        let current_port = *mgr.port.read().map_err(|e| e.to_string())?;
        if requested_port.is_none() || requested_port == Some(current_port) {
            return Ok(get_status());
        }
        // If different port requested, stop existing server first
        let _ = stop_server().await;
    }

    let port = find_available_port(requested_port);
    let bind_addr = SocketAddr::from(([0, 0, 0, 0], port));

    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| format!("Failed to bind EFB server to port {}: {}", port, e))?;

    if let Ok(mut p) = mgr.port.write() {
        *p = port;
    }
    mgr.is_running.store(true, Ordering::SeqCst);

    let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);
    if let Ok(mut s) = mgr.shutdown_tx.write() {
        *s = Some(shutdown_tx);
    }

    let state = EfbServerState {
        latest_telemetry: mgr.latest_telemetry.clone(),
        broadcast_tx: mgr.broadcast_tx.clone(),
        active_route: mgr.active_route.clone(),
        active_clients: mgr.active_clients.clone(),
        port,
    };

    let dist_dir = resolve_dist_dir(&app);
    let index_file = dist_dir.join("index.html");

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    let mut router = Router::new()
        .route("/api/status", get(api_status))
        .route("/api/telemetry", get(api_telemetry))
        .route("/api/route", get(api_get_route).post(api_set_route))
        .route("/ws", get(ws_handler))
        .layer(cors)
        .with_state(state);

    // If static dist exists, serve it; otherwise serve embedded fallback HTML
    if index_file.exists() {
        let serve_dir = ServeDir::new(&dist_dir).fallback(ServeFile::new(&index_file));
        router = router.fallback_service(serve_dir);
    } else {
        router = router.fallback(fallback_html);
    }

    let is_running_flag = mgr.is_running.clone();

    tokio::spawn(async move {
        log::info!("Apollo Flight EFB server started on http://0.0.0.0:{}", port);

        let server = axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        );

        tokio::select! {
            res = server => {
                if let Err(err) = res {
                    log::error!("EFB server error: {:?}", err);
                }
            }
            _ = shutdown_rx.changed() => {
                log::info!("EFB server received shutdown signal");
            }
        }

        is_running_flag.store(false, Ordering::SeqCst);
        log::info!("Apollo Flight EFB server stopped.");
    });

    Ok(get_status())
}

/// Stops the EFB HTTP & WebSocket server
pub async fn stop_server() -> Result<(), String> {
    let mgr = get_manager();
    if let Ok(mut lock) = mgr.shutdown_tx.write() {
        if let Some(tx) = lock.take() {
            let _ = tx.send(true);
        }
    }
    mgr.is_running.store(false, Ordering::SeqCst);
    mgr.active_clients.store(0, Ordering::SeqCst);
    Ok(())
}

/// Returns current EFB server status
pub fn get_status() -> EfbStatus {
    let mgr = get_manager();
    let is_running = mgr.is_running.load(Ordering::SeqCst);
    let port = mgr.port.read().map(|p| *p).unwrap_or(0);
    let local_ip = get_local_ip();
    let active_clients = mgr.active_clients.load(Ordering::SeqCst);
    let sim_connected = crate::fsuipc::IS_CONNECTED_TO_SIM.load(Ordering::SeqCst);

    let url = if is_running && port > 0 {
        format!("http://{}:{}", local_ip, port)
    } else {
        String::new()
    };

    EfbStatus {
        is_running,
        port,
        local_ip,
        url,
        active_clients,
        sim_connected,
    }
}

// REST Handlers
async fn api_status(State(state): State<EfbServerState>) -> Json<serde_json::Value> {
    let sim_connected = crate::fsuipc::IS_CONNECTED_TO_SIM.load(Ordering::SeqCst);
    let clients = state.active_clients.load(Ordering::SeqCst);
    Json(serde_json::json!({
        "status": "online",
        "app": "Apollo Flight EFB Companion",
        "version": "0.0.4",
        "port": state.port,
        "simConnected": sim_connected,
        "activeClients": clients,
    }))
}

async fn api_telemetry(State(state): State<EfbServerState>) -> Json<TelemetryPacket> {
    let packet = state
        .latest_telemetry
        .read()
        .map(|p| p.clone())
        .unwrap_or_default();
    Json(packet)
}

async fn api_get_route(State(state): State<EfbServerState>) -> Json<serde_json::Value> {
    let route = state
        .active_route
        .read()
        .ok()
        .and_then(|r| r.clone())
        .unwrap_or(serde_json::Value::Null);
    Json(route)
}

async fn api_set_route(
    State(state): State<EfbServerState>,
    Json(payload): Json<serde_json::Value>,
) -> StatusCode {
    if let Ok(mut lock) = state.active_route.write() {
        *lock = Some(payload);
    }
    StatusCode::OK
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<EfbServerState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: EfbServerState) {
    state.active_clients.fetch_add(1, Ordering::SeqCst);
    let (mut sender, mut receiver) = socket.split();

    // 1. Immediately send current telemetry state on connect
    let initial_packet = state
        .latest_telemetry
        .read()
        .map(|p| p.clone())
        .unwrap_or_default();

    if let Ok(json_str) = serde_json::to_string(&initial_packet) {
        if sender.send(Message::Text(json_str)).await.is_err() {
            state.active_clients.fetch_sub(1, Ordering::SeqCst);
            return;
        }
    }

    // 2. Subscribe to broadcast channel
    let mut rx = state.broadcast_tx.subscribe();

    // Keepalive ping loop and telemetry streaming
    let send_task = tokio::spawn(async move {
        while let Ok(packet) = rx.recv().await {
            if let Ok(json_str) = serde_json::to_string(&packet) {
                if sender.send(Message::Text(json_str)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Receive task to consume incoming client messages / detect disconnect
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Close(_) = msg {
                break;
            }
        }
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    state.active_clients.fetch_sub(1, Ordering::SeqCst);
}

async fn fallback_html() -> Response {
    let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Apollo Flight EFB Companion</title>
    <style>
        body { margin: 0; background: #000; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
        p { color: #888; font-size: 0.9rem; max-width: 400px; line-height: 1.5; }
        .badge { display: inline-block; padding: 4px 12px; background: #1c1917; border: 1px solid #292524; border-radius: 9999px; color: #10b981; font-weight: 600; font-size: 0.8rem; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <div class="badge">● Apollo Flight EFB Server Active</div>
    <h1>WiFi Companion Add-on</h1>
    <p>The EFB server is operational. Ensure the frontend web assets are built into the dist directory to access the full Electronic Flight Bag interface.</p>
</body>
</html>"#;
    Html(html).into_response()
}
