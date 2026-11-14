# FSUIPC7 Bridge Data Reference for MSFS 2020 & 2024

This document details all known **Microsoft Flight Simulator (MSFS 2020 / MSFS 2024)** telemetry, avionics, radio navigation aids, engine parameters, and flight state data extractable via the **FSUIPC7** IPC memory-mapped interface in **Apollo Flight**.

---

## 1. Active Apollo Flight Telemetry Batch (Table of Implemented Offsets)

These offsets are queried in a single atomic batch IPC transaction every tick (~250 ms) by the background Rust worker thread (`src-tauri/src/fsuipc.rs`):

| Parameter | FSUIPC Offset | Size & Type | MSFS SimVar Equivalent | Conversion / Scaling Formula | Engineering Units | Apollo Flight Usage |
|:---|:---:|:---:|:---|:---|:---:|:---|
| **Sim Connection Status** | `0x3364` | 1 Byte (`u8`) | Internal FSUIPC | `0` = Sim Running & Ready | Status | Connection heartbeat |
| **In-Menu / Loading Flag** | `0x3365` | 1 Byte (`u8`) | Internal FSUIPC | `!= 0` = In Menu or loading | Boolean | Halts recording during menus |
| **Flight Load Counter** | `0x3F02` | 2 Bytes (`u16`) | Internal FSUIPC | Increments on scenario reset | Counter | Detects flight restart/teleport |
| **Latitude** | `0x0560` | 8 Bytes (`i64`) | `PLANE LATITUDE` | `Value * 90.0 / (10001750.0 * 65536.0 * 65536.0)` | Degrees (±90°) | GPS flight track & mapping |
| **Longitude** | `0x0568` | 8 Bytes (`i64`) | `PLANE LONGITUDE` | `Value * 360.0 / (65536.0 * 65536.0 * 65536.0 * 65536.0)` | Degrees (±180°) | GPS flight track & mapping |
| **Altitude MSL** | `0x0570` | 8 Bytes (`i64`) | `PLANE ALTITUDE` | `Value * 3.28084 / (65536.0 * 65536.0)` | Feet MSL | Cruise & vertical profile |
| **Altitude AGL (Radar)** | `0x31E4` | 4 Bytes (`i32`) | `RADIO HEIGHT` | `Value / 65536.0 * 3.28084` | Feet AGL | Flare & touchdown detection |
| **Indicated Airspeed (IAS)** | `0x02BC` | 4 Bytes (`i32`) | `AIRSPEED INDICATED` | `Value / 128.0` | Knots (kt) | Airspeed gauge & stage monitor |
| **True Airspeed (TAS)** | `0x02B8` | 4 Bytes (`i32`) | `AIRSPEED TRUE` | `Value / 128.0` | Knots (kt) | Cruise performance analysis |
| **Ground Speed (GS)** | `0x02B4` | 4 Bytes (`i32`) | `GPS GROUND SPEED` | `Value / 65536.0 * 3600.0 / 1852.0` | Knots (kt) | Taxi, takeoff & ground speed |
| **Vertical Speed (VS)** | `0x02C8` | 4 Bytes (`i32`) | `VERTICAL SPEED` | `Value * 60.0 * 3.28084 / 256.0` | Feet / min (fpm) | Touchdown physics & climb rate |
| **Pitch Angle** | `0x0578` | 4 Bytes (`i32`) | `PLANE PITCH DEGREES` | `Value * 360.0 / (65536.0 * 65536.0)` | Degrees (deg) | Pitch attitude & flare physics |
| **Bank / Roll Angle** | `0x057C` | 4 Bytes (`i32`) | `PLANE BANK DEGREES` | `Value * 360.0 / (65536.0 * 65536.0)` | Degrees (deg) | Roll attitude & turn analysis |
| **Magnetic Heading** | `0x0580` | 4 Bytes (`u32`) | `PLANE HEADING DEGREES MAGNETIC` | `Value * 360.0 / (65536.0 * 65536.0)` | Degrees (000–359°) | Heading rose & visualizers |
| **Weight on Wheels (WOW)** | `0x0366` | 2 Bytes (`u16`) | `SIM ON GROUND` | `!= 0` = On Ground (`1`), `0` = Airborne | Boolean | Flight stage & landing logging |
| **Engine 1 Combustion** | `0x0894` | 4 Bytes (`i32`) | `GENERAL ENG COMBUSTION:1` | `!= 0` = Running | Boolean | Auto-start flight detection |
| **Engine 2 Combustion** | `0x092C` | 4 Bytes (`i32`) | `GENERAL ENG COMBUSTION:2` | `!= 0` = Running | Boolean | Auto-start flight detection |
| **NAV 1 OBS Selected** | `0x0C4E` | 2 Bytes (`u16`) | `NAV OBS:1` | `Value % 360` | Degrees (000–359°) | OBS course needle & tracking |
| **NAV 1 Radial from Station** | `0x0C50` | 2 Bytes (`u16`) | `NAV RADIAL:1` | `(Value * 360.0 / 65536.0) % 360` | Degrees (001–360°) | VOR interception & IFR trainer |
| **NAV 1 Relative Bearing** | `0x0C56` | 2 Bytes (`i16`) | `NAV RELATIVE BEARING TO STATION:1` | `Value * 360.0 / 65536.0` | Degrees (±180°) | RMI bearing pointer |
| **NAV 1 DME Distance** | `0x0300` | 2 Bytes (`u16`) | `NAV DME:1` | If `0xFFFF` -> No signal; else `Value / 10.0` | Nautical Miles (NM) | Distance to station & canvas zoom |
| **NAV 1 DME Speed** | `0x0302` | 2 Bytes (`u16`) | `NAV DMESPEED:1` | If `0xFFFF` -> No signal; else `Value / 10` | Knots (kt) | Groundspeed to/from DME |
| **NAV 2 OBS Selected** | `0x0C5E` | 2 Bytes (`u16`) | `NAV OBS:2` | `Value % 360` | Degrees (000–359°) | Secondary VOR course |
| **NAV 2 Radial from Station** | `0x0C60` | 2 Bytes (`u16`) | `NAV RADIAL:2` | `(Value * 360.0 / 65536.0) % 360` | Degrees (001–360°) | Secondary VOR radial tracking |
| **NAV 2 Relative Bearing** | `0x0C62` | 2 Bytes (`i16`) | `NAV RELATIVE BEARING TO STATION:2` | `Value * 360.0 / 65536.0` | Degrees (±180°) | Secondary RMI bearing pointer |
| **NAV 2 DME Distance** | `0x0306` | 2 Bytes (`u16`) | `NAV DME:2` | If `0xFFFF` -> No signal; else `Value / 10.0` | Nautical Miles (NM) | Distance to NAV2 station |
| **NAV 2 DME Speed** | `0x0308` | 2 Bytes (`u16`) | `NAV DMESPEED:2` | If `0xFFFF` -> No signal; else `Value / 10` | Knots (kt) | NAV2 station groundspeed |
| **ADF 1 Relative Bearing** | `0x02C0` | 2 Bytes (`i16`) | `ADF RADIAL:1` | `Value * 360.0 / 65536.0` | Degrees (±180°) | NDB pointer & QDM/QDR trainer |
| **Aircraft Title / Model** | `0x3D00` | 256 Bytes (`[u8; 256]`) | `TITLE` | ASCII string null-terminated | Text string | Aircraft identification & type |

---

## 2. Master Reference Table of Extractable MSFS Simulation Data via FSUIPC

The following tables categorize all major flight simulator variables extractable from MSFS through FSUIPC7 memory offsets:

### A. Aircraft Spatial State, Position & Dynamics

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **Latitude** | `0x0560` | 8 | `i64` | `* 90.0 / (10001750.0 * 65536^2)` | deg | High-precision latitude north/south |
| **Longitude** | `0x0568` | 8 | `i64` | `* 360.0 / (65536^4)` | deg | High-precision longitude east/west |
| **Altitude MSL** | `0x0570` | 8 | `i64` | `* 3.28084 / (65536^2)` | ft | Aircraft true barometric altitude |
| **Altitude AGL (Radar)** | `0x31E4` | 4 | `i32` | `/ 65536.0 * 3.28084` | ft | Precise height above terrain surface |
| **Pitch Angle** | `0x0578` | 4 | `i32` | `* 360.0 / (65536^2)` | deg | Nose up (+), nose down (-) |
| **Bank / Roll Angle** | `0x057C` | 4 | `i32` | `* 360.0 / (65536^2)` | deg | Bank right (+), bank left (-) |
| **True Heading** | `0x0580` | 4 | `u32` | `* 360.0 / (65536^2)` | deg | True geographic heading |
| **Magnetic Heading** | `0x0580` | 4 | `u32` | Subtract Mag Var (`0x02A0`) | deg | Compass heading |
| **Magnetic Variation** | `0x02A0` | 2 | `i16` | `* 360.0 / 65536.0` | deg | East (+), West (-) |
| **G-Force (Vertical)** | `0x11BA` | 2 | `i16` | `/ 625.0` | G | Acceleration load factor |
| **Normal G-Force** | `0x11B8` | 2 | `i16` | `/ 625.0` | G | Aircraft body Z axis G-load |
| **Side Force / Lateral Accel**| `0x11B4` | 2 | `i16` | `/ 625.0` | G | Body Y axis lateral G-force |
| **Ground Track** | `0x6030` | 8 | `f64` | Direct float | deg | Actual ground track direction |

### B. Airspeed & Aerodynamics

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **Indicated Airspeed (IAS)** | `0x02BC` | 4 | `i32` | `/ 128.0` | kt | Indicated dynamic pressure speed |
| **True Airspeed (TAS)** | `0x02B8` | 4 | `i32` | `/ 128.0` | kt | True airspeed through airmass |
| **Ground Speed (GS)** | `0x02B4` | 4 | `i32` | `/ 65536.0 * 3600 / 1852` | kt | Ground speed over terrain |
| **Vertical Speed (VS)** | `0x02C8` | 4 | `i32` | `* 60 * 3.28084 / 256` | ft/min | Climb / descent rate |
| **Mach Number** | `0x11C6` | 2 | `u16` | `/ 20480.0` | Mach | Speed relative to local speed of sound |
| **Barometric Pressure (QNH)**| `0x0330` | 2 | `u16` | `/ 16.0` | hPa / mbar | Altimeter sub-scale setting |
| **Angle of Attack (AoA)** | `0x11BE` | 2 | `i16` | `* 360.0 / 65536.0` | deg | Wing angle of attack |
| **Stall Warning** | `0x036C` | 1 | `u8` | `!= 0` | Bool | Stall horn/warning active |
| **Overspeed Warning** | `0x036D` | 1 | `u8` | `!= 0` | Bool | Vmo / Mmo exceeded |

### C. Radio Navigation & Avionics (NAV1, NAV2, ADF, DME)

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **NAV1 Frequency** | `0x0350` | 2 | `u16` | BCD: `0x11030` = 110.30 MHz | MHz | Active NAV1 tuned frequency |
| **NAV1 Standby Frequency** | `0x311E` | 2 | `u16` | BCD frequency | MHz | Standby NAV1 frequency |
| **NAV1 OBS Selected** | `0x0C4E` | 2 | `u16` | Value | deg | Selected Omni-Bearing Selector (0–359°) |
| **NAV1 Radial from Station** | `0x0C50` | 2 | `u16` | `* 360.0 / 65536.0` | deg | Magnetic radial FROM station (001–360°) |
| **NAV1 Signal Strength** | `0x0C52` | 4 | `u32` | Proximity magnitude | Raw | Transmitter signal strength |
| **NAV1 Relative Bearing** | `0x0C56` | 2 | `i16` | `* 360.0 / 65536.0` | deg | Relative angle from nose to station |
| **NAV1 Localizer Needle** | `0x0C48` | 1 | `i8` | `-127` (left) to `+127` (right) | Needle | CDI needle horizontal deflection |
| **NAV1 Glideslope Needle** | `0x0C49` | 1 | `i8` | `-127` (down) to `+127` (up) | Needle | GS needle vertical deflection |
| **NAV1 GS Flag (Alive)** | `0x0C4C` | 1 | `u8` | `!= 0` | Bool | Glideslope signal valid |
| **NAV1 Back Course (BC)** | `0x0C4A` | 1 | `u8` | Bitfield | Flags | Back course available / active |
| **NAV1 DME Distance** | `0x0300` | 2 | `u16` | `/ 10.0` (0xFFFF = out of range)| NM | Slant range distance to DME fix |
| **NAV1 DME Speed** | `0x0302` | 2 | `u16` | `/ 10` | kt | Groundspeed towards/away from DME |
| **NAV2 Frequency** | `0x0352` | 2 | `u16` | BCD format | MHz | Active NAV2 tuned frequency |
| **NAV2 OBS Selected** | `0x0C5E` | 2 | `u16` | Value | deg | Selected NAV2 OBS course |
| **NAV2 Radial from Station** | `0x0C60` | 2 | `u16` | `* 360.0 / 65536.0` | deg | Magnetic radial FROM NAV2 station |
| **NAV2 Relative Bearing** | `0x0C62` | 2 | `i16` | `* 360.0 / 65536.0` | deg | Relative angle to NAV2 station |
| **NAV2 DME Distance** | `0x0306` | 2 | `u16` | `/ 10.0` | NM | Slant range distance to NAV2 DME |
| **NAV2 DME Speed** | `0x0308` | 2 | `u16` | `/ 10` | kt | Groundspeed to NAV2 DME |
| **ADF1 Frequency** | `0x034C` | 2 | `u16` | BCD format (e.g. `0x0420` = 420 kHz)| kHz | Tuned NDB beacon frequency |
| **ADF1 Relative Bearing** | `0x02C0` | 2 | `i16` | `* 360.0 / 65536.0` | deg | Relative angle from nose to NDB |
| **Marker Beacon State** | `0x0BAC` | 1 | `u8` | Bit 0: Outer, 1: Middle, 2: Inner | Flags | ILS 75 MHz marker beacons |

### D. Communication & Transponder

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **COM1 Active Frequency** | `0x034E` | 2 | `u16` | BCD: `0x11800` = 118.00 MHz | MHz | Active VHF communication 1 |
| **COM1 Standby Frequency**| `0x311A` | 2 | `u16` | BCD frequency | MHz | Standby VHF communication 1 |
| **COM2 Active Frequency** | `0x3118` | 2 | `u16` | BCD frequency | MHz | Active VHF communication 2 |
| **COM2 Standby Frequency**| `0x311C` | 2 | `u16` | BCD frequency | MHz | Standby VHF communication 2 |
| **Transponder Squawk Code**| `0x0354` | 2 | `u16` | BCD format (e.g., `0x7000` = 7000) | Octal | Mode A/C/S transponder squawk |
| **Transponder State** | `0x0B94` | 4 | `i32` | `0`=Off, `1`=Stby, `4`=Alt/Mode C| Mode | Transponder operational status |
| **Transponder Ident Flag** | `0x0B98` | 1 | `u8` | `!= 0` | Bool | Ident transmission pulse active |

### E. Autopilot & Flight Guidance

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **Autopilot Master** | `0x07BC` | 4 | `i32` | `!= 0` = Engaged | Bool | Autopilot system master switch |
| **Flight Director Active** | `0x2EE0` | 4 | `i32` | `!= 0` = On | Bool | Flight director command bars |
| **Heading Hold Active** | `0x07DC` | 4 | `i32` | `!= 0` = Active | Bool | Autopilot heading hold mode |
| **Heading Bug Setting** | `0x07CC` | 2 | `u16` | `* 360.0 / 65536.0` | deg | Selected heading bug cursor |
| **Altitude Hold Active** | `0x07D0` | 4 | `i32` | `!= 0` = Active | Bool | Autopilot altitude lock |
| **Target Altitude** | `0x07D4` | 4 | `i32` | `* 3.28084 / 65536.0` | ft | Autopilot selected altitude dial |
| **Vertical Speed Hold** | `0x07EC` | 4 | `i32` | `!= 0` = Active | Bool | VS climb/descent hold mode |
| **Target Vertical Speed** | `0x07F2` | 2 | `i16` | Value | ft/min | Target VS setting dial |
| **NAV1 / Course Hold** | `0x07C4` | 4 | `i32` | `!= 0` = Tracking | Bool | VOR/LOC course tracking mode |
| **Approach Hold (APPR)** | `0x0800` | 4 | `i32` | `!= 0` = Armed/Active | Bool | ILS localizer & glideslope capture |
| **Auto-Throttle Master** | `0x0810` | 4 | `i32` | `!= 0` = Armed | Bool | A/T system armed |
| **Airspeed Hold Active** | `0x07DC` | 4 | `i32` | `!= 0` = Active | Bool | Auto-throttle airspeed hold |
| **Target Airspeed (IAS)** | `0x07E2` | 2 | `u16` | Value | kt | Selected target indicated airspeed |

### F. Engines, Propulsion & Systems

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **Engine Count** | `0x0AEC` | 2 | `u16` | Number | Count | Number of installed engines |
| **Engine 1 Combustion** | `0x0894` | 4 | `i32` | `!= 0` = Running | Bool | Engine 1 combustion firing |
| **Engine 2 Combustion** | `0x092C` | 4 | `i32` | `!= 0` = Running | Bool | Engine 2 combustion firing |
| **Engine 3 Combustion** | `0x09C4` | 4 | `i32` | `!= 0` = Running | Bool | Engine 3 combustion firing |
| **Engine 4 Combustion** | `0x0A5C` | 4 | `i32` | `!= 0` = Running | Bool | Engine 4 combustion firing |
| **Engine 1 N1 / Prop RPM** | `0x0898` | 2 | `i16` | `/ 16384.0 * 100.0` | % | Turbine N1 or piston RPM % |
| **Engine 2 N1 / Prop RPM** | `0x0930` | 2 | `i16` | `/ 16384.0 * 100.0` | % | Turbine N1 or piston RPM % |
| **Engine 1 Fuel Flow** | `0x0918` | 8 | `f64` | Pounds per hour (PPH) | PPH | Fuel consumption rate |
| **Engine 2 Fuel Flow** | `0x09B0` | 8 | `f64` | Pounds per hour (PPH) | PPH | Fuel consumption rate |
| **Engine 1 Throttle Lever** | `0x088C` | 2 | `i16` | `/ 16384.0 * 100.0` | % | Physical power lever position |
| **Engine 2 Throttle Lever** | `0x0924` | 2 | `i16` | `/ 16384.0 * 100.0` | % | Physical power lever position |
| **Engine 1 Oil Temp** | `0x08B8` | 2 | `i16` | `/ 16.0` | °C | Lubrication oil temperature |
| **Engine 1 Oil Pressure** | `0x08BA` | 2 | `i16` | `/ 16.0` | PSI | Lubrication oil pressure |

### G. Flight Controls, Gear & Surface Actuators

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **Flaps Handle Position** | `0x0BDC` | 4 | `i32` | Value / Max flaps notches | Steps | Flap selector lever |
| **Flaps Trailing Edge Angle**| `0x30F0` | 8 | `f64` | Radians `* 180.0 / PI` | deg | Physical flap deflection angle |
| **Spoilers / Speedbrakes** | `0x0BD0` | 4 | `i32` | `0`=Retracted, `4800`=Arm, `16384`=Full| % | Speedbrake surface deflection |
| **Landing Gear Handle** | `0x0BE8` | 4 | `i32` | `0` = Up, `16384` = Down | Position | Gear deployment handle |
| **Nose Gear Position** | `0x0BEC` | 4 | `i32` | `0` (Up) to `16384` (Down & Locked)| % | Nose landing gear deployment % |
| **Left Main Gear Position** | `0x0BF0` | 4 | `i32` | `0` to `16384` | % | Left main gear deployment % |
| **Right Main Gear Position**| `0x0BF4` | 4 | `i32` | `0` to `16384` | % | Right main gear deployment % |
| **Parking Brake** | `0x0BC8` | 2 | `u16` | `32767` = Set, `0` = Released | Bool | Emergency / parking brake |
| **Left Brake Pressure** | `0x0BC4` | 2 | `u16` | `/ 16384.0 * 100.0` | % | Left differential toe brake |
| **Right Brake Pressure** | `0x0BC6` | 2 | `u16` | `/ 16384.0 * 100.0` | % | Right differential toe brake |
| **Elevator Trim Position** | `0x0BC0` | 2 | `i16` | `/ 16383.0 * 100.0` | % | Pitch trim tab position |
| **Rudder Trim Position** | `0x0C04` | 2 | `i16` | `/ 16383.0 * 100.0` | % | Yaw trim tab position |

### H. Fuel & Weight Systems

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **Total Fuel Capacity** | `0x1240` | 4 | `u32` | Direct integer | Gallons | Maximum usable fuel capacity |
| **Total Fuel Level** | `0x126C` | 4 | `u32` | `/ 65536.0` | Gallons | Current total fuel remaining |
| **Center Fuel Tank Level** | `0x0B74` | 4 | `u32` | `/ (128 * 65536) * 100` | % | Center tank capacity % |
| **Left Main Tank Level** | `0x0B7C` | 4 | `u32` | `/ (128 * 65536) * 100` | % | Left wing tank capacity % |
| **Right Main Tank Level** | `0x0B94` | 4 | `u32` | `/ (128 * 65536) * 100` | % | Right wing tank capacity % |
| **Gross Weight** | `0x30C0` | 8 | `f64` | Pounds (lbs) | lbs | Total aircraft weight (Fuel+Payload+OEW)|
| **Zero Fuel Weight (ZFW)** | `0x3BFC` | 4 | `u32` | Pounds (lbs) | lbs | Operating weight without fuel |

### I. Atmosphere, Weather & Environment

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **Ambient Temperature (OAT)**| `0x0E8C` | 2 | `i16` | `/ 256.0` | °C | Static outside air temperature |
| **Total Air Temp (TAT)** | `0x11D0` | 2 | `i16` | `/ 256.0` | °C | Ram air temperature with friction |
| **Wind Speed** | `0x0E90` | 2 | `u16` | Value | kt | Ambient wind velocity |
| **Wind Direction** | `0x0E92` | 2 | `u16` | `* 360.0 / 65536.0` | deg | Meteorological wind direction |
| **Surface Visibility** | `0x0E8A` | 2 | `u16` | `* 100` / meters | m / NM | Atmospheric visibility range |

### J. Simulator Lifecycle, Time & Tracking

| Parameter | Offset | Bytes | Type | Scale / Conversion | Units | Description |
|:---|:---:|:---:|:---:|:---|:---:|:---|
| **Zulu Time (UTC Hours)** | `0x0238` | 1 | `u8` | `0`–`23` | Hours | Universal coordinated time |
| **Zulu Time (UTC Minutes)** | `0x0239` | 1 | `u8` | `0`–`59` | Minutes | Universal coordinated time |
| **Zulu Time (UTC Seconds)** | `0x023A` | 1 | `u8` | `0`–`59` | Seconds | Universal coordinated time |
| **Local Time (Hours)** | `0x0246` | 1 | `u8` | `0`–`23` | Hours | Flight local time zone hour |
| **Simulation Rate** | `0x0C1A` | 2 | `u16` | `/ 256.0` | Multiplier | Sim acceleration factor (1x, 2x, 4x...) |
| **Simulator Pause State** | `0x0262` | 2 | `u16` | `!= 0` = Paused | Bool | Simulation active freeze / pause |

---

## 3. Precision Conversion Reference Formulas

When interacting with FSUIPC binary structures, the following mathematical conversions are strictly required:

```rust
// 1. High-precision 64-bit Latitude
pub fn parse_latitude(raw: i64) -> f64 {
    raw as f64 * 90.0 / (10001750.0 * 65536.0 * 65536.0)
}

// 2. High-precision 64-bit Longitude
pub fn parse_longitude(raw: i64) -> f64 {
    raw as f64 * 360.0 / (65536.0 * 65536.0 * 65536.0 * 65536.0)
}

// 3. 32-bit Heading (Magnetic / True)
pub fn parse_heading(raw: u32) -> f64 {
    raw as f64 * 360.0 / (65536.0 * 65536.0)
}

// 4. 16-bit VOR Radial (001° - 360° from Station)
pub fn parse_radial(raw: u16) -> f64 {
    (raw as f64 * 360.0 / 65536.0 + 360.0) % 360.0
}

// 5. 16-bit Relative Bearing (±180° to Station)
pub fn parse_relative_bearing(raw: i16) -> f64 {
    raw as f64 * 360.0 / 65536.0
}

// 6. Indicated & True Airspeed
pub fn parse_airspeed(raw: i32) -> f64 {
    raw as f64 / 128.0
}

// 7. Ground Speed
pub fn parse_ground_speed(raw: i32) -> f64 {
    raw as f64 / 65536.0 * 3600.0 / 1852.0
}

// 8. Vertical Speed (Feet per minute)
pub fn parse_vertical_speed(raw: i32) -> f64 {
    raw as f64 * 60.0 * 3.28084 / 256.0
}
```
