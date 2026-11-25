# Known Technical Risks & Performance Issues

This document tracks identified architectural bottlenecks, performance risks, and operational edge-cases across Apollo Flight, along with mitigation strategies and remediation plans.

---

## Active Risk Register

### [RISK-001] Main-Thread UI Latency during Airway A* Graph Search

- **Component / Subsystem:** Navigraph AIRAC Airway Routing (`src-tauri/src/navigraph_procedures.rs`)
- **Category:** Performance / Threading
- **Identified:** 2026-11-23
- **Severity:** Low-Medium
- **Status:** Open / Monitored

#### Description
Large multi-hop flight plans traversing thousands of enroute airway records could experience a 100–300 ms UI latency pause during A* pathfinding.

#### Trigger Condition
Generating or auto-routing flight plans across continental distances with dense enroute networks when the local SQLite DFD v2 database (`tbl_enroute_airways`) is queried and solved synchronously in the Tauri command thread.

#### Mitigation / Remediation Plan
1. **Thread Pool Offloading:** Offload A* graph solver execution from the main command handler to a `rayon` parallel iterator or Tokio worker thread pool (`tokio::task::spawn_blocking`).
2. **Spatial Bounding Pre-Filter:** Restrict the SQL airway candidate query to an oriented bounding box between departure and arrival coordinates ($\pm 150\text{ NM}$) to shrink the graph node search space.
3. **Graph Caching:** Cache common airway intersection subgraphs in memory for instant reuse between consecutive route legs.

---

### [RISK-002] GDPR & European Privacy Guidelines Compliance

- **Component / Subsystem:** Data Storage, Telemetry Export & Third-Party Integrations (`src-tauri/src/db.rs`, `SettingsView.tsx`, logs)
- **Category:** Legal & Compliance / Data Privacy (GDPR EU 2016/679 & ePrivacy Directive)
- **Identified:** 2026-11-23
- **Severity:** Medium
- **Status:** Partially Mitigated / Monitored

#### Description
Failure to strictly comply with European Union GDPR requirements regarding personal telemetry data, right to erasure, data minimization, and diagnostic log collection.

#### Trigger Condition
- Users generating high-density GPS track logs containing exact spatial movements, timestamps, and third-party credentials (SimBrief Pilot ID, Navigraph OAuth tokens).
- Exporting diagnostic logs or sharing crash traces that inadvertently contain personal filesystem paths (e.g. `C:\Users\<username>\...`) without sanitization.
- Residual data remaining in SQLite journal files (`.wal`, `.shm`), crash logs, or browser cache after account deletion.

#### Mitigation / Remediation Plan
1. **Right to Erasure (Article 17):** Provide the one-click `wipe_all_user_data` mechanism in Settings (`Backup & Export`) that executes SQLite `VACUUM` and deletes authentication tokens and local state. *(Implemented)*
2. **Data Portability (Article 20):** Maintain standardized JSON backup bundles allowing full export of logbooks, telemetry points, and saved routes without lock-in. *(Implemented)*
3. **Log Sanitization & PII Masking:** Scrub Windows/Unix user paths (replacing `C:\Users\<username>` with `<USER_DIR>`) inside client-side log exports before sharing diagnostics.
4. **Local-First Architecture:** Maintain Apollo Flight's zero-cloud-telemetry architecture so flight tracks are never uploaded to intermediate cloud relays.
5. **Documentation & Consent:** Provide a clear, transparent `PRIVACY.md` policy detailing what data is stored locally and what third-party APIs (SimBrief, Navigraph) receive data.

---

### [RISK-003] Aerobatic Extreme Maneuvers Triggering False Go-Around

- **Component / Subsystem:** Flight Stage Detection State Machine (`src/store/flightStore.ts`)
- **Category:** Aeronautical Logic / False Positive State Transitions
- **Identified:** 2026-11-23
- **Severity:** Low-Medium
- **Status:** Open / Monitored

#### Description
Highly steep aerobatic descents followed by sustained vertical climbs (e.g., loops, Cuban eights, or dive-recovery pull-ups in an Extra 330, Pitts Special, or fighter jet) may register as a `GO_AROUND` if executed below 2,500 ft AGL.

#### Trigger Condition
- Aircraft enters a steep descent ($VS < -400\text{ fpm}$) below 2,500 ft AGL (priming the low-altitude approach descent heuristic).
- Aircraft rapidly initiates a high-G pull-up or vertical climb ($VS > 750\text{ fpm}$) while still below 2,500 ft AGL without landing gear/flaps or runway alignment constraints.

#### Mitigation / Remediation Plan
1. **Attitude Envelope Filtering:** Standard civilian go-arounds maintain wings-level attitudes (bank $< 15^\circ$, pitch $+7^\circ\text{ to }+15^\circ$). Suppress `GO_AROUND` trigger if pitch $> 25^\circ$, pitch $< -10^\circ$, or $|\text{bank}| > 45^\circ$.
2. **Destination / Approach Corridor Gating:** Only allow `GO_AROUND` when within a reasonable terminal approach cone ($\le 10\text{ NM}$ of arrival airport or within 5 NM of an aligned runway threshold).
3. **Aerobatic Airframe Detection:** Detect aerobatic aircraft profiles (e.g. Extra 330, Pitts, Edge 540) via aircraft title string and disable standard airline stage progression.

---

### [RISK-004] Recharts SVG Render Stutter on High Point Count (>20,000 Points)

- **Component / Subsystem:** Telemetry Debrief Chart & UI Scrubbing (`src/components/views/FlightDetailView.tsx`, `src-tauri/src/db/telemetry.rs`)
- **Category:** Performance / UI Thread Responsiveness
- **Identified:** 2026-11-24
- **Severity:** Medium
- **Status:** Open / Monitored

#### Description
Skipped measuring UI thread frame rates on low-end hardware when scrubbing flights with >20,000 points; Recharts SVG re-renders may stutter on long flights unless client-side zooming is applied.

#### Trigger Condition
- User loads a multi-hour airline flight with >20,000 telemetry points.
- Dynamic downsampling (Option A) retains a 75% base point retention rate ($\ge 15{,}000$ points).
- User scrubs the cursor across the Recharts altitude/speed profile chart on lower-spec hardware or systems without dedicated GPU acceleration.

#### Mitigation / Remediation Plan
1. **Client-Side Subsampling / Zoom Windowing:** The frontend `FlightDetailView` applies a stride filter ($\le 1{,}200$ points for full unzoomed track), but deep zoom ranges or fast cursor crosshair scrub operations can still trigger synchronous SVG reflows.
2. **Canvas / WebGL Migration:** If frame drops below 30 fps occur on target devices, migrate the telemetry scrubbing chart from SVG Recharts to an HTML5 Canvas or WebGL engine (such as uPlot or Canvas2D).
3. **Viewport-Aware Pixel Decimation:** Decimate chart samples dynamically so point count never exceeds 1–2 points per horizontal display pixel.

---

### [RISK-005] Microsoft SimConnect SDK Binary Distribution & EULA Compliance

- **Component / Subsystem:** Native SimConnect Engine (`src-tauri/src/simconnect.rs`)
- **Category:** Legal & Licensing / SDK Distribution Rights
- **Identified:** 2026-11-24
- **Severity:** Medium
- **Status:** Open / Monitored

#### Description
Bundling proprietary Microsoft Flight Simulator SDK binaries (`SimConnect.dll`) inside Apollo Flight installer bundles may violate Microsoft SDK redistribution licensing terms.

#### Trigger Condition
- Developing the direct SimConnect engine (Roadmap §3.4) and packaging `SimConnect.dll` directly within the Tauri Windows installer/NSIS bundle.

#### Mitigation / Remediation Plan
1. **Dynamic Runtime Resolution:** Do not bundle `SimConnect.dll`. Instead, dynamically locate and bind to the version installed by MSFS on the user's host machine (via Windows Registry, Side-by-Side WinSxS assembly cache, or the MSFS install directory).
2. **Pure-Rust SimConnect Protocol:** Implement or adopt a pure-Rust SimConnect network client over local TCP/named pipes to avoid redistributing proprietary C/C++ DLLs entirely.


