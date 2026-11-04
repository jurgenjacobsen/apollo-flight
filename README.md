# Apollo Flight

Modern flight tracking, telemetry analysis, and IFR procedural companion for Microsoft Flight Simulator 2020 & 2024.

Built with **Tauri v2**, **Rust**, **React 19**, and **SQLite (WAL)**, Apollo Flight is an offline-first desktop application that interfaces directly with Microsoft Flight Simulator via FSUIPC7 memory-mapped IPC.

---

## Key Features

- **Real-Time FSUIPC7 Telemetry Ingestion**
  - High-frequency telemetry capture (1 Hz ground / 4 Hz airborne) with zero UI thread contention.
  - Monitors indicated airspeed, true airspeed, ground speed, MSL/AGL altitude, vertical speed, pitch, bank, magnetic heading, engine combustion states, and NAV1/NAV2/ADF navaids.
  - Automatic flight session start based on ground speed (> 20 kt) or engine combustion detection, with manual session safeguards.

- **Offline-First Storage Engine**
  - Embedded local SQLite database (`aerotrack.db`) running in Write-Ahead Logging (WAL) mode for low-latency batch writes and zero-latency flight queries.
  - Complete offline flight logbook preserving full high-frequency GPS breadcrumbs, takeoff/landing timestamps, and distance flown.

- **Telemetry Analysis & Profile Scrubbing**
  - Synchronized flight profile graphs (Altitude & Groundspeed vs. Flight Duration) paired with interactive 2D route maps.
  - Crosshair scrubbing: hovering over any point on the telemetry profile moves the aircraft position indicator on the map and updates instantaneous telemetry gauges.

- **Multi-Touchdown & Landing G-Force Physics**
  - Touchdown event logging designed for touch-and-go patterns and standard landings.
  - Normal load factor ($+X.XX\text{ G}$) and landing sink rate (fpm) calculated using oleo-pneumatic gear compression physics.
  - Touchdown ratings graded from Butter to Hard/Overload according to FAA/EASA airworthiness sink speed limits.

- **Interactive IFR Navigation & Holding Pattern Trainer**
  - Live instrument visualizations for VOR radial tracking, ADF relative bearing, and DME distance/groundspeed readouts.
  - Holding pattern entry calculator supporting Direct, Teardrop, and Parallel procedural entries based on inbound course and aircraft heading.

- **Intelligent Route Dispatch Generator**
  - Automated route generator with multi-sector support (outbound and return hops).
  - Terrain-aware cruise altitude calculation accounting for maximum obstacle elevations and standard IFR semicircular flight level rules (Eastbound Odd / Westbound Even).
  - Runway length filters and surface type checks against indexed OurAirports datasets.

- **Multi-Format Flight Track Export**
  - Native Windows Save As dialogs for exporting flights into:
    - **GPX** (GPS Exchange Format)
    - **KML** (Google Earth 3D extruded airborne flight profiles and ground footprint tracks)
    - **GeoJSON** (Spatial GIS lines with rich flight summary metadata)
    - **CSV** (Comma-delimited timestamped telemetry rows)

- **World Passport & Visited Destinations**
  - Interactive world map tracking aerodromes and sovereign territories visited.
  - Countries are automatically marked as visited only when a verified flight departs from or lands at an aerodrome located within that sovereign territory.

- **System Tray Integration**
  - Minimize-to-tray mode (`Close to System Tray`) keeps telemetry logging and flight sessions active in the background when the main window is closed.

---

## Tech Stack

- **Desktop Framework:** [Tauri v2](https://v2.tauri.app/) (Rust 2021)
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/)
- **UI & Styling:** [Tailwind CSS](https://tailwindcss.com/), [Geist](https://vercel.com/font), [Lucide React](https://lucide.dev/)
- **State Management:** [Zustand](https://github.com/pmndrs/zustand)
- **Mapping:** [Leaflet](https://leafletjs.com/), [React Leaflet](https://react-leaflet.js.org/)
- **Charts:** [Recharts](https://recharts.org/)
- **Database:** SQLite via [`rusqlite`](https://github.com/rusqlite/rusqlite) (bundled, WAL mode)
- **Simulator Interface:** [FSUIPC7](http://www.fsuipc.com/) via Windows IPC shared memory mapping

---

## Getting Started

### Prerequisites

1. **Node.js:** v20+ or v22+
2. **pnpm:** `corepack enable` or `npm install -g pnpm`
3. **Rust:** Latest stable toolchain (`rustup default stable`)
4. **Microsoft Flight Simulator & FSUIPC7:**
   - Microsoft Flight Simulator 2020 or 2024
   - [FSUIPC7 for MSFS](http://www.fsuipc.com/) (free unregistered version is sufficient for telemetry)

### Development Setup

1. **Clone the repository:**
   ```powershell
   git clone https://github.com/jurgenjacobsen/apollo-flight.git
   cd apollo-flight
   ```

2. **Install dependencies:**
   ```powershell
   pnpm install
   ```

3. **Run the development desktop application:**
   ```powershell
   pnpm tauri dev
   ```

4. **Run frontend-only in browser (mock telemetry mode):**
   ```powershell
   pnpm dev
   ```

---

## Building for Production

To compile an optimized, standalone production executable:

```powershell
pnpm tauri build
```

The output installers will be located in:
- Windows: `src-tauri/target/release/bundle/msi/` and `src-tauri/target/release/bundle/nsis/`
- macOS: `src-tauri/target/release/bundle/dmg/`
- Linux: `src-tauri/target/release/bundle/deb/` and `src-tauri/target/release/bundle/appimage/`

---

## Release & CI/CD Pipeline

The repository includes a GitHub Actions workflow (`.github/workflows/release.yml`) that builds native installers for **Windows**, **macOS (Apple Silicon & Intel)**, and **Linux** in parallel, signs the binaries cryptographically, and attaches them to a new GitHub Release.

### Triggering a New Release

To trigger an automated multi-platform release build, commit your changes and push a version tag:

```powershell
git tag v0.0.3
git push origin v0.0.3
```

The workflow will:
1. Compile the app on Windows x64, macOS (Apple Silicon `aarch64` and Intel `x86_64`), and Ubuntu Linux.
2. Sign the update bundles using the repository's `TAURI_SIGNING_PRIVATE_KEY`.
3. Create a GitHub Release for `v0.0.3` and publish `.msi`, `.exe`, `.dmg`, `.deb`, `.AppImage`, and `latest.json`.

---

## Versioning Checklist

When bumping the application version, ensure the version string is updated across the following files:

| File | Field / Location | Description |
| :--- | :--- | :--- |
| [`package.json`](package.json) | `"version": "x.y.z"` | Node.js frontend package and in-app diagnostic version |
| [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml) | `version = "x.y.z"` | Rust crate package version |
| [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) | `"version": "x.y.z"` | Tauri desktop application & native installer bundle metadata |
| [`SECURITY.md`](SECURITY.md) | Supported versions table | Minimum supported security patch version |
| [`.github/ISSUE_TEMPLATE/*.yml`](.github/ISSUE_TEMPLATE/) | Form placeholder versions | Issue forms (`bug_report.yml`, `general_feedback.yml`) |
| [`README.md`](README.md) | Release commands & examples | Documentation and release instructions |

> [!NOTE]
> The Rust session logger in `src-tauri/src/lib.rs` automatically tracks `src-tauri/Cargo.toml` via `env!("CARGO_PKG_VERSION")`.

---

## License & Credits

- **Author:** Jürgen Jacobsen
- **License:** [MIT](LICENSE)
