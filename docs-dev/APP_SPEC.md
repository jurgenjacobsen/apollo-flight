# Product Specification & Architecture Document: Apollo Flight (MSFS Companion & IFR Trainer)

## 1. System Overview
**Apollo Flight** (from the Apollo flight application suite) is an offline-first desktop application designed for Microsoft Flight Simulator 2020 & 2024. It interfaces with the simulator via **FSUIPC7**, logs high-fidelity flight telemetry into an embedded SQLite database architecture (`logbook.db` and `navdata.db`), renders flights and visited destinations on interactive high-resolution satellite maps (ArcGIS World Imagery), provides deep touchdown analysis with oleo-pneumatic G-force load factor physics and crosswind/sideslip decomposition, features a realistic procedural Route & Multi-Sector Dispatch Generator with terrain-aware minimum safe altitude (MSA) clamping, offers an interactive IFR Navigation and Holding Pattern procedural trainer, serves an Electronic Flight Bag (EFB) companion web application over local Wi-Fi, provides an aircraft checklists flow engine, indexes flight briefings and SOP documentation (Markdown & PDF), and includes a gamified Pilot Profile with fleet statistics and achievement badges.

---

## 2. Tech Stack & Architecture

### Backend & Middleware (Rust / Tauri v2)
- **Framework:** Tauri v2 (Rust-backed desktop runtime).
- **IPC / Sim Bridge:** FSUIPC7 via Windows Message/Shared Memory IPC (`fsuipc` crate v0.5.1).
- **Database Architecture:** Partitioned SQLite database via `rusqlite` with Write-Ahead Logging (`PRAGMA journal_mode = WAL`):
  - `logbook.db`: Stores flights, telemetry points, visited stats, saved routes, user settings, document metadata, and schema migrations.
  - `navdata.db`: Stores OurAirports global navigation data (86,000+ aerodromes, runways, dimensions, lighting, and surfaces).
  - *Automated Partitioning:* Automatically migrates and splits legacy single-file `aerotrack.db` into `logbook.db` and `navdata.db` upon launch.
- **Embedded EFB Web Server:** Lightweight asynchronous HTTP & WebSocket server built with `tokio` and `axum`, running on a configurable dynamic port (default 24820; random range 24000–29999).
- **Async Runtime:** `tokio` for background FSUIPC polling, EFB WebSocket broadcasting, and non-blocking database operations.
- **Serialization:** `serde`, `serde_json` for crossing the Tauri IPC bridge.
- **Native OS Dialogs:** Native Explorer save dialogs for multi-format flight track exports (GPX, KML, GeoJSON, CSV).
- **Backward Compatibility:** All system updates accommodate older app versions and databases via non-destructive migrations (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN`), graceful payload degradation, and automated legacy data backfills.

### Frontend (Desktop UI)
- **Framework:** React 19 + TypeScript + Vite.
- **Styling:** Tailwind CSS + custom accessible UI components (`Select`, `Checkbox`, `Tooltip`, collapsible accordions) following Vercel Geist design system guidelines.
- **Mapping:** Leaflet (`react-leaflet`) with **ArcGIS World Imagery** satellite tiles (`https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`), GeoJSON vector boundaries, altitude-gradient polyline tracks, and custom plane markers.
- **Charts:** Recharts for flight profiles (Altitude MSL and Ground Speed vs Time) with crosshair scrubbing.
- **Canvas / Vector Rendering:** HTML5 Canvas for real-time instrument, Navaid (NAV1, NAV2, ADF), and Holding Pattern procedural visualizations.
- **State Management:** Zustand with persistence (`zustand/middleware`). Full telemetry coordinate trajectories are loaded lazily on demand from SQLite via `get_flight_details` to optimize logbook and startup performance.

---

## 3. Data Ingestion & FSUIPC Telemetry Bridge

### Adaptive Dynamic Telemetry Polling Engine
To balance storage efficiency at high altitudes with maximum fidelity during takeoff and landing flare, Apollo Flight employs an adaptive dynamic polling algorithm in Rust (`src-tauri/src/fsuipc.rs`):
- **High-Altitude Cruise (> 10,000 ft MSL):** 1000ms (1 Hz) sleep interval. High-altitude enroute flight requires minimal sample density.
- **Intermediate Flight (Airborne, 1,000 ft to 10,000 ft MSL):** 500ms (2 Hz) sleep interval for climb, descent, and initial approach.
- **Final Approach & Flare (Airborne, < 1,000 ft AGL):** Graduated linear interpolation scaling from 500ms at 1,000 ft AGL down to **20ms (50 Hz)** at touchdown:
  $$\text{Interval (ms)} = 20 + \left(\frac{\text{clamp}(\text{AGL}, 0, 1000)}{1000}\right) \times (500 - 20)$$
  This captures exact wheel touchdown timing, pitch/bank attitude, lateral drift, and instantaneous vertical sink rates.
- **On Ground:**
  - Parked / slow taxiing ($< 10\text{ kt}$): 1000ms (1 Hz).
  - High-speed takeoff run or touchdown rollout ($\ge 10\text{ kt}$): 100ms (10 Hz).
- **Batch Telemetry Flusher:** Buffers telemetry points in memory and commits batches to SQLite every 5 seconds (or ~20 points), preventing disk I/O bottlenecks.

### Core FSUIPC Offsets Extracted
| Parameter | Offset | Size | Type | Scaling / Unit Conversion |
| :--- | :--- | :--- | :--- | :--- |
| **Sim Connected / Ready** | `0x3364` | 1 Byte | Byte | Bitfield check |
| **In-Menu Flag** | `0x3365` | 1 Byte | Byte | `0` = In Sim, `1` = Main Menu |
| **Flight Reset / Load Count** | `0x3F02` | 2 Bytes | UInt16 | Monotonically increments when flight reloads |
| **Latitude** | `0x0560` | 8 Bytes | Int64 | `Value * (90.0 / (10001750.0 * 65536.0 * 65536.0))` |
| **Longitude** | `0x0568` | 8 Bytes | Int64 | `Value * (360.0 / (65536.0 * 65536.0 * 65536.0 * 65536.0))` |
| **Altitude (MSL)** | `0x0570` | 8 Bytes | Int64 | `(Value / (65536.0 * 65536.0)) * 3.28084` (ft) |
| **Altitude (Radio / AGL)** | `0x31E4` | 4 Bytes | Int32 | `Value / 65536.0` (ft) |
| **Indicated Airspeed (IAS)** | `0x02BC` | 4 Bytes | Int32 | `Value / 128.0` (knots) |
| **True Airspeed (TAS)** | `0x02B8` | 4 Bytes | Int32 | `Value / 128.0` (knots) |
| **Ground Speed (GS)** | `0x02B4` | 4 Bytes | Int32 | `(Value * 3600.0) / (65536.0 * 1852.0)` (knots) |
| **Vertical Speed** | `0x02C8` | 4 Bytes | Int32 | `Value * 60 * 3.28084 / 256.0` (ft/min) |
| **Pitch** | `0x0578` | 4 Bytes | Int32 | `Value * 360.0 / (65536.0 * 65536.0)` (deg) |
| **Bank / Roll** | `0x057C` | 4 Bytes | Int32 | `Value * 360.0 / (65536.0 * 65536.0)` (deg) |
| **Magnetic Heading** | `0x0580` | 4 Bytes | UInt32 | `Value * 360.0 / (65536.0 * 65536.0)` (deg) |
| **On Ground Flag (WOW)** | `0x0366` | 2 Bytes | UInt16 | `1` = On Ground, `0` = In Flight |
| **Engine 1 Combustion** | `0x0894` | 2 Bytes | Int16 | `1` = Combustion active |
| **Engine 2 Combustion** | `0x092C` | 2 Bytes | Int16 | `1` = Combustion active |
| **Outside Air Temp (OAT)** | `0x0E8C` | 2 Bytes | Int16 | `Value / 256.0` (°C) |
| **Total Air Temp (TAT)** | `0x11D0` | 2 Bytes | Int16 | `Value / 256.0` (°C) |
| **Ambient Wind Speed** | `0x0E90` | 2 Bytes | UInt16 | Knots |
| **Ambient Wind Direction** | `0x0E92` | 2 Bytes | UInt16 | `Value * 360.0 / 65536.0` (deg) |
| **Atmospheric Visibility** | `0x0E8A` | 2 Bytes | UInt16 | `Value / 100.0` (Statute Miles) |
| **Aircraft Gross Weight** | `0x30C0` | 4 Bytes | UInt32 | Pounds (lbs) |
| **Normal G-Force** | `0x11BA` | 2 Bytes | Int16 | `Value / 625.0` (G) |
| **Touchdown Sink Rate** | `0x030C` | 4 Bytes | Int32 | `Value * 60.0 * 3.28084 / 256.0` (ft/min) |
| **Body Velocity X (Lateral)**| `0x31D0`| 8 Bytes | Float64| ft/sec (used for sideslip / drift angle) |
| **Body Velocity Z (Long)** | `0x31E0` | 8 Bytes | Float64| ft/sec |
| **NAV 1 OBS Selected** | `0x0C4E` | 2 Bytes | UInt16 | Selected OBS course degrees (0–359°) |
| **NAV 1 Radial** | `0x0C50` | 2 Bytes | UInt16 | Magnetic radial from station: `Value * 360.0 / 65536.0` |
| **NAV 1 Relative Bearing** | `0x0C56` | 2 Bytes | Int16 | Relative degrees to station: `Value * 360.0 / 65536.0` |
| **NAV 1 DME Distance** | `0x0300` | 2 Bytes | UInt16 | BCD or integer / 10 (NM) |
| **NAV 1 DME Speed** | `0x0302` | 2 Bytes | UInt16 | BCD knots |
| **NAV 2 OBS Selected** | `0x0C5E` | 2 Bytes | UInt16 | Selected OBS course degrees (0–359°) |
| **NAV 2 Radial** | `0x0C60` | 2 Bytes | UInt16 | Magnetic radial from station: `Value * 360.0 / 65536.0` |
| **NAV 2 Relative Bearing** | `0x0C62` | 2 Bytes | Int16 | Relative degrees to station: `Value * 360.0 / 65536.0` |
| **NAV 2 DME Distance** | `0x0306` | 2 Bytes | UInt16 | BCD or integer / 10 (NM) |
| **NAV 2 DME Speed** | `0x0308` | 2 Bytes | UInt16 | BCD knots |
| **ADF 1 Relative Bearing** | `0x02C0` | 2 Bytes | Int16 | Relative degrees to station: `Value * 360.0 / 65536.0` |
| **Aircraft Title / Model** | `0x3D00` | 256 Bytes| String | Null-terminated ASCII string |

---

## 4. Database Schema & Tauri IPC Architecture

### 1. Navdata Database (`navdata.db`)
Pre-populated with global OurAirports data and updated via automated or on-demand synchronization:
```sql
CREATE TABLE IF NOT EXISTS airports (
    icao TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    elevation_ft INTEGER,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    municipality TEXT,
    airport_type TEXT DEFAULT 'medium_airport',
    continent TEXT DEFAULT 'EU',
    max_runway_length_ft INTEGER,
    max_paved_runway_length_ft INTEGER,
    max_unpaved_runway_length_ft INTEGER,
    has_paved BOOLEAN DEFAULT 1,
    has_unpaved BOOLEAN DEFAULT 0,
    all_runways_closed BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS runways (
    id INTEGER PRIMARY KEY,
    airport_ident TEXT NOT NULL,
    length_ft INTEGER,
    width_ft INTEGER,
    surface TEXT,
    is_paved BOOLEAN NOT NULL DEFAULT 1,
    is_unpaved BOOLEAN NOT NULL DEFAULT 0,
    lighted BOOLEAN NOT NULL DEFAULT 0,
    closed BOOLEAN NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_airports_coords ON airports(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_airports_type ON airports(airport_type);
CREATE INDEX IF NOT EXISTS idx_airports_continent ON airports(continent);
CREATE INDEX IF NOT EXISTS idx_runways_ident ON runways(airport_ident);
```

### 2. Logbook Database (`logbook.db`)
Personal user data, flight telemetry, routes, and application configuration:
```sql
CREATE TABLE IF NOT EXISTS flights (
    id TEXT PRIMARY KEY,                       -- UUID v4
    aircraft_type TEXT NOT NULL,
    departure_icao TEXT,
    arrival_icao TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    flight_time_seconds INTEGER DEFAULT 0,
    max_altitude INTEGER DEFAULT 0,
    max_ground_speed INTEGER DEFAULT 0,
    distance_flown_nm REAL DEFAULT 0.0,
    landing_rate_fpm REAL,
    status TEXT CHECK(status IN ('RECORDING', 'COMPLETED', 'DISCARDED')) DEFAULT 'RECORDING',
    min_oat REAL,
    max_oat REAL,
    min_visibility REAL,
    avg_cruise_wind_speed REAL,
    avg_cruise_wind_direction REAL,
    max_wind_speed REAL,
    max_wind_direction REAL,
    total_weight REAL
);

CREATE TABLE IF NOT EXISTS flight_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude_msl REAL NOT NULL,
    altitude_agl REAL,
    indicated_airspeed REAL NOT NULL,
    ground_speed REAL NOT NULL,
    heading REAL NOT NULL,
    pitch REAL,
    bank REAL,
    vertical_speed REAL,
    is_on_ground BOOLEAN NOT NULL,
    wind_speed REAL,
    wind_direction REAL,
    oat REAL,
    tat REAL,
    visibility REAL,
    FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visited_airports (
    icao TEXT PRIMARY KEY,
    name TEXT,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    first_visited TEXT NOT NULL,
    last_visited TEXT NOT NULL,
    visit_count INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS visited_countries (
    iso_a2 TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    first_visited TEXT NOT NULL,
    last_visited TEXT NOT NULL,
    flight_count INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS saved_routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    aircraft_name TEXT NOT NULL,
    aircraft_category TEXT NOT NULL,
    departure_icao TEXT NOT NULL,
    arrival_icao TEXT NOT NULL,
    sector_count INTEGER NOT NULL,
    total_distance_nm REAL NOT NULL,
    total_airborne_minutes INTEGER NOT NULL,
    total_duration_minutes INTEGER NOT NULL,
    total_ground_minutes INTEGER DEFAULT 0,
    include_ground_time BOOLEAN NOT NULL DEFAULT 1,
    is_round_trip BOOLEAN NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',       -- 'draft' | 'flown'
    is_favorite BOOLEAN NOT NULL DEFAULT 0,
    sectors_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    flown_at TEXT,
    linked_flight_id TEXT,
    FOREIGN KEY (linked_flight_id) REFERENCES flights(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_metadata (
    file_path TEXT PRIMARY KEY,
    title TEXT,
    last_seen TEXT,
    tags TEXT
);

CREATE INDEX IF NOT EXISTS idx_telemetry_flight_id ON flight_telemetry(flight_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON flight_telemetry(timestamp);
CREATE INDEX IF NOT EXISTS idx_saved_routes_status ON saved_routes(status);
CREATE INDEX IF NOT EXISTS idx_saved_routes_favorite ON saved_routes(is_favorite);
```

### Tauri IPC Commands Interface
Registered in `src-tauri/src/lib.rs` and consumed via `safeInvoke`:
* `get_connection_status() -> bool`: Returns active FSUIPC connection state.
* `start_polling() -> Result<String, String>`: Manually activates or resumes telemetry polling.
* `stop_polling() -> Result<String, String>`: Pauses FSUIPC background worker.
* `get_close_to_tray() -> bool`: Returns current tray minimize preference.
* `set_close_to_tray(enabled: bool) -> Result<(), String>`: Persists tray preference to SQLite.
* `get_user_setting(key: String) -> Result<Option<String>, String>`: Fetches user setting from `user_settings`.
* `set_user_setting(key: String, value: String) -> Result<(), String>`: Persists setting key-value pair.
* `get_all_user_settings() -> Result<HashMap<String, String>, String>`: Hydrates client settings on launch.
* `get_flights() -> Result<Vec<FlightRecord>, String>`: Fetches flight summary headers ordered by `start_time DESC`.
* `get_flight_details(flight_id: String) -> Result<FlightDetails, String>`: Lazily fetches a flight with full `flight_telemetry` coordinates, environmental summaries, and touchdown events.
* `delete_flight(flight_id: String) -> Result<(), String>`: Permanently deletes flight or moves to trash.
* `export_flight(flight_id: String, format: String) -> Result<String, String>`: Prompts native file save dialog and exports GPX, KML, GeoJSON, or CSV track.
* `export_logbook(format: String) -> Result<String, String>`: Exports logbook summaries without telemetry.
* `search_airports_near(lat: f64, lon: f64, radius_nm: f64) -> Result<Option<Airport>, String>`: Proximity detection within `radius_nm` (default 3.0 NM).
* `get_visited_stats() -> Result<VisitedStats, String>`: Returns aggregated aerodrome and sovereign country stats.
* `get_airports_count() -> Result<i64, String>`: Total count of indexed aerodromes.
* `sync_ourairports() -> Result<OurAirportsSyncResult, String>`: In-process asynchronous download and indexing of OurAirports database with live progress notifications.
* `save_document_metadata(file_path: String, title: Option<String>, tags: Vec<String>) -> Result<(), String>`: Persists custom documentation titles and tags.

---

## 5. Functional Modules & UI Specifications

### Module 1: Flight Tracking, Touchdown Analysis & Flight Logbook

#### 1. Discrete 7-Stage Flight Lifecycle State Machine
1. `BOARDING`: Sim connected, aircraft stationary on ground, engines off or starting.
2. `TAXI_OUT`: On ground, ground speed between 3 kts and 35 kts.
3. `TAKEOFF_CLIMB`: `is_on_ground` transitions `1 -> 0` with IAS > 45 kts.
   - Triggers `flights` record insertion (`status: 'RECORDING'`).
   - Resolves Origin ICAO from nearest airport threshold within 3 NM.
4. `ENROUTE_CRUISE`: Airborne, vertical speed within ±150 fpm for > 60 seconds at cruise altitude.
5. `DESCENT_APPROACH`: Sustained negative vertical speed (< -300 fpm) descending toward destination.
6. `TOUCHDOWN_ROLLOUT`: `is_on_ground` transitions `0 -> 1`.
   - Fires real-time `TouchdownFlyoutBanner` with instantaneous metrics.
   - Captures vertical sink rate, ground speed, pitch, bank, G-force, wind vectors, and sideslip drift.
   - Debounces micro-gear bounces (4-second threshold) while supporting multi-touchdown flights (touch-and-goes).
7. `ARRIVED`: Aircraft stationary (< 2.0 kts) for > 30 seconds AND one or more engines shut down.
   - If stopped at an intermediate airport of a saved multi-sector route, prompts user with continuation safeguard before finalizing.
   - Resolves Destination ICAO, marks `status: 'COMPLETED'`, and updates visited records.

#### 2. Touchdown Analysis & Physics Model
- **Instantaneous Banner (`TouchdownFlyoutBanner.tsx`):**
  - Displays grade badge (**Butter** $\le 120\text{ fpm}$, **Smooth** $120\text{–}180\text{ fpm}$, **Firm** $180\text{–}300\text{ fpm}$, **Hard** $> 300\text{ fpm}$).
  - Shows vertical sink rate, calculated G-force load factor, IAS/GS, headwind/tailwind & crosswind components, and sideslip drift angle.
  - Auto-dismisses after 12 seconds with manual close button.
- **Oleo-Pneumatic G-Force Normal Load Factor Model:**
  $$v_{fps} = \frac{|V_{vertical}|}{60}, \quad a_z = \frac{v_{fps}^2}{2 \cdot s \cdot \eta}, \quad G_z = 1.0 + \frac{a_z}{g}$$
  ($s = 1.125\text{ ft}$ nominal stroke, $\eta = 0.78$ efficiency factor, $g = 32.174\text{ ft/s}^2$).

#### 3. Logbook & Debrief Visualizer
- **Logbook View:** Filterable table with dynamic KPI totals (block hours, nautical miles, average landing rate), pagination (25, 50, 100), and multi-format track exports.
- **Flight Detail View:**
  - High-resolution Leaflet map rendered with **ArcGIS World Imagery** satellite tiles.
  - 250 ft quantized continuous altitude gradient trajectory (`0 ft` Green $\rightarrow$ `45,000+ ft` Red).
  - Top of Climb (TOC), Top of Descent (TOD), and Touchdown waypoint markers.
  - Synchronized Recharts altitude/speed telemetry profile chart with interactive map cursor scrubbing.
  - **Atmospheric & Environmental Totals Cards:** OAT Range (Min/Max), Lowest Visibility, Average Cruise Wind, and Peak Wind Encountered.
  - **Recycle Bin:** Deleted flights are held in a 30-day trash bin with restoration and countdown warning chips before permanent purge.

#### 4. Measurement Units Customization
Configurable via Settings and respected throughout the application:
- **Aircraft Weight:** Pounds (`lbs`) or Kilograms (`kg`).
- **Visibility:** Statute Miles (`sm`, e.g. `10+ SM`) or Metric (`metric`, e.g. `1,500 m`, `10.0 km`).
- **Wind Speed:** Knots (`kt`) or Meters per second (`mps`, e.g. `7.2 m/s`).
- **Temperature:** Celsius (`°C`) or Fahrenheit (`°F`).

---

### Module 2: Pilot Profile & Visited Destinations (`ProfileView.tsx`)
A unified pilot career dashboard organized into 4 primary sub-tabs:

1. **Badges & Achievements:**
   - Gamified milestone system evaluated dynamically against flight history via `src/data/badges.ts`.
   - Badges across categories: First Flights, Landings (Butter Landings, Extreme Crosswinds), World Traveler, Endurance, and High Altitude.
   - Visual progress bars, unlock timestamps, and lock status.
2. **Career Flight Statistics:**
   - Total Nautical Miles Flown, Total Airborne Flight Time, Total Block Time, Total Completed Operations.
   - Lifetime Average Touchdown Sink Rate, Total Unique Aerodromes, Total Sovereign Nations Visited.
3. **Pilot Fleet:**
   - Exhaustive breakdown of all aircraft models flown.
   - Per-airframe metrics: Total operations, airborne hours, percentage of total flight time, and average touchdown rate per aircraft type.
4. **Visited Destinations Map Projection:**
   - Interactive GeoJSON choropleth world map highlighting visited sovereign territories with visit frequency heatmaps.
   - Continental breakdown progress chips and aerodrome pins with arrival/departure counts.

---

### Module 3: IFR Training Center
- **VOR / NDB Interception Trainer:**
  - Ingests live NAV1, NAV2, or ADF telemetry from MSFS (OBS course, radial, relative bearing, DME distance).
  - HTML5 Canvas 360° compass rose with rotating OBS needle, CDI deflection, and TO/FROM flags.
  - Procedural challenge generator with recommended 30°–45° intercept headings and capture scoring within ±2°.
  - Dual modes: **Live MSFS Sync** and **Interactive Practice Scenario**.
- **Holding Pattern Procedural Trainer:**
  - Computes FAA / ICAO standard entry sectors (Direct 180°, Teardrop 70°, Parallel 110°).
  - Canvas top-down racetrack visualizer with leg timing, wind drift compensation, and live aircraft track following.

---

### Module 4: Procedural Route & Multi-Sector Generator

1. **ICAO Aircraft Performance Categories:**
   - Cat A (Light GA / Trainer, 110 kt TAS, FL045).
   - Cat B (High-Perf Single / Light Twin, 165 kt TAS, FL095).
   - Cat C (Turboprop / Light Jet, 280 kt TAS, FL240).
   - Cat D (Regional / Medium Jet, 440 kt TAS, FL330).
   - Cat E (Long Haul Widebody, 480 kt TAS, FL370).
   - Cat F (Heavy / Super, 490 kt TAS, FL370).
2. **Multi-Sector Engine & Corridor Routing:**
   - 1 to 6 sectors with ground turnaround times. Limitation modes: Total Flight vs Per-Sector (Duration or Distance).
   - Destination-locked backwards generation and corridor Great Circle waypoint guidance.
   - **Terrain-Aware Minimum Safe Altitude (MSA / Grid MORA):** 10 NM cross-track buffer queries major worldwide topographic massifs; clamps cruising levels to guarantee 1,000 ft clearance in flat terrain and 2,000 ft in mountainous terrain ($\ge 3,000\text{ ft}$ relief).
3. **Saved Routes Management (`SavedRoutesView.tsx`):**
   - Filterable tabs: All, Favorites, Drafts, and Flown.
   - Manual route entry, sector editing, and one-click flight dispatching when positioned within 25 NM of origin.

---

### Module 5: Electronic Flight Bag (EFB) Companion
Embedded local Wi-Fi companion served by the Rust Axum web server:
- **Device Pairing:** Desktop EFB view displays LAN IP, dynamic URL, and high-contrast QR code for instant tablet connection.
- **Mobile Responsive HUD (`EfbHudView.tsx`):**
  - Live ArcGIS satellite moving map with aircraft marker, heading rotation, and track trail.
  - Real-time KPI ribbons: Speed (IAS/TAS/GS), Altitude (MSL/AGL), Heading, Vertical Speed, Wind & Crosswind, and Atmosphere (OAT & Visibility formatted to user preferences).
  - Screen Wake Lock API integration to prevent tablet screen sleep.
- **OFP Tracker & Clearances Scratchpad:** Synchronized flight plan legs, ATC clearance scratchpad (Squawk, Altimeter, Runway, Heading, Altitude), and interactive flow checklists.

---

### Module 6: Aircraft Checklists Engine (`ChecklistsView.tsx`)
- Standard Operating Procedures (SOP) flow cards with collapsible procedure categories (Normal, Emergency, Abnormal).
- Dynamic aircraft title association: Automatically detects active MSFS aircraft title and highlights or floats matching checklists to the top.
- Full custom checklist creation, editing, and JSON import/export routines.

---

### Module 7: Documentation & Briefings Reader (`DocumentationView.tsx`)
- Dual-format viewing engine supporting Markdown (`.md`) and Portable Document Format (`.pdf`).
- Pre-configured folders: Bundled app documentation (`/docs`) and user documents directory (`%APPDATA%/user-docs`).
- Custom directory indexing with live filesystem change watcher (`notify`).
- Document metadata customization: Inline title renaming and multi-tag filtering saved to `document_metadata`.

---

### Module 8: Settings & Preferences (`SettingsView.tsx` - Rework V3)
Redesigned with a master-detail sub-sidebar navigation deck and dedicated section pages:
1. **General & Units:** Close to system tray toggle, dark/light theme, and measurement unit selectors (Weight: lbs/kg, Visibility: SM/m-km, Wind Speed: kt/mps, Temperature: °C/°F).
2. **Recording Rules:** Auto-start recording triggers, detailed telemetry toggle, and flight stop rollout safeguards.
3. **Datasets & Airports:** Global aerodromes database status, runway dimensions cache, and in-app OurAirports live synchronization.
4. **EFB Companion:** Server mode (Off / On / Auto), dynamic listening port with randomizer, LAN URL, and QR code pairing drawer.
5. **Documentation:** Custom indexed directories list, folder picker dialog, manual directory entry, and live file watching switch.
6. **Backup & Export:** Logbook page size selector (25, 50, 100, 250), full/partial Apollo JSON bundle export, JSON import modal, and Recycle Bin quick-access.
7. **About & Runtime:** Core application version, FSUIPC7 bridge connection diagnostics, integrated software update checker and installer, and MIT open-source license.

---

### Module 9: Cockpit Overview & Quick-Controls (`Overview.tsx`)
- Satellite moving map powered by ArcGIS World Imagery with live aircraft position, heading vector, and follow-plane toggle.
- Interactive airport layer: Clickable aerodrome dots displaying runway dimensions, surface types, elevation, and live aviation weather (METAR and TAF fetched in real-time from `aviationweather.gov`).
- Quick flight controls: Manual flight recording start/stop and FSUIPC status indicator pill.

---

## 6. Implementation Roadmap & Status

### Completed Phases
- [x] **Phase 1:** Tauri v2 workspace, FSUIPC7 background polling worker, auto-reconnect engine.
- [x] **Phase 2:** SQLite persistence, batch flusher, 7-stage flight state machine, debounced touchdown detection.
- [x] **Phase 3:** Logbook table, dynamic KPIs, flight debrief visualizer, continuous altitude gradient tracks, GPX/KML/GeoJSON/CSV exports.
- [x] **Phase 4:** Visited destinations choropleth world map and country statistics.
- [x] **Phase 5:** IFR Interception & Holding Pattern trainer with live MSFS sync and scenario modes.
- [x] **Phase 6:** Procedural Route & Multi-Sector dispatch generator with 6 ICAO performance categories and Great Circle math.
- [x] **Phase 7:** Corridor terrain-aware MSA / Grid MORA clamping and polygon/radius airfield search.
- [x] **Phase 8:** Saved Routes system (Draft / Flown / Favorite), multi-sector editing, and manual flight creation.
- [x] **Phase 9:** Self-contained OurAirports live update synchronization and crash diagnostic logging.
- [x] **Phase 10:** Saved flight pagination, route sector drawer inspector, and airport proximity detection.
- [x] **Phase 11:** Apollo backup and restore bundles (JSON), segmented export/import, and 30-day Recycle Bin.
- [x] **Phase 12:** Detailed environmental telemetry recording (wind vectors, OAT/TAT, visibility, cruise wind averaging).
- [x] **Phase 13:** EFB WiFi Companion (Axum HTTP/WebSocket server, QR pairing, live HUD, tablet moving map).
- [x] **Phase 14:** Cockpit Overview dashboard (`Overview.tsx`) with live METAR/TAF weather integration.
- [x] **Phase 15:** Aircraft Checklists SOP flow cards (`ChecklistsView.tsx`) with active aircraft matching.
- [x] **Phase 16:** Documentation reader (`DocumentationView.tsx`) for Markdown and PDF with live folder indexing.
- [x] **Phase 17:** Pilot Profile (`ProfileView.tsx`) with gamified badge achievement engine, flight statistics, pilot fleet analysis, and visited maps.
- [x] **Phase 18:** Map provider switch to ArcGIS World Imagery satellite tiles across all application maps.
- [x] **Phase 19:** Gees landing analysis inspection, real-time `TouchdownFlyoutBanner`, and adaptive dynamic telemetry polling (1 Hz cruise down to 50 Hz on touchdown flare).
- [x] **Phase 20:** Atmospheric & environmental weather unit preferences (Visibility: SM vs metric; Wind Speed: kt vs m/s; Temperature: °C vs °F; Weight: lbs vs kg).
- [x] **Phase 21:** Settings UI Rework V3 (master-detail sub-sidebar navigation deck with dedicated section tabs).

### Future Roadmap
- [ ] **Phase 22: Testing Unit & Error Management:** Standalone simulated FSUIPC test harness for offline development and end-to-end integration testing.
- [ ] **Phase 23: Pilot Onboarding & First-Run Walkthrough:** Interactive introductory tour for first-time application configuration.
- [ ] **Phase 99: Eventual Long-Term Architecture:**
  - [ ] Rust trait-based abstract repository layer (`FlightRepository`).
  - [ ] Voice Recognition for Checklists (Virtual Co-Pilot via local Web Speech / whisper.cpp – see [VOICE_CHECKLISTS_SPEC.md](VOICE_CHECKLISTS_SPEC.md)).
  - [ ] Optional cloud sync alignment (PostgreSQL / Supabase) for multi-workstation pilot profiles.
