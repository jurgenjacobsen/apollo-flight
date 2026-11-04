# Contributing to Apollo Flight

Thank you for your interest in contributing to Apollo Flight! This guide covers everything you need to get your local development environment running, understand the architecture, and submit quality pull requests.

---

## Architecture Overview

Apollo Flight is a desktop flight tracking, telemetry analysis, and IFR companion application built using:

- **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide icons, Leaflet / React-Leaflet, and Zustand.
- **Desktop Runtime:** [Tauri v2](https://v2.tauri.app/) (native OS webview with Rust backend).
- **Backend (Rust):** Asynchronous telemetry polling loop, FSUIPC7 inter-process communication, file-based logging, crash dump capture, and SQLite storage.
- **Database Architecture:** Split dual SQLite database:
  - `logbook.db`: Stores all user-generated data — flight summaries, high-frequency telemetry samples, touchdown analysis, saved routes, visited destination statistics, and user configuration preferences (`user_settings`).
  - `navdata.db`: Stores the worldwide [OurAirports](https://ourairports.com) dataset (~80,000 airports and runways) with full-text search indices, completely decoupled from user logbooks.

---

## Prerequisites

Before building Apollo Flight, ensure your environment has:

1. **Node.js**: `v20.x` or later (with `pnpm` or `npm`).
2. **Rust**: Latest stable toolchain (`rustup default stable`).
3. **C++ Build Tools (Windows)**: Visual Studio C++ Build Tools (required for compiling native FSUIPC Windows bindings and Tauri).
4. **Simulator (Optional for UI development, required for telemetry testing)**:
   - Microsoft Flight Simulator 2020 / 2024, Prepar3D, or FSX.
   - [FSUIPC7](https://www.fsuipc.com/) installed and running alongside the simulator for telemetry capture.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/jurgenjacobsen/apollo-flight.git
cd apollo-flight
```

### 2. Install Frontend Dependencies

```bash
pnpm install
# or
npm install
```

### 3. Run Development Server

#### Frontend Only (Rapid UI prototyping in browser)
```bash
npm run dev
```
> *Note: Sim connection and native file commands are mocked or return safely when running in a standalone browser.*

#### Full Desktop Application (Tauri + Rust)
```bash
npm run tauri dev
```
This compiles the Rust backend, starts the Vite dev server, and launches the desktop window with hot module reloading.

---

## Project Structure

```
apollo-flight/
├── .github/
│   ├── ISSUE_TEMPLATE/       # GitHub issue forms (bug, feature, feedback)
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/            # GitHub Actions CI/CD workflows
├── src/                      # React Frontend
│   ├── components/           # UI Views (Map, Logbook, RoutePlanner, Settings, Feedback)
│   ├── store/                # Zustand state management and Tauri IPC helpers
│   ├── types/                # TypeScript interfaces and telemetry models
│   ├── App.tsx               # Root view router and layout shell
│   └── main.tsx              # React DOM entry point
├── src-tauri/                # Rust Backend (Tauri v2)
│   ├── capabilities/         # Security permission sets (shell, tray, etc.)
│   ├── src/
│   │   ├── db.rs             # SQLite schema, dual database management, queries
│   │   ├── fsuipc.rs         # Telemetry loop, SimConnect/FSUIPC memory offsets
│   │   ├── main.rs           # Application executable bootstrap
│   │   └── lib.rs            # Tauri commands, tray handlers, logging, and crash dumps
│   └── Cargo.toml            # Rust dependencies
├── package.json
└── tsconfig.json
```

---

## Development Guidelines

### Code Quality & Formatting
- **TypeScript**: Ensure strict types. Avoid `any`. Run type validation before committing:
  ```bash
  npx tsc --noEmit
  ```
- **Rust**: Ensure all Rust code compiles cleanly without unhandled panics or warnings:
  ```bash
  cargo check --manifest-path src-tauri/Cargo.toml
  cargo clippy --manifest-path src-tauri/Cargo.toml
  ```
- **Design & UI**: Follow the Geist / neutral aesthetic. Support both dark and light modes cleanly with high-contrast borders and accessible focus rings.

### Database & Migrations
- Never modify existing tables in `logbook.db` or `navdata.db` without backward-compatible migrations in [`src-tauri/src/db.rs`](src-tauri/src/db.rs).
- User data in `logbook.db` must never be wiped or overwritten during database migrations or OurAirports syncs.

### Telemetry & FSUIPC
- The background telemetry worker in [`src-tauri/src/fsuipc.rs`](src-tauri/src/fsuipc.rs) runs continuously. Any errors reading offsets or communicating with FSUIPC must be handled gracefully without crashing the application thread.

---

## Submitting a Pull Request

1. **Create a Topic Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

2. **Commit Your Changes**:
   - Write clear, imperative commit messages (`feat: add runway wind component calculator`, `fix: prevent telemetry loop race condition on disconnect`).

3. **Verify Locally**:
   - Run `npx tsc --noEmit`.
   - Run `cargo check --manifest-path src-tauri/Cargo.toml`.
   - Run `npm run tauri dev` to test your changes live.

4. **Open a Pull Request**:
   - Push your branch to GitHub and open a PR targeting `main`.
   - Complete the provided pull request template with a description of changes and test steps.
