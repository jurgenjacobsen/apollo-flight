# Product Specification & Architecture Document: Apollo Flight (MSFS Companion & IFR Trainer)

## 1. System Overview
**Apollo Flight** (from the Apollo flight application suite) is an offline-first desktop application designed for Microsoft Flight Simulator 2020 & 2024. It interfaces with the simulator via **FSUIPC7**, logs flight telemetry into an embedded local SQLite database (`aerotrack.db`), renders past flights and visited destinations on an interactive map, features a realistic procedural Route & Multi-Sector Dispatch Generator, provides multi-touchdown analysis with oleo-pneumatic G-force load factor physics, and includes an interactive IFR Navigation and Holding Pattern procedural trainer.

---

## 2. Tech Stack & Architecture

### Backend & Middleware (Rust / Tauri v2)
- **Framework:** Tauri v2 (Rust-backed desktop runtime)
- **IPC / Sim Bridge:** FSUIPC7 via Windows Message/Shared Memory IPC (`fsuipc` crate v0.5.1).
- **Database:** SQLite via `rusqlite` (embedded, file-based: `aerotrack.db`).
- **Async Runtime:** `tokio` for background FSUIPC polling and non-blocking database flushing.
- **Serialization:** `serde`, `serde_json` for crossing the Tauri IPC bridge.
- **Native OS Dialogs:** Native Explorer save dialogs for multi-format flight track exports.

### Frontend (Desktop UI)
- **Framework:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS + custom accessible UI components (`Select`, collapsible accordions) following Vercel Geist design system guidelines.
- **Mapping:** Leaflet (`react-leaflet`) with GeoJSON vector boundaries, altitude-gradient polyline tracks, and dark/light tile layers.
- **Charts:** Recharts for flight profiles (Altitude/Speed vs Time) with crosshair scrubbing.
- **Canvas / Vector Rendering:** HTML5 Canvas for real-time instrument, Navaid (NAV1, NAV2, ADF), and Holding Pattern procedural visualizations.
- **State Management:** Zustand for live telemetry, route generation, and UI states. Full telemetry coordinate trajectories are loaded lazily on demand from SQLite via `get_flight_details` to optimize logbook performance.

---

## 3. Data Ingestion & FSUIPC Telemetry Bridge

### Polling Engine
- Background thread running a dedicated loop at **1 Hz (cruising/stationary on-ground)** and **4 Hz (takeoff/approach/climb/descent/active flight)**.
- Telemetry buffer writes to the active SQLite flight record in batches (every 5 seconds or ~20 points) to eliminate disk I/O bottlenecks and protect UI responsiveness.

### Core FSUIPC Offsets Extracted
| Parameter | Offset | Size | Type | Scaling / Unit Conversion |
| :--- | :--- | :--- | :--- | :--- |
| **Sim Connected / Ready** | `0x3364` | 1 Byte | Byte | Bitfield check |
| **Latitude** | `0x0560` | 8 Bytes | Int64 | `Value * (90.0 / (10001750.0 * 65536.0 * 65536.0))` |
| **Longitude** | `0x0568` | 8 Bytes | Int64 | `Value * (360.0 / (65536.0 * 65536.0 * 65536.0 * 65536.0))` |
| **Altitude (MSL)** | `0x0570` | 8 Bytes | Int64 | `(Value / (65536.0 * 65536.0)) * 3.28084` (ft) |
| **Altitude (Radio / AGL)** | `0x31E4` | 4 Bytes | Int32 | `Value / 65536` (ft) |
| **Indicated Airspeed (IAS)** | `0x02BC` | 4 Bytes | Int32 | `Value / 128.0` (knots) |
| **True Airspeed (TAS)** | `0x02B8` | 4 Bytes | Int32 | `Value / 128.0` (knots) |
| **Ground Speed (GS)** | `0x02B4` | 4 Bytes | Int32 | `(Value * 3600.0) / (65536.0 * 1852.0)` (knots) |
| **Vertical Speed** | `0x02C8` | 4 Bytes | Int32 | `Value * 60 * 3.28084 / 256` (ft/min) |
| **Pitch** | `0x0578` | 4 Bytes | Int32 | `Value * 360.0 / (65536.0 * 65536.0)` (deg) |
| **Bank / Roll** | `0x057C` | 4 Bytes | Int32 | `Value * 360.0 / (65536.0 * 65536.0)` (deg) |
| **Magnetic Heading** | `0x0580` | 4 Bytes | UInt32 | `Value * 360.0 / (65536.0 * 65536.0)` (deg) |
| **Aircraft Title / Model** | `0x3D00` | 256 Bytes| String | Null-terminated ASCII string |
| **On Ground Flag (WOW)** | `0x0366` | 2 Bytes | UInt16 | `1` = On Ground, `0` = In Flight |
| **NAV 1 Radial / OBS** | `0x0C4E` | 2 Bytes | UInt16 | Magnetic radial degrees |
| **NAV 1 Relative Bearing** | `0x0C54` | 2 Bytes | Int16 | `Value * 360.0 / 65536.0` |
| **NAV 1 DME Distance** | `0x0300` | 2 Bytes | UInt16 | BCD or integer / 10 (NM) |
| **NAV 1 DME Speed** | `0x0302` | 2 Bytes | UInt16 | BCD knots |
| **NAV 2 Radial / OBS** | `0x0C5E` | 2 Bytes | UInt16 | Magnetic radial degrees |
| **NAV 2 Relative Bearing** | `0x0C64` | 2 Bytes | Int16 | `Value * 360.0 / 65536.0` |
| **NAV 2 DME Distance** | `0x0306` | 2 Bytes | UInt16 | BCD or integer / 10 (NM) |
| **NAV 2 DME Speed** | `0x0308` | 2 Bytes | UInt16 | BCD knots |
| **ADF 1 Relative Bearing** | `0x02C0` | 2 Bytes | Int16 | Relative degrees to station |

---

## 4. Database Schema & Tauri IPC Architecture

### SQLite Schema (`aerotrack.db`)

```sql
CREATE TABLE IF NOT EXISTS flights (
    id TEXT PRIMARY KEY,                       -- UUID v4
    aircraft_type TEXT NOT NULL,
    departure_icao TEXT,
    arrival_icao TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    flight_time_seconds INTEGER DEFAULT 0,
    max_altitude INTEGER DEFAULT 0,
    max_ground_speed INTEGER DEFAULT 0,
    distance_flown_nm REAL DEFAULT 0.0,
    landing_rate_fpm REAL,
    touchdowns TEXT,                           -- JSON array of TouchdownEvent records
    status TEXT CHECK(status IN ('RECORDING', 'COMPLETED', 'DISCARDED')) DEFAULT 'RECORDING'
);

CREATE TABLE IF NOT EXISTS flight_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_id TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
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
    FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visited_airports (
    icao TEXT PRIMARY KEY,
    name TEXT,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    first_visited DATETIME NOT NULL,
    last_visited DATETIME NOT NULL,
    visit_count INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS visited_countries (
    iso_a2 TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    first_visited DATETIME NOT NULL,
    last_visited DATETIME NOT NULL,
    flight_count INTEGER DEFAULT 1
);

-- Embedded Global Aerodromes Database (Read-Only / Pre-populated & Synced with OurAirports)
CREATE TABLE IF NOT EXISTS airports (
    icao TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    elevation_ft INTEGER,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    municipality TEXT,
    airport_type TEXT,
    continent TEXT,
    max_runway_length_ft INTEGER,
    has_paved BOOLEAN DEFAULT 0,
    has_unpaved BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_telemetry_flight_id ON flight_telemetry(flight_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON flight_telemetry(timestamp);
CREATE INDEX IF NOT EXISTS idx_airports_coords ON airports(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_airports_runway ON airports(max_runway_length_ft, has_paved);
```

### Tauri IPC Commands Interface
The Rust backend exposes the following IPC commands registered in `tauri::generate_handler!`:
* `get_connection_status() -> bool`: Returns active FSUIPC connection state.
* `start_polling() -> Result<String, String>`: Manually activates or resumes telemetry polling.
* `stop_polling() -> Result<String, String>`: Pauses FSUIPC background worker.
* `get_flights() -> Result<Vec<FlightRecord>, String>`: Fetches list of all logged flight headers ordered by `start_time DESC`.
* `get_flight_details(flight_id: String) -> Result<FlightDetails, String>`: Lazily fetches a flight with its complete array of `flight_telemetry` coordinates and touchdown events for detailed profile and map rendering.
* `delete_flight(flight_id: String) -> Result<(), String>`: Deletes a flight and cascades associated telemetry points.
* `export_flight(flight_id: String, format: String) -> Result<String, String>`: Generates and returns a GPX, KML, GeoJSON, or CSV formatted track. Prompts user via native OS Explorer save dialog.
* `search_airports_near(lat: f64, lon: f64, radius_nm: f64) -> Result<Option<Airport>, String>`: Queries embedded `airports` table for the nearest aerodrome within `radius_nm` (default 3.0 NM).
* `get_visited_stats() -> Result<VisitedStats, String>`: Returns aggregated visited airport and country counts directly from SQLite.
* `get_airports_count() -> Result<i64, String>`: Returns total number of indexed aerodromes in the SQLite `airports` database.
* `sync_ourairports() -> Result<OurAirportsSyncResult, String>`: Downloads and indexes the latest global dataset from OurAirports (86,000+ aerodromes, runway surfaces, lengths, and country metadata).

---

## 5. Functional Modules & UI Specifications

### Module 1: Flight Tracking & Flight Logbook

#### 1. Discrete 7-Stage Flight Lifecycle State Machine
To guarantee accurate detection without false starts or premature completions, telemetry triggers transition through 7 explicit states:
1. `BOARDING`: Simulator connected, aircraft stationary on ground, engines off or starting.
2. `TAXI_OUT`: On ground, ground speed between 3 kts and 35 kts.
3. `TAKEOFF_CLIMB`: `is_on_ground` transitions `1 -> 0` with IAS > 45 kts.
   - Triggers `flights` record insertion (`status: 'RECORDING'`).
   - Automatically resolves Origin ICAO from nearest airport threshold within 3 NM.
4. `ENROUTE_CRUISE`: Airborne, vertical speed stabilizes within ±150 fpm for > 60 seconds at cruise altitude.
5. `DESCENT_APPROACH`: Sustained negative vertical speed (< -300 fpm) descending below cruise level toward destination.
6. `TOUCHDOWN_ROLLOUT`: `is_on_ground` transitions `0 -> 1`.
   - Captures instantaneous vertical speed, ground speed, pitch, bank, and GPS coordinates into `touchdowns: TouchdownEvent[]`.
   - Debounces micro-gear bounces (4-second threshold) while recording multiple landings (e.g. touch-and-goes, bounces).
   - Computes overall flight touchdown rate as the average of all recorded landings.
7. `ARRIVED`: Aircraft stationary (< 2.0 kts) for > 30 seconds AND one or more engines cut off.
   - Resolves Destination ICAO within 3 NM.
   - Marks flight `status: 'COMPLETED'`.
   - Flushes remaining buffered telemetry and updates visited airports and countries.

#### 2. Logbook List View
- Searchable and filterable table (by ICAO route, aircraft model, date range, or duration).
- Displays Route, Aircraft, Date, Duration, Distance, Max Altitude, Peak GS, Landing Rate, and Status badge.
- **Dynamic KPI Aggregation:** Accurately computes total block hours, total nautical miles, and average touchdown rate across all logged operations directly from SQLite.
- **Universal Flight Export Action:** 256px rich dropdown menu per flight row exporting to **GPX**, **KML**, **GeoJSON**, or **CSV** with format badges, descriptions, and native explorer save destinations.

#### 3. Flight Detail View & Map Visualizer
- **Summary Stat Cards:** Total distance, block time, max altitude, peak ground speed, average touchdown landing rate, and normal load factor (+X.XX G).
- **Altitude-Gradient GPS Track (Leaflet):**
  - Renders GPS trajectory with smooth 250 ft quantized color gradient:
    - `0 ft`: Vibrant Green (`#22c55e`)
    - `10,000 ft`: Lime / Yellow-Green (`#84cc16`)
    - `20,000 ft`: Yellow (`#eab308`)
    - `32,000 ft`: Orange (`#f97316`)
    - `45,000+ ft`: Red (`#ef4444`)
  - Interactive markers with rich popups:
    - **Origin & Destination Aerodromes**
    - **Top of Climb (TOC):** Waypoint where aircraft reaches 95% of peak cruise altitude.
    - **Top of Descent (TOD):** Waypoint where aircraft initiates sustained descent toward arrival.
    - **Touchdown Markers (TD #1, TD #2...):** Monospace rate and impact G-force badges.
- **Synchronized Telemetry Scrubbing:**
  - Synchronized Recharts dual-axis chart (Altitude MSL and Ground Speed vs Time).
  - Hovering across the chart dynamically positions an aircraft marker on the Leaflet map showing instantaneous altitude, speed, and heading.
- **Touchdown & Landing Analysis:**
  - Multi-touchdown cards for all recorded landings displaying vertical sink rate (`-XXX fpm`), landing rating badge, ground speed, pitch/bank attitude, and calculated G-force load factor.
  - Overall flight average rate and G-force indicator.

#### 4. Touchdown G-Force Normal Load Factor Physics Model
Deceleration physics based on oleo-pneumatic shock absorber energy dissipation (CS / FAR 25.473):

$$v_{fps} = \frac{|V_{vertical\text{ (fpm)}}|}{60}, \quad a_z = \frac{v_{fps}^2}{2 \cdot s \cdot \eta}, \quad G_z = 1.0 + \frac{a_z}{g}$$

* $s$ = oleo strut stroke in feet (nominal 13.5" or 1.125 ft for commercial narrowbodies; 8"–18" across categories).
* $\eta$ = shock absorption efficiency factor ($0.78$ nominal for oleo-pneumatic struts).
* $g = 32.174\text{ ft/s}^2$ (standard gravitational acceleration).
* Static weight baseline = $+1.00\text{ G}$.

**Touchdown Rating Scale:**
* $\le 120\text{ fpm}$ / $\le 1.15\text{ G}$ (**Butter**): Negligible airframe deceleration.
* $120\text{–}200\text{ fpm}$ / $1.16\text{–}1.40\text{ G}$ (**Smooth / Normal**): Standard positive touchdown well within design envelope.
* $200\text{–}350\text{ fpm}$ / $1.41\text{–}1.75\text{ G}$ (**Firm**): Positive landing recommended for wet/contaminated runways.
* $350\text{–}500\text{ fpm}$ / $1.76\text{–}2.10\text{ G}$ (**Hard**): High deceleration near design limit load.
* $> 500\text{ fpm}$ / $> 2.10\text{ G}$ (**Severe Hard Landing**): Exceeds operational envelope; AMM Chapter 05 conditional inspection advisory.

---

### Module 2: Visited Overview Page
- **World Map Projection (Choropleth):**
  - Leaflet GeoJSON layer highlighting sovereign territories with visit frequency heatmaps.
  - Interactive hover tooltips showing country name, ISO code, total flight operations, and last visited date.
  - Airport pins for all logged destinations with arrival/departure counters.
- **Metrics Dashboard:**
  - Total sovereign countries visited out of 195 (progress bar and percentage).
  - Total logged aerodromes.
  - Continental breakdown badges (Europe, North America, Asia, etc.).

---

### Module 3: IFR Training Center

#### Feature 3A: VOR / NDB Interception Trainer
- **Multi-Source Navigation Receiver:**
  - Toggle between **NAV1**, **NAV2**, and **ADF (NDB)** as active telemetry and display source.
- **Dual Operating Modes:**
  - **Live MSFS Sync Mode:** Ingests live NAV1/NAV2 OBS (`0x0C4E`/`0x0C5E`), relative bearings (`0x0C54`/`0x0C64`/`0x02C0`), DME distance (`0x0300`/`0x0306`), and aircraft heading (`0x0580`) straight from MSFS via FSUIPC. Automatically activates when simulator flight is ongoing.
  - **Practice / Scenario Mode:** Interactive manual sliders for off-sim procedural training.
- **Visual Display (Canvas):**
  - 360° compass rose with rotating OBS needle, CDI (Course Deviation Indicator) needle deflection, TO/FROM flags, and aircraft orientation vector.
- **Challenge Generator:**
  - Generates inbound/outbound interception tasks (e.g., *"Intercept radial 120 Inbound"*).
  - Displays computed recommended intercept heading (30° to 45° cut angle) and scores accuracy when radial is captured within ±2°.

#### Feature 3B: Holding Pattern Procedural Trainer
- **Multi-Source Navaid Selector:**
  - Supports tracking holding fixes using NAV1, NAV2, or NDB (ADF).
- **Dual Operating Modes:**
  - **Live Track Following:** Follows live aircraft position relative to the holding fix and evaluates procedural entry and turn timing in real-time. Automatically switches to live sync when flight is ongoing.
  - **Interactive Scenario Mode:** User sets or randomizes Inbound Course, Turn Direction (Standard Right / Non-Standard Left), and Aircraft Heading.
- **Entry Sector Analysis (FAA / ICAO Standard):**
  - Automatically classifies and highlights the appropriate entry sector:
    - **Direct Entry:** 180° sector.
    - **Teardrop Entry:** 70° sector.
    - **Parallel Entry:** 110° sector.
- **Interactive Visualizer:**
  - Top-down canvas depicting holding fix, racetrack pattern, leg lengths, entry boundaries, and live/simulated flight track.

---

### Module 4: Procedural Route & Multi-Sector Generator

#### 1. Aircraft Category Performance Profiles
Six standardized ICAO aircraft categories with realistic performance envelopes:
* **Cat A (Light GA / Trainer):** 110 kt TAS, 700 fpm climb, 500 fpm descent, typical FL045 (e.g. C172 Skyhawk, Piper Archer).
* **Cat B (High-Performance Single / Light Twin):** 165 kt TAS, 1,200 fpm climb, 1,000 fpm descent, typical FL095 (e.g. Beechcraft Bonanza, Cirrus SR22, Baron 58).
* **Cat C (Turboprop / Light Jet):** 280 kt TAS, 2,200 fpm climb, 1,800 fpm descent, typical FL240 (e.g. King Air 350i, TBM 930, Citation Mustang).
* **Cat D (Regional / Medium Jet):** 440 kt TAS, 2,800 fpm climb, 2,200 fpm descent, typical FL330 (e.g. A320neo, B737-800, CRJ-700, E190).
* **Cat E (Long Haul Widebody):** 480 kt TAS, 2,400 fpm climb, 2,000 fpm descent, typical FL370 (e.g. B777-300ER, B787-9, A350-900, A330-900).
* **Cat F (Heavy / Super):** 490 kt TAS, 1,800 fpm climb, 1,600 fpm descent, typical FL370 (e.g. A380-800, B747-8 Intercontinental, An-225).

#### 2. Route Constraints & Multi-Sector Engine
- **Sector Count:** Configurable from 1 to 6 consecutive legs with optional ground turnaround / taxi times.
- **Limitation Modes:** Switch between limiting by **Total Flight** or **Per-Sector** for both Duration (15 min min to 12 hrs max) and Distance (20 NM to 8,000 NM).
- **Altitude & Flight Level Rules:**
  - Semi-circular cruising levels (Eastbound odd thousands, Westbound even thousands).
  - Short-hop parabolic climb/descent scaling when sector distance is shorter than unconstrained climb-to-descent distance.

#### 3. Airport Filter Engine with Collapsible Accordions
- Smooth animated collapsible sections (`Chevron` toggle with CSS transition).
- **Runway Length & Surface:**
  - Toggle between **Feet (ft)** and **Meters (m)** units.
  - Optional **Minimum** AND/OR **Maximum** runway length inputs.
  - Surface filter: Paved Only, Unpaved Only, Water/Seaplane Base, or Any.
- **Geographic & Type Constraints:**
  - Origin / Destination locks (ICAO input).
  - Continental and Country filters.
  - Airport classification (Large, Medium, Small).

#### 4. Route Map & Briefing Brief
- Great circle sector lines plotted on Leaflet map with bearing arrows and aerodrome pins.
- Leg breakdown table: sector distance, initial bearing, climb/cruise/descent durations, flight level (e.g. `FL330`), and ground turnaround time.
- One-click copy briefing package to clipboard formatted for flight simulator EFB/flight plan entry.

---

## 6. Implementation Roadmap

### Phase 1: Tauri Backend & FSUIPC Integration
- [x] Initialize Tauri 2.0 workspace with React 19 + TypeScript + Vite.
- [x] Implement Rust FSUIPC bridge worker thread to read core telemetry packet (`0x0560`, `0x0568`, `0x0570`, `0x02BC`, `0x0580`, `0x0366`, `0x0C4E`, `0x0C54`, `0x0300`, `0x02C0`, `0x3D00`).
- [x] Implement auto-reconnection loop when MSFS or FSUIPC7 restarts.
- [x] Expose Tauri IPC polling commands (`start_polling`, `stop_polling`, `get_connection_status`).

### Phase 2: Local Persistence & Auto-Logging
- [x] Initialize `aerotrack.db` SQLite connection inside Tauri runtime `setup()` (`lib.rs`).
- [x] Expose SQLite Tauri IPC commands (`get_flights`, `get_flight_details`, `delete_flight`, `get_visited_stats`, `search_airports_near`, `save_telemetry_batch`, `export_flight`).
- [x] Implement Rust background batch telemetry flusher (write every 5 seconds / 20 samples to `flight_telemetry`).
- [x] Embed global airport database (integrated with OurAirports 86,000+ aerodromes & live sync) for lat/lon proximity auto-detection within 3 NM.
- [x] Implement 7-stage flight lifecycle state machine (`BOARDING` -> `TAXI_OUT` -> `TAKEOFF_CLIMB` -> `ENROUTE_CRUISE` -> `DESCENT_APPROACH` -> `TOUCHDOWN_ROLLOUT` -> `ARRIVED`).
- [x] Implement multi-touchdown detection with debouncing and overall flight landing rate averaging.
- [x] Migrate frontend store from `localStorage` persistence to Tauri SQLite IPC queries with lazy coordinate loading.

### Phase 3: Frontend Logbook & Visualizers
- [x] Build Logbook dashboard: Flight cards, search filter, and flight deletion.
- [x] Dynamic logbook KPI card calculations (exact total hours, distance, and true average touchdown rate).
- [x] Implement Flight Detail view with Leaflet path rendering and Recharts profile charts.
- [x] Implement synchronized telemetry scrubbing (hovering chart moves map position marker).
- [x] Implement universal rich export dropdown (**GPX**, **KML**, **GeoJSON**, and **CSV**) with native explorer dialogs.
- [x] Implement continuous altitude gradient route rendering (`0 ft` Green -> `45,000+ ft` Red) on Leaflet map.
- [x] Add Top of Climb (TOC) and Top of Descent (TOD) marker calculations and map placement.
- [x] Add multi-touchdown analysis cards with oleo-pneumatic G-force normal acceleration calculations.

### Phase 4: Visited Overview Module
- [x] Aggregate unique airports and country codes from completed flights.
- [x] Render world map using GeoJSON country boundaries with interactive tooltips.
- [x] Add country statistics, continent badges, and airport pin markers with visit counts.

### Phase 5: IFR Interception & Hold Trainer
- [x] Read NAV1 / NAV2 / ADF / DME offsets (`0x0C4E`, `0x0C54`, `0x0C5E`, `0x0C64`, `0x0300`, `0x0306`, `0x02C0`).
- [x] Implement NAV1 / NAV2 / ADF navigation source selector across IFR and Hold trainers.
- [x] Build 2D HTML5 Canvas rendering engine for aircraft position relative to NAVAID and holding patterns.
- [x] Implement radial challenge algorithm with intercept heading recommendations and capture detection.
- [x] Implement Hold Pattern Entry calculator (Direct, Teardrop, Parallel) with visual sector overlays.
- [x] Add automatic **Live MSFS Sync** activation when simulator flight is active.

### Phase 6: Procedural Route & Multi-Sector Generator
- [x] Design 6 ICAO aircraft category performance envelopes (Cat A through Cat F).
- [x] Build multi-sector procedural route engine with climb/cruise/descent physics and semi-circular cruising FLs.
- [x] Implement total flight vs per-sector limitations for both duration and distance (15 min min, 30 min lowest max).
- [x] Build collapsible filter accordion sections with smooth chevron animations.
- [x] Implement runway surface, unit switching (ft / m), and optional minimum AND/OR maximum runway length filters.
- [x] Render interactive great-circle route map with bearing indicators and clipboard briefing export.
- [x] Replace native `<select>` dropdowns across the application with custom accessible `Select` component.

### Phase 7: Future Architectural Enhancements
- [ ] Implement corridor terrain-aware minimum safe altitude (MSA / Grid MORA) query to clamp cruising flight levels over mountainous terrain.
- [ ] Abstract database repository layer using Rust traits (`FlightRepository`).
- [ ] Plan JWT auth / Supabase / PostgreSQL schema alignment so local SQLite syncs transparently to remote backend.
