use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use chrono::Utc;

pub static IS_CONNECTED_TO_SIM: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPacket {
    pub sim_connected: bool,
    pub is_in_menu: bool,
    pub flight_load_count: u16,
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_msl: f64,
    pub altitude_agl: f64,
    pub indicated_airspeed: f64,
    pub true_airspeed: f64,
    pub ground_speed: f64,
    pub vertical_speed: f64,
    pub pitch: f64,
    pub bank: f64,
    pub heading: f64,
    pub aircraft_title: String,
    pub is_on_ground: bool,
    pub is_engine_running: bool,
    pub nav1_obs: u16,
    pub nav1_radial: f64,
    pub nav1_relative_bearing: f64,
    pub nav1_dme_distance: f64,
    pub nav1_dme_speed: u16,
    pub nav2_obs: u16,
    pub nav2_radial: f64,
    pub nav2_relative_bearing: f64,
    pub nav2_dme_distance: f64,
    pub nav2_dme_speed: u16,
    pub adf1_relative_bearing: f64,
    pub wind_speed: f64,
    pub wind_direction: f64,
    pub oat: f64,
    pub tat: f64,
    pub visibility: f64,
    pub timestamp: String,
}

impl Default for TelemetryPacket {
    fn default() -> Self {
        Self {
            sim_connected: false,
            is_in_menu: false,
            flight_load_count: 0,
            latitude: 0.0,
            longitude: 0.0,
            altitude_msl: 0.0,
            altitude_agl: 0.0,
            indicated_airspeed: 0.0,
            true_airspeed: 0.0,
            ground_speed: 0.0,
            vertical_speed: 0.0,
            pitch: 0.0,
            bank: 0.0,
            heading: 0.0,
            aircraft_title: "Standby (Waiting for MSFS)".to_string(),
            is_on_ground: true,
            is_engine_running: false,
            nav1_obs: 0,
            nav1_radial: 0.0,
            nav1_relative_bearing: 0.0,
            nav1_dme_distance: 0.0,
            nav1_dme_speed: 0,
            nav2_obs: 0,
            nav2_radial: 0.0,
            nav2_relative_bearing: 0.0,
            nav2_dme_distance: 0.0,
            nav2_dme_speed: 0,
            adf1_relative_bearing: 0.0,
            wind_speed: 0.0,
            wind_direction: 0.0,
            oat: 15.0,
            tat: 15.0,
            visibility: 10.0,
            timestamp: Utc::now().to_rfc3339(),
        }
    }
}

#[cfg(windows)]
pub mod win {
    use super::*;
    use std::io;
    use fsuipc::{Handle, Session};
    use fsuipc::user::UserHandle;

    /// FSUIPC conversion helpers according to APP_SPEC Table 3:
    pub struct FsuipcConversions;

    impl FsuipcConversions {
        pub fn parse_latitude(raw: i64) -> f64 {
            raw as f64 * (90.0 / (10001750.0 * 65536.0 * 65536.0))
        }

        pub fn parse_longitude(raw: i64) -> f64 {
            raw as f64 * (360.0 / (65536.0 * 65536.0 * 65536.0 * 65536.0))
        }

        pub fn parse_altitude_msl(raw: i64) -> f64 {
            (raw as f64 / (65536.0 * 65536.0)) * 3.28084
        }

        pub fn parse_altitude_agl(raw: i32) -> f64 {
            raw as f64 / 65536.0
        }

        pub fn parse_airspeed(raw: i32) -> f64 {
            raw as f64 / 128.0
        }

        pub fn parse_ground_speed(raw: i32) -> f64 {
            (raw as f64 * 3600.0) / (65536.0 * 1852.0)
        }

        pub fn parse_vertical_speed(raw: i32) -> f64 {
            (raw as f64 * 60.0 * 3.28084) / 256.0
        }

        pub fn parse_angle_32(raw: i32) -> f64 {
            raw as f64 * 360.0 / (65536.0 * 65536.0)
        }

        pub fn parse_heading(raw: u32) -> f64 {
            raw as f64 * 360.0 / (65536.0 * 65536.0)
        }

        pub fn parse_nav1_relative_bearing(raw: i16) -> f64 {
            raw as f64 * 360.0 / 65536.0
        }

        pub fn parse_radial(raw: u16) -> f64 {
            (raw as f64 * 360.0 / 65536.0 + 360.0) % 360.0
        }

        pub fn parse_relative_bearing(raw: i16) -> f64 {
            raw as f64 * 360.0 / 65536.0
        }
    }

    /// Read all required telemetry offsets in a single batch IPC transaction
    pub fn read_telemetry_batch(handle: &mut UserHandle) -> io::Result<TelemetryPacket> {
        let mut sim_ok: u8 = 0;
        let mut raw_in_menu: u8 = 0;
        let mut raw_flight_load_count: u16 = 0;
        let mut raw_lat: i64 = 0;
        let mut raw_lon: i64 = 0;
        let mut raw_alt_msl: i64 = 0;
        let mut raw_alt_agl: i32 = 0;
        let mut raw_ias: i32 = 0;
        let mut raw_tas: i32 = 0;
        let mut raw_gs: i32 = 0;
        let mut raw_vs: i32 = 0;
        let mut raw_pitch: i32 = 0;
        let mut raw_bank: i32 = 0;
        let mut raw_heading: u32 = 0;
        let mut raw_on_ground: u16 = 0;
        let mut raw_eng1_comb: i32 = 0;
        let mut raw_eng2_comb: i32 = 0;
        let mut raw_nav1_obs: u16 = 0;
        let mut raw_nav1_radial: u16 = 0;
        let mut raw_nav1_rel_brg: i16 = 0;
        let mut raw_nav1_dme_dist: u16 = 0;
        let mut raw_nav1_dme_spd: u16 = 0;
        let mut raw_nav2_obs: u16 = 0;
        let mut raw_nav2_radial: u16 = 0;
        let mut raw_nav2_rel_brg: i16 = 0;
        let mut raw_nav2_dme_dist: u16 = 0;
        let mut raw_nav2_dme_spd: u16 = 0;
        let mut raw_adf1_rel_brg: i16 = 0;
        let mut raw_oat: i16 = 0;
        let mut raw_tat: i16 = 0;
        let mut raw_wind_spd: u16 = 0;
        let mut raw_wind_dir: u16 = 0;
        let mut raw_vis: u16 = 0;
        let mut raw_aircraft_title = [0u8; 256];

        {
            let mut session = handle.session();
            session.read(0x3364, &mut sim_ok)?;
            session.read(0x3365, &mut raw_in_menu)?;
            session.read(0x3F02, &mut raw_flight_load_count)?;
            session.read(0x0560, &mut raw_lat)?;
            session.read(0x0568, &mut raw_lon)?;
            session.read(0x0570, &mut raw_alt_msl)?;
            session.read(0x31E4, &mut raw_alt_agl)?;
            session.read(0x02BC, &mut raw_ias)?;
            session.read(0x02B8, &mut raw_tas)?;
            session.read(0x02B4, &mut raw_gs)?;
            session.read(0x02C8, &mut raw_vs)?;
            session.read(0x0578, &mut raw_pitch)?;
            session.read(0x057C, &mut raw_bank)?;
            session.read(0x0580, &mut raw_heading)?;
            session.read(0x0366, &mut raw_on_ground)?;
            session.read(0x0894, &mut raw_eng1_comb)?;
            session.read(0x092C, &mut raw_eng2_comb)?;
            session.read(0x0C4E, &mut raw_nav1_obs)?;
            session.read(0x0C50, &mut raw_nav1_radial)?;
            session.read(0x0C56, &mut raw_nav1_rel_brg)?;
            session.read(0x0300, &mut raw_nav1_dme_dist)?;
            session.read(0x0302, &mut raw_nav1_dme_spd)?;
            session.read(0x0C5E, &mut raw_nav2_obs)?;
            session.read(0x0C60, &mut raw_nav2_radial)?;
            session.read(0x0C62, &mut raw_nav2_rel_brg)?;
            session.read(0x0306, &mut raw_nav2_dme_dist)?;
            session.read(0x0308, &mut raw_nav2_dme_spd)?;
            session.read(0x02C0, &mut raw_adf1_rel_brg)?;
            session.read(0x0E8C, &mut raw_oat)?;
            session.read(0x11D0, &mut raw_tat)?;
            session.read(0x0E90, &mut raw_wind_spd)?;
            session.read(0x0E92, &mut raw_wind_dir)?;
            session.read(0x0E8A, &mut raw_vis)?;
            session.read_bytes(0x3D00, raw_aircraft_title.as_mut_ptr(), 256)?;
            session.process()?;
        }

        let title_end = raw_aircraft_title.iter().position(|&b| b == 0).unwrap_or(256);
        let aircraft_title = String::from_utf8_lossy(&raw_aircraft_title[..title_end])
            .trim()
            .to_string();

        let is_in_menu = aircraft_title.is_empty()
            || aircraft_title == "Standby (Waiting for MSFS)"
            || raw_in_menu != 0
            || sim_ok != 0;

        let dme_dist = if raw_nav1_dme_dist == 0xFFFF {
            0.0
        } else {
            (raw_nav1_dme_dist as f64) / 10.0
        };

        let dme_spd = if raw_nav1_dme_spd == 0xFFFF {
            0
        } else {
            raw_nav1_dme_spd / 10
        };

        let dme2_dist = if raw_nav2_dme_dist == 0xFFFF {
            0.0
        } else {
            (raw_nav2_dme_dist as f64) / 10.0
        };

        let dme2_spd = if raw_nav2_dme_spd == 0xFFFF {
            0
        } else {
            raw_nav2_dme_spd / 10
        };

        let heading_deg = (FsuipcConversions::parse_heading(raw_heading) + 360.0) % 360.0;
        let pitch_deg = FsuipcConversions::parse_angle_32(raw_pitch);
        let bank_deg = FsuipcConversions::parse_angle_32(raw_bank);
        let is_engine_running = raw_eng1_comb != 0 || raw_eng2_comb != 0;

        Ok(TelemetryPacket {
            sim_connected: true,
            is_in_menu,
            flight_load_count: raw_flight_load_count,
            latitude: FsuipcConversions::parse_latitude(raw_lat),
            longitude: FsuipcConversions::parse_longitude(raw_lon),
            altitude_msl: FsuipcConversions::parse_altitude_msl(raw_alt_msl).round(),
            altitude_agl: FsuipcConversions::parse_altitude_agl(raw_alt_agl).round().max(0.0),
            indicated_airspeed: FsuipcConversions::parse_airspeed(raw_ias).round().max(0.0),
            true_airspeed: FsuipcConversions::parse_airspeed(raw_tas).round().max(0.0),
            ground_speed: FsuipcConversions::parse_ground_speed(raw_gs).round().max(0.0),
            vertical_speed: FsuipcConversions::parse_vertical_speed(raw_vs).round(),
            pitch: (pitch_deg * 10.0).round() / 10.0,
            bank: (bank_deg * 10.0).round() / 10.0,
            heading: (heading_deg * 10.0).round() / 10.0,
            aircraft_title: if aircraft_title.is_empty() {
                "MSFS Aircraft".to_string()
            } else {
                aircraft_title
            },
            is_on_ground: raw_on_ground != 0,
            is_engine_running,
            nav1_obs: raw_nav1_obs % 360,
            nav1_radial: (FsuipcConversions::parse_radial(raw_nav1_radial) * 10.0).round() / 10.0,
            nav1_relative_bearing: (FsuipcConversions::parse_relative_bearing(raw_nav1_rel_brg) * 10.0).round() / 10.0,
            nav1_dme_distance: (dme_dist * 10.0).round() / 10.0,
            nav1_dme_speed: dme_spd,
            nav2_obs: raw_nav2_obs % 360,
            nav2_radial: (FsuipcConversions::parse_radial(raw_nav2_radial) * 10.0).round() / 10.0,
            nav2_relative_bearing: (FsuipcConversions::parse_relative_bearing(raw_nav2_rel_brg) * 10.0).round() / 10.0,
            nav2_dme_distance: (dme2_dist * 10.0).round() / 10.0,
            nav2_dme_speed: dme2_spd,
            adf1_relative_bearing: (FsuipcConversions::parse_relative_bearing(raw_adf1_rel_brg) * 10.0).round() / 10.0,
            wind_speed: raw_wind_spd as f64,
            wind_direction: (((raw_wind_dir as f64 * 360.0 / 65536.0 + 360.0) % 360.0) * 10.0).round() / 10.0,
            oat: ((raw_oat as f64 / 256.0) * 10.0).round() / 10.0,
            tat: ((raw_tat as f64 / 256.0) * 10.0).round() / 10.0,
            visibility: ((raw_vis as f64 / 100.0) * 10.0).round() / 10.0,
            timestamp: Utc::now().to_rfc3339(),
        })
    }
}

/// Starts the background telemetry streaming thread
#[cfg(windows)]
pub fn start_telemetry_loop(app: AppHandle, is_running: Arc<AtomicBool>) {
    use fsuipc::user::UserHandle;

    std::thread::spawn(move || {
        log::info!("Apollo Flight FSUIPC7 background worker thread started (Windows).");

        while is_running.load(Ordering::SeqCst) {
            match UserHandle::new() {
                Ok(mut handle) => {
                    log::info!("Successfully connected to FSUIPC7 (UIPCMAIN).");
                    IS_CONNECTED_TO_SIM.store(true, Ordering::SeqCst);

                    // Connected poll loop
                    while is_running.load(Ordering::SeqCst) {
                        match win::read_telemetry_batch(&mut handle) {
                            Ok(packet) => {
                                let _ = app.emit("fsuipc-telemetry", &packet);

                                // Dynamic poll rate: 4Hz (250ms) when airborne/active, 1Hz (1000ms) when stationary on ground
                                let sleep_ms = if packet.is_on_ground && packet.ground_speed < 10.0 {
                                    1000
                                } else {
                                    250
                                };
                                std::thread::sleep(Duration::from_millis(sleep_ms));
                            }
                            Err(err) => {
                                log::warn!("FSUIPC7 read error or simulator disconnected: {:?}", err);
                                break;
                            }
                        }
                    }

                    // Handle dropped / disconnected
                    IS_CONNECTED_TO_SIM.store(false, Ordering::SeqCst);
                    let mut disconnected_packet = TelemetryPacket::default();
                    disconnected_packet.sim_connected = false;
                    let _ = app.emit("fsuipc-telemetry", &disconnected_packet);
                    log::info!("FSUIPC7 connection lost, waiting to reconnect...");
                }
                Err(_) => {
                    // Simulator / FSUIPC7 is not currently running
                    IS_CONNECTED_TO_SIM.store(false, Ordering::SeqCst);
                    std::thread::sleep(Duration::from_millis(1500));
                }
            }
        }

        log::info!("Apollo Flight FSUIPC7 worker thread stopped.");
    });
}

/// Fallback telemetry worker for macOS / Linux platforms where FSUIPC is unavailable
#[cfg(not(windows))]
pub fn start_telemetry_loop(_app: AppHandle, is_running: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        log::info!("Apollo Flight running on non-Windows OS. Telemetry worker idle.");
        while is_running.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(2000));
        }
    });
}
