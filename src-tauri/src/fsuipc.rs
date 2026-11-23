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
    pub engine_combustion_mask: u8,
    pub all_engines_stopped: bool,
    pub sim_time_seconds: u32,
    pub is_slew_active: bool,
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
    pub total_weight: f64,
    pub g_force: f64,
    pub touchdown_normal_velocity: f64,
    pub sideslip_angle: f64,
    pub headwind_component: f64,
    pub crosswind_component: f64,
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
            engine_combustion_mask: 0,
            all_engines_stopped: true,
            sim_time_seconds: 0,
            is_slew_active: false,
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
            total_weight: 0.0,
            g_force: 1.0,
            touchdown_normal_velocity: 0.0,
            sideslip_angle: 0.0,
            headwind_component: 0.0,
            crosswind_component: 0.0,
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
        let mut raw_eng3_comb: i32 = 0;
        let mut raw_eng4_comb: i32 = 0;
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
        let mut raw_gross_weight: f64 = 0.0;
        let mut raw_g_force: i16 = 625;
        let mut raw_td_rate: i32 = 0;
        let mut raw_body_vx: f64 = 0.0;
        let mut raw_body_vz: f64 = 0.0;
        let mut raw_sim_time_sec: u32 = 0;
        let mut raw_slew_mode: u16 = 0;
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
            session.read(0x09C4, &mut raw_eng3_comb)?;
            session.read(0x0A5C, &mut raw_eng4_comb)?;
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
            session.read(0x30C0, &mut raw_gross_weight)?;
            session.read(0x11BA, &mut raw_g_force)?;
            session.read(0x030C, &mut raw_td_rate)?;
            session.read(0x31D0, &mut raw_body_vx)?;
            session.read(0x31E0, &mut raw_body_vz)?;
            session.read(0x0240, &mut raw_sim_time_sec)?;
            session.read(0x05DC, &mut raw_slew_mode)?;
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
            || sim_ok != 0
            || (raw_lat == 0 && raw_lon == 0);

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
        let engine_combustion_mask: u8 = (if raw_eng1_comb != 0 { 1 } else { 0 })
            | (if raw_eng2_comb != 0 { 2 } else { 0 })
            | (if raw_eng3_comb != 0 { 4 } else { 0 })
            | (if raw_eng4_comb != 0 { 8 } else { 0 });
        let is_engine_running = engine_combustion_mask != 0;
        let all_engines_stopped = engine_combustion_mask == 0;

        let g_force = ((raw_g_force as f64 / 625.0) * 100.0).round() / 100.0;
        let touchdown_normal_velocity = FsuipcConversions::parse_vertical_speed(raw_td_rate).round();
        let sideslip_angle = if raw_body_vz.abs() > 1.0 {
            ((raw_body_vx / raw_body_vz).atan().to_degrees() * 10.0).round() / 10.0
        } else {
            0.0
        };
        let wind_dir_deg = (((raw_wind_dir as f64 * 360.0 / 65536.0 + 360.0) % 360.0) * 10.0).round() / 10.0;
        let angle_diff_rad = ((wind_dir_deg - heading_deg) as f64).to_radians();
        let headwind_component = (raw_wind_spd as f64 * angle_diff_rad.cos() * 10.0).round() / 10.0;
        let crosswind_component = (raw_wind_spd as f64 * angle_diff_rad.sin() * 10.0).round() / 10.0;

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
            engine_combustion_mask,
            all_engines_stopped,
            sim_time_seconds: raw_sim_time_sec,
            is_slew_active: raw_slew_mode != 0,
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
            wind_direction: wind_dir_deg,
            oat: ((raw_oat as f64 / 256.0) * 10.0).round() / 10.0,
            tat: ((raw_tat as f64 / 256.0) * 10.0).round() / 10.0,
            visibility: ((raw_vis as f64 / 100.0) * 10.0).round() / 10.0,
            total_weight: if raw_gross_weight > 0.0 { (raw_gross_weight * 10.0).round() / 10.0 } else { 0.0 },
            g_force,
            touchdown_normal_velocity,
            sideslip_angle,
            headwind_component,
            crosswind_component,
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
                                crate::efb::update_telemetry(&packet);

                                // Dynamic adaptive poll rate:
                                // - Above 10,000ft: 1000ms (1 Hz)
                                // - Airborne, 1,000ft - 10,000ft: 500ms (2 Hz)
                                // - Airborne, below 1,000ft AGL: gradual interpolation 500ms -> 20ms (50 Hz at touchdown)
                                // - On ground: 1000ms (<10 kt taxi/parked), 100ms during high-speed rollout
                                let sleep_ms = calculate_dynamic_sleep_ms(&packet);
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
                    crate::efb::update_telemetry(&disconnected_packet);
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

/// Computes the adaptive dynamic telemetry poll sleep interval based on altitude and flight regime:
/// - Above 10,000 ft MSL: 1000ms (1 Hz) - high altitude cruise does not require rapid polling.
/// - Airborne, 1,000 ft to 10,000 ft: 500ms (2 Hz) - standard climb, cruise, and approach.
/// - Airborne, below 1,000 ft AGL: Gradual linear progression from 500ms down to 20ms (50 Hz) at touchdown.
///   Formula: 20 + (agl_ft.clamp(0.0, 1000.0) / 1000.0) * (500.0 - 20.0).
/// - On ground: 1000ms (1 Hz) when parked or taxiing slowly (< 10 kt); 100ms during high-speed rollout.
pub fn calculate_dynamic_sleep_ms(packet: &TelemetryPacket) -> u64 {
    if packet.is_on_ground {
        if packet.ground_speed < 10.0 {
            1000
        } else {
            // High-speed rollout immediately after touchdown
            100
        }
    } else {
        // Airborne flight regimes
        if packet.altitude_msl > 10000.0 {
            1000
        } else if packet.altitude_agl >= 1000.0 {
            500
        } else {
            // Below 1000 ft AGL: gradual interpolation from 500ms at 1000ft down to 20ms at 0ft
            let agl_clamped = packet.altitude_agl.max(0.0).min(1000.0);
            let factor = agl_clamped / 1000.0;
            let ms = 20.0 + factor * (500.0 - 20.0);
            ms.round() as u64
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dynamic_sleep_intervals() {
        let mut pkt = TelemetryPacket::default();
        pkt.is_on_ground = false;

        // Above 10,000 ft MSL: 1000ms
        pkt.altitude_msl = 35000.0;
        pkt.altitude_agl = 33000.0;
        assert_eq!(calculate_dynamic_sleep_ms(&pkt), 1000);

        // Airborne between 1,000 ft and 10,000 ft: 500ms
        pkt.altitude_msl = 5000.0;
        pkt.altitude_agl = 3500.0;
        assert_eq!(calculate_dynamic_sleep_ms(&pkt), 500);

        // Exactly 1,000 ft AGL: 500ms
        pkt.altitude_msl = 1500.0;
        pkt.altitude_agl = 1000.0;
        assert_eq!(calculate_dynamic_sleep_ms(&pkt), 500);

        // 500 ft AGL -> 20 + 0.5 * 480 = 260ms
        pkt.altitude_msl = 1000.0;
        pkt.altitude_agl = 500.0;
        assert_eq!(calculate_dynamic_sleep_ms(&pkt), 260);

        // 100 ft AGL -> 20 + 0.1 * 480 = 68ms
        pkt.altitude_agl = 100.0;
        assert_eq!(calculate_dynamic_sleep_ms(&pkt), 68);

        // 0 ft AGL (touchdown) -> 20ms (50 Hz)
        pkt.altitude_agl = 0.0;
        assert_eq!(calculate_dynamic_sleep_ms(&pkt), 20);

        // On ground stationary / taxiing < 10 kt: 1000ms
        pkt.is_on_ground = true;
        pkt.ground_speed = 5.0;
        assert_eq!(calculate_dynamic_sleep_ms(&pkt), 1000);

        // On ground high-speed rollout >= 10 kt: 100ms
        pkt.ground_speed = 120.0;
        assert_eq!(calculate_dynamic_sleep_ms(&pkt), 100);
    }
}
