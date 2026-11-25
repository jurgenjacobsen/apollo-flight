<div align="left">
  <h1><img src="public/Icon.png" alt="Apollo Flight Logo" width="44" height="44" align="absmiddle" /> Apollo Flight</h1>
  <p>
    <strong>Offline-first flight tracking, telemetry analysis, EFB companion, and IFR procedural trainer for Microsoft Flight Simulator 2020 &amp; 2024.</strong>
  </p>
  <p>
    <img src="https://img.shields.io/badge/version-0.0.6-blue.svg" alt="Version 0.0.6" />
    <img src="https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
    <img src="https://img.shields.io/badge/Rust-2021-orange?logo=rust&logoColor=white" alt="Rust 2021" />
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License" />
  </p>
</div>

---

Built with **Tauri v2**, **Rust**, **React 19**, **TypeScript**, and **SQLite (WAL)**, Apollo Flight interfaces directly with Microsoft Flight Simulator via **FSUIPC7** shared-memory IPC—delivering zero-cloud-dependency flight logging, high-frequency landing physics, voice-driven checklists, and a local Wi-Fi Electronic Flight Bag (EFB).

---

## Key Features

- **Real-Time FSUIPC7 Telemetry & Adaptive Polling**
  - Dynamic polling rate scales from `1 Hz` on the ground to `50 Hz` (`20 ms`) during touchdown flare (`< 1,000 ft AGL`) for pinpoint landing capture.
  - Abstracted `FlightDataProvider` trait supporting live FSUIPC7 memory offsets and an offline `MockProvider` for replay and development testing.
  - Monitors IAS, TAS, GS, MSL/AGL altitude, vertical speed, pitch, bank, magnetic heading, engine combustion masks, and NAV1/NAV2/ADF navaids.

- **Aeronautical State Machine**
  - Smooths turbulence jitter via an exponential moving average (EMA) filter and tracks `BOARDING`, `TAXI_OUT`, `TAKEOFF_CLIMB`, `ENROUTE_CRUISE`, `DESCENT_APPROACH` (with shallow glideslope protection), `GO_AROUND`, `TOUCHDOWN_ROLLOUT`, `TOUCH_AND_GO`, `TAXI_IN`, and `ARRIVED`.
  - Automatically detects replay rewinds, slew mode, and simulator reloads to prevent corrupted telemetry.

- **Oleo-Pneumatic Landing Physics & Debriefing**
  - Calculates peak touchdown load factor ($+X.XX\text{ G}$) and sink rate (`fpm` / `ft/s` / `m/s`) using aircraft-category oleo strut stroke and shock absorber efficiency presets.
  - Synchronized **Altitude & Groundspeed** Recharts profiles paired with interactive Leaflet satellite maps (ArcGIS World Imagery) and crosshair scrubbing.

- **Partitioned Offline-First SQLite Engine**
  - Dedicated local SQLite databases in Write-Ahead Logging (`WAL`) mode for logbook history, downsampled flight tracks (Ramer-Douglas-Peucker), saved routes, and indexed OurAirports aerodrome/runway data.

- **Hands-Free Voice Checklists (Virtual Co-Pilot)**
  - Offline Rust-backed **Vosk** speech-to-text (`STT`) paired with Web Speech `TTS` and synthesized cockpit chimes—challenge, respond, and advance checklists completely hands-free.

- **Local Wi-Fi EFB Companion**
  - Embedded **Axum** HTTP/WebSocket server streams live HUD telemetry, route scratchpads, checklists, and IFR instruments to any tablet or phone on your local network via QR code pairing.

- **Intelligent Route Dispatch, Terrain MORA & SimBrief/Navigraph**
  - Multi-sector procedural route generator with runway length/surface filtering, corridor Minimum Safe Altitude (`1,000 ft` flat / `2,000 ft` mountainous terrain clearance), and ICAO semi-circular IFR cruising levels.
  - Supports SimBrief OFP dispatch imports and Navigraph AIRAC integration.

- **IFR Trainer, World Passport & Multi-Format Exports**
  - Live VOR/ADF/DME instrument trainer and Direct/Teardrop/Parallel holding pattern entry calculator.
  - Interactive World Passport tracking visited aerodromes, sovereign countries, and pilot achievements.
  - Native exports to **GPX**, **KML** (3D Google Earth profiles), **GeoJSON**, **CSV**, and **JSON**, plus minimize-to-tray background recording and Tauri auto-updates.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Desktop Shell** | [Tauri v2](https://v2.tauri.app/), Rust 2021, `tauri-plugin-shell`, `tauri-plugin-updater` |
| **Frontend** | [React 19](https://react.dev/), [TypeScript 5.7](https://www.typescriptlang.org/), [Vite 6](https://vite.dev/), [Zustand](https://github.com/pmndrs/zustand) |
| **UI & Visualization** | [Tailwind CSS](https://tailwindcss.com/), [Geist](https://vercel.com/font), [Lucide React](https://lucide.dev/), [Leaflet](https://leafletjs.com/), [Recharts](https://recharts.org/) |
| **Backend Services** | [rusqlite](https://github.com/rusqlite/rusqlite) (bundled SQLite WAL), [Axum](https://github.com/tokio-rs/axum) (EFB WebSocket server), Vosk STT |
| **Simulator Bridge** | [FSUIPC7](http://www.fsuipc.com/) via Windows shared-memory IPC (`fsuipc` crate) |
| **Testing & Tooling** | [Vitest](https://vitest.dev/), [React Testing Library](https://testing-library.com/), Cargo `#[test]`, ESLint, Prettier |

---

## Project Structure

```text
apollo-flight/
├── src/                        # React 19 + TypeScript frontend
│   ├── components/             # Views, modals, EFB companion, route & debrief UI
│   ├── services/               # Route generator, terrain MORA, SimBrief, Navigraph, EFB
│   ├── store/                  # Zustand state store & flight state machine
│   ├── utils/                  # Touchdown physics, weather units, formatters, IPC
│   └── test/                   # Vitest + jsdom setup
├── src-tauri/                  # Rust Tauri v2 backend
│   └── src/
│       ├── commands/           # Tauri IPC command handlers
│       ├── db/                 # SQLite migrations, logbook, telemetry RDP, OurAirports
│       ├── fsuipc.rs           # FlightDataProvider, FsuipcConversions, MockProvider
│       ├── efb.rs              # Embedded Axum HTTP/WebSocket EFB server
│       └── speech.rs           # Offline Vosk speech recognition engine
├── scripts/                    # Repository automation (version synchronization)
├── docs-dev/                   # Technical specs, architecture plans & V1 tracker
└── .github/workflows/          # CI (ci.yml) and multi-platform release (release.yml)
```

---

## Getting Started

### Prerequisites

1. **Node.js** `v20+` or `v22+`
2. **pnpm** (`corepack enable` or `npm install -g pnpm`)
3. **Rust** stable toolchain (`rustup default stable`)
4. **Microsoft Flight Simulator 2020 or 2024** with [FSUIPC7](http://www.fsuipc.com/) (free unregistered version is sufficient)

### Development Setup

```powershell
# 1. Clone the repository
git clone https://github.com/jurgenjacobsen/apollo-flight.git
cd apollo-flight

# 2. Install JavaScript dependencies
pnpm install

# 3. Launch the full Tauri desktop app in dev mode
pnpm tauri dev

# Or run the frontend only in a browser
pnpm dev
```

### Building for Production

```powershell
pnpm tauri build
```

Generated installers are output under `src-tauri/target/release/bundle/`:
- **Windows:** `msi/` and `nsis/`
- **macOS:** `dmg/`
- **Linux:** `deb/` and `appimage/`

---

## Available Scripts

| Script | Description |
| :--- | :--- |
| `pnpm dev` | Start Vite frontend dev server (`http://localhost:1420`) |
| `pnpm build` | Typecheck (`tsc`) and build production frontend bundle |
| `pnpm tauri <cmd>` | Run Tauri CLI commands (`dev`, `build`, etc.) |
| `pnpm test` | Run Vitest + React Testing Library suite once |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm typecheck` | Run TypeScript typechecking (`tsc --noEmit`) |
| `pnpm lint` | Run ESLint across `src/` |
| `pnpm format` | Check formatting with Prettier |
| `pnpm format:fix` | Auto-format `src/` with Prettier |
| `pnpm version:check` | Verify `package.json`, `Cargo.toml`, and `tauri.conf.json` versions match |
| `pnpm version:sync [x.y.z]` | Sync versions across `package.json`, `Cargo.toml`, and `tauri.conf.json` |

---

## Testing & CI/CD

### Running Tests Locally

```powershell
# Frontend unit & component tests (Vitest + React Testing Library)
pnpm test

# Backend Rust unit tests (FSUIPC conversions, in-memory SQLite, CSV ingestion, MockProvider)
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

### GitHub Actions Workflows

- **Continuous Integration ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))** — Runs on pull requests, pushes to `main` / `staging`, and `v*` tag pushes:
  - **Frontend (`ubuntu-latest`):** `pnpm version:check` → `pnpm run typecheck` → `pnpm test`
  - **Backend (`windows-2022`):** `cargo check --all-targets` → `cargo test --lib` → `cargo clippy --all-targets -- -D warnings`
  - **Release Tag Verification (`refs/tags/v*`):** Validates semver tag format, confirms tag matches `package.json` version, and verifies `pnpm run build`.
- **Multi-Platform Release ([`.github/workflows/release.yml`](.github/workflows/release.yml))** — Triggered on `v*` tags to build, sign, and publish native installers for Windows (`windows-2022`), macOS (`aarch64` & `x86_64`), and Linux (`ubuntu-22.04`).

---

## Versioning & Releasing

Version numbers are synchronized across [`package.json`](package.json), [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml), and [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) using [`scripts/sync-version.mjs`](scripts/sync-version.mjs):

```powershell
# Bump and sync all manifests to a new version (e.g. 0.0.7)
pnpm version:sync 0.0.7

# Verify all manifests are aligned
pnpm version:check
```

Also remember to review [`SECURITY.md`](SECURITY.md) for the supported versions table before tagging a release:

```powershell
git tag v0.0.7
git push origin v0.0.7
```

> [!NOTE]
> The Rust backend automatically reads its version from `src-tauri/Cargo.toml` at compile time via `env!("CARGO_PKG_VERSION")`.

---

## License

**Author:** Jürgen Jacobsen  
**License:** [MIT](LICENSE)
