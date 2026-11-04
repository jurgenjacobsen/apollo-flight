# Privacy Policy

**Effective Date:** November 1, 2026  
**Last Updated:** November 1, 2026

Apollo Flight is designed with a strict **privacy-first, local-first** philosophy. We believe that your flight simulation records, pilot statistics, and telemetry data belong solely to you.

---

## 1. Summary of Principles

- **No Remote Telemetry or Tracking:** Apollo Flight contains **no** remote tracking beacons, **no** Google Analytics, **no** advertising trackers, and **no** background usage analytics.
- **No User Accounts:** You do not need an account, email address, or login to use the software.
- **Local Storage by Default:** All flight recordings, touchdown measurements, route plans, and settings reside on your own computer.
- **Offline Capable:** Apollo Flight operates completely offline without requiring an active internet connection (except when explicitly syncing airport datasets or checking for app updates).

---

## 2. What Data Is Stored Locally

All data created or processed by Apollo Flight is stored locally in your operating system's standard application data directory (e.g., `%APPDATA%/apollo-flight/` on Windows):

1. **User Logbook & Configuration (`logbook.db`):**
   - Flight metadata: departure/arrival ICAO, aircraft type, departure/arrival timestamps, total flight time, distance flown, cruise altitude, and maximum ground speed.
   - High-frequency telemetry: recorded latitude, longitude, altitude MSL, indicated/ground airspeed, pitch, bank, and heading coordinates.
   - Touchdown analysis: vertical speed at contact (fpm), G-force, pitch angle, bank angle, and touchdown coordinates.
   - Saved routes and waypoint plans.
   - Visited destinations and country coverage statistics.
   - User settings (`user_settings` table): dark/light interface theme, system tray close behavior, automatic recording triggers, and optional feedback call-sign/email for bug reporting.
2. **Navigation Database (`navdata.db`):**
   - Publicly available worldwide airport and runway records sourced from OurAirports. Decoupled completely from your personal flight data.
3. **Session & Crash Logs (`/logs/`):**
   - Application initialization timestamps, internal Rust worker states, and simulator connection lifecycle events.
   - Panic and crash dump files (`crash-*.txt`) captured locally to assist troubleshooting if the app unexpectedly terminates.
4. **Client-Side Theme Pre-Render Cache (`localStorage`):**
   - The selected theme (`light` or `dark`) is mirrored into `localStorage` exclusively to enable zero-latency, synchronous stylesheet application upon application launch prior to SQLite connection bootstrap.

---

## 3. Network Communications

Apollo Flight only initiates network connections in the following specific, transparent scenarios:

### A. OurAirports Dataset Sync (User-Initiated)
When you click **Sync Dataset** in Settings, the app connects directly to `davidmegginson.github.io` / `ourairports.com` to download public domain airport, runway, and frequency CSV files. The downloaded data is parsed into `navdata.db` locally, and temporary CSV files are immediately purged upon completion.

### B. Application Updates (Automated / Manual Check)
The application uses the official Tauri Updater plugin to check GitHub Releases (`api.github.com`) for published release manifests and cryptographically signed update binaries. No personally identifiable information or flight data is transmitted during this check.

### C. Map Tiles
When using the live telemetry tracking map, map tiles are fetched from OpenStreetMap or public satellite tile providers (CartoDB/Esri). Standard HTTP request headers (IP address and User-Agent) are processed by tile servers according to their respective privacy policies.

### D. Feedback & Issue Reporting (User-Initiated)
When you submit a report via the **Feedback** view:
- No data is sent to private backends or third-party APIs.
- The app generates a formatted Markdown report and opens your default browser directly to GitHub Issues.
- You have complete control to review, edit, or delete any content (including attached flight summaries or log snippets) before clicking "Submit" on GitHub.
- A **Privacy Switch** ("Share System & App Environment Diagnostics") allows you to omit your operating system, screen resolution, and app version if desired.

---

## 4. Simulator Telemetry & Process Isolation

- **FSUIPC / SimConnect Connection:** Apollo Flight connects to your flight simulator (MSFS 2020 / 2024, Prepar3D, FSX) strictly via local inter-process communication (IPC) memory offsets using FSUIPC7.
- Apollo Flight does **not** open listening network sockets or external ports.
- Telemetry readings are processed in memory and buffered locally before writing to your local SQLite database.

---

## 5. Data Ownership, Export & Deletion

- **100% User Ownership:** You have full control over your data.
- **Exporting Records:** You can export individual flights or your entire logbook at any time in standard open formats (GPX, KML, GeoJSON, CSV, JSON, Markdown).
- **Deletion:** Deleting a flight in the Logbook permanently removes it and its associated telemetry points from `logbook.db`.
- **Complete Erasure:** You can completely wipe all application data by removing the `%APPDATA%/apollo-flight/` directory from your computer.

---

## 6. Contact

If you have questions about this privacy policy or how Apollo Flight handles local data, please open an inquiry on our [GitHub Discussions / Issues](https://github.com/jurgenjacobsen/apollo-flight/issues).
