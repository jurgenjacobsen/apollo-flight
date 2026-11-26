# Third-Party Notices & Licenses

Apollo Flight is licensed under the [MIT License](LICENSE). The application bundles or interfaces with the following third-party libraries, models, and datasets:

---

## 1. Vosk Offline Speech Recognition & Acoustic Model (`models/`)

- **Components:** `libvosk.dll` (Vosk API) and `vosk-model-small-en-us-0.15` (Kaldi English acoustic model)
- **Copyright:** Copyright 2020 Alpha Cephei Inc.
- **License:** Apache License, Version 2.0 ([http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0))
- **Notice:** Bundled unmodified under `models/` for 100% offline cockpit checklist voice recognition. See [`models/LICENSE`](models/LICENSE) for the full Apache-2.0 license text.

---

## 2. MinGW-w64 Runtime Libraries (`models/*.dll`)

- **Components:**
  - `libgcc_s_seh-1.dll`, `libstdc++-6.dll` — GNU Compiler Collection (GCC) Runtime Libraries, licensed under the **GNU General Public License v3.0 with the GCC Runtime Library Exception 3.1**.
  - `libwinpthread-1.dll` — MinGW-w64 `winpthreads` library, licensed under the **MIT / BSD-3-Clause** license.
- **Purpose:** Required Windows runtime dependencies for `libvosk.dll`.

---

## 3. Global Airport & Runway Dataset (`data/`)

- **Components:** `data/airports.csv`, `data/runways.csv`, `data/countries.csv` (OurAirports)
- **License:** Public Domain Dedication (**CC0 1.0 Universal**)

---

## 4. Satellite Base Maps

- **Provider:** ArcGIS World Imagery (Esri)
- **Terms:** Accessed online under Esri Developer Terms with mandatory on-map attribution:
  `Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community`

---

## 5. Simulator & Navigation Integrations

- **`fsuipc` Rust crate (v0.5.1):** MIT / Apache-2.0. Interfaces with user-installed FSUIPC7 via Windows shared-memory IPC (FSUIPC7 itself is not bundled or redistributed).
- **Navigraph DFD v2 / SimBrief API:** Accessed strictly via user-supplied credentials / PKCE OAuth 2.0; no proprietary AIRAC datasets are redistributed.
