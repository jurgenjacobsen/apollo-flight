# Apollo Flight: Feature Proposals & Roadmap Suggestions (`SUGGESTIONS.md`)

This document outlines new features, architectural evolutions, and functional modules proposed for **Apollo Flight**. Each proposal is formatted with technical specifications, schema requirements, UI/UX design, and the engineering/aviation reasoning behind why it adds substantial value to the application.

---

## Table of Contents
1. [Module 1: Real-Time In-Flight Moving Map & Airspace Visualizer](#module-1-real-time-in-flight-moving-map--airspace-visualizer)
2. [Module 2: Stabilized Approach Monitor & Runway Touchdown Footprint](#module-2-stabilized-approach-monitor--runway-touchdown-footprint)
3. [Module 3: SimBrief Dispatch Integration & Operational Flight Plan (OFP) Importer](#module-3-simbrief-dispatch-integration--operational-flight-plan-ofp-importer)
4. [Module 4: Flight Data Monitoring (FDM) & Safety Exceedance Scoring Engine](#module-4-flight-data-monitoring-fdm--safety-exceedance-scoring-engine)
5. [Module 5: Pilot Currency, Endorsements & Legal Hours Breakdown](#module-5-pilot-currency-endorsements--legal-hours-breakdown)
6. [Module 6: Weight & Balance (W&B) and Performance Envelope Calculator](#module-6-weight--balance-wb-and-performance-envelope-calculator)
7. [Module 7: Automated Interactive Cockpit Checklists & SimVar Binds](#module-7-automated-interactive-cockpit-checklists--simvar-binds)
8. [Module 8: Synthetic GPWS, Callouts & Audio Co-Pilot Engine](#module-8-synthetic-gpws-callouts--audio-co-pilot-engine)
9. [Module 9: Interactive Flight Replay & Virtual Flight Data Recorder (FDR)](#module-9-interactive-flight-replay--virtual-flight-data-recorder-fdr)
10. [Module 10: In-Flight Diversion & Emergency Alternate Assistant](#module-10-in-flight-diversion--emergency-alternate-assistant)
11. [Module 11: Local WiFi Remote Companion (Tablet / EFB Secondary Screen)](#module-11-local-wifi-remote-companion-tablet--efb-secondary-screen)
12. [Module 12: Real-World METAR / TAF Weather Overlay Engine](#module-12-real-world-metar--taf-weather-overlay-engine)

---

## Module 1: Real-Time In-Flight Moving Map & Airspace Visualizer

### 1. Feature Description
A dedicated full-screen live moving map accessible while MSFS is running. It tracks the aircraft's current GPS position with smooth vector interpolation, showing aircraft heading, ground speed, track history breadcrumbs, surrounding aerodromes, and instrument flight corridors.

### 2. Technical Implementation
* **Map Center Mode:** Auto-center on aircraft with toggleable heading-up vs north-up orientation.
* **Vector Overlays:** Renders nearest aerodromes (derived from embedded SQLite `airports` table within a dynamic bounding box query) with runway orientations drawn as real magnetic headings.
* **Range Rings & Gliding Cone:** 
  * Configurable range rings (5 NM, 10 NM, 20 NM).
  * Best-glide footprint circle calculated from current AGL altitude and aircraft category glide ratio (e.g., 9:1 for Cat A GA, 17:1 for Cat C/D jets).

### 3. Reasoning & User Value
Simmers flying single-monitor setups or VR frequently require an external moving map to verify airway positions and traffic without opening sluggish simulator menus. Integrating this natively into Apollo Flight eliminates the need for third-party subscriptions like Navigraph Charts for basic orientation.

---

## Module 2: Stabilized Approach Monitor & Runway Touchdown Footprint

### 1. Feature Description
Expands the existing touchdown G-force and sink-rate system into a comprehensive landing analysis suite that evaluates approach stability gates (1000 ft AGL and 500 ft AGL) and calculates exact runway centerline deviation and threshold touchdown distance.

### 2. Technical Implementation
* **Runway Alignment Math:**
  * Uses the arrival airport's runway data from `airports` table (lat/lon thresholds, runway bearing, runway width/length).
  * Projects touchdown coordinate onto the runway vector:
    $$\Delta x_{\text{centerline}} = d \cdot \sin(\theta_{\text{track}} - \theta_{\text{runway}})$$
    $$d_{\text{threshold}} = d \cdot \cos(\theta_{\text{track}} - \theta_{\text{runway}})$$
* **Stabilized Approach Gates (ICAO / FAA Standard):**
  * Evaluates airspeed ($V_{\text{REF}} - 5\text{ kt} \le V \le V_{\text{REF}} + 15\text{ kt}$), sink rate ($\le 1,000\text{ fpm}$), lateral deviation, and configuration (gear down, flaps extended) at 1,000 ft (IMC) and 500 ft (VMC).
* **Visual Presentation:** A top-down 2D canvas of the runway strip showing touchdown box markers, centerlines, and the precise tire touchdown footprint with meters/feet deviation badges.

### 3. Reasoning & User Value
Virtual pilots love analyzing landing performance. While vertical rate (fpm) is informative, a "butter" landing that touches down 3,000 ft past the threshold or 20 meters off-center is hazardous in real aviation. Combining G-force, sink rate, centerline accuracy, and approach stability provides an authentic pilot debriefing tool.

---

## Module 3: SimBrief Dispatch Integration & Operational Flight Plan (OFP) Importer

### 1. Feature Description
Allows users to enter their SimBrief Pilot ID or username in Settings and fetch their latest generated SimBrief Operational Flight Plan with one click. Automatically populates the active route, planned cruising altitude, fuel requirements, block times, and alternate airports into Apollo Flight.

### 2. Technical Implementation
* **SimBrief XML/JSON API:**
  * Endpoint: `https://www.simbrief.com/api/xml.fetcher.php?userid={PILOT_ID}&json=1`.
* **State Bridge:**
  * Maps SimBrief waypoint sequence and airways into Apollo's `SavedRoute` format.
  * Captures planned fuel, zero fuel weight (ZFW), payload, and contingency reserves.
* **Auto-Comparison:** During flight, compares actual fuel remaining and time against SimBrief waypoint fixes in real time.

### 3. Reasoning & User Value
SimBrief is the standard flight dispatcher for 90%+ of flight simmers. Manual waypoint entry between apps causes friction. One-click synchronization connects dispatching directly into Apollo Flight's route manager and telemetry logger.

---

## Module 4: Flight Data Monitoring (FDM) & Safety Exceedance Scoring Engine

### 1. Feature Description
An airline-style Flight Data Monitoring (FDM) system (similar to FOQA) that monitors aircraft limitations throughout every flight phase and scores flight safety from 0 to 100 points, flagging specific operational exceedances.

### 2. Monitored Exceedances
* **Airspeed & Flap Limits:** Flap overspeed, gear extension overspeed ($V_{\text{LE}} / V_{\text{LO}}$), and $V_{\text{NE}} / M_{\text{MO}}$ exceedances.
* **Bank & Pitch Attitudes:**
  * Bank angle $> 30^\circ$ below 1,000 ft AGL or $> 45^\circ$ enroute.
  * Pitch attitude $> 20^\circ$ nose-up or $> 10^\circ$ nose-down during approach.
* **Ground Handling Safety:**
  * Taxi speed $> 30\text{ kt}$ on straight taxiways or $> 15\text{ kt}$ during turns.
  * Braking while ground speed $> 80\text{ kt}$ without reverse thrust / spoilers deployed.
* **Lighting Compliance:** Landing lights extinguished above FL100 or unlit below FL100.

### 3. Reasoning & User Value
Adds gamification and professional flight discipline. Instead of just logging hours, simmers are motivated to fly according to Standard Operating Procedures (SOP), receiving clear feedback on what they did well and where rules were breached.

---

## Module 5: Pilot Currency, Endorsements & Legal Hours Breakdown

### 1. Feature Description
A dedicated "Pilot License & Currency" dashboard page that tracks real-world FAA / EASA regulatory currencies, category endorsements, and flight experience hours breakdown.

### 2. Currency Calculators
* **Passenger Carrying Currency (90-Day Rule):** Requires 3 takeoffs and landings in category/class within the preceding 90 days (separated by Day vs Night).
* **IFR Currency (FAA 6-HITS Rule):** Tracks 6 instrument approaches, holding procedures, and radial tracking within the past 6 calendar months.
* **Hours Categorization:**
  * Total Time (PIC / Dual / Solo).
  * Cross-Country (XC) Hours ($> 50\text{ NM}$ point-to-point).
  * Night Hours (computed from sunset/sunrise civil twilight algorithms using airport coordinates).
  * Instrument Time (simulated IMC when in clouds / low visibility).

### 3. Reasoning & User Value
Flight simmers training for real Private Pilot (PPL) or Instrument Ratings (IR) want to track their progress against actual aviation milestones. This transforms Apollo Flight from a simple telemetry viewer into a pilot logbook.

---

## Module 6: Weight & Balance (W&B) and Performance Envelope Calculator

### 1. Feature Description
An interactive Center of Gravity (CG) and fuel consumption dispatch tool. Users can configure passenger loads, cargo weight, and fuel distribution across aircraft station arms, displaying real-time CG movement throughout the flight.

### 2. Technical Implementation
* **Moment & Arm Matrix:**
  $$\text{Total Moment} = \sum (\text{Weight}_i \times \text{Arm}_i), \quad \text{CG} = \frac{\text{Total Moment}}{\text{Total Weight}}$$
* **Envelope Visualization:** Interactive Canvas chart plotting Takeoff CG and Landing CG against the forward and aft CG envelope limits for the selected category.
* **Live Fuel CG Drift:** As fuel burns during the flight, tracks the dynamic shift in CG position to alert the user if fuel exhaustion will push the aircraft out of trim limits.

### 3. Reasoning & User Value
Weight and balance is a fundamental aspect of flight planning that is often overlooked in flight tracking tools. Providing a visual CG envelope educates simmers and ensures realistic aircraft loading before takeoff.

---

## Module 7: Automated Interactive Cockpit Checklists & SimVar Binds

### 1. Feature Description
Interactive normal, abnormal, and emergency checklists for general aviation and airliners with automated SimVar detection. Items automatically check off when the pilot physically flips the switch or sets the lever in MSFS.

### 2. Technical Implementation
* **FSUIPC Sensor Binds:**
  * *"Parking Brake — SET"*: Auto-checks when offset `0x0BC8` equals 32767.
  * *"Pitot Heat — ON"*: Auto-checks when offset `0x029C` bit 0 is 1.
  * *"Flaps — RETRACT"*: Auto-checks when flap handle offset `0x0BDC` is 0.
  * *"Avionics Master — ON"*: Auto-checks when offset `0x2E80` is 1.
* **Manual Override & Audio Confirmation:** Keyboard shortcut (Space / Enter) for items without simulator offsets, accompanied by subtle cockpit chime audio.

### 3. Reasoning & User Value
Reading PDF checklists on a separate phone or browser is cumbersome. Checklists that automatically listen to simulator inputs streamline workflow, reduce cockpit workload, and ensure procedures are performed sequentially.

---

## Module 8: Synthetic GPWS, Callouts & Audio Co-Pilot Engine

### 1. Feature Description
A zero-dependency browser Web Audio synthetic sound system delivering realistic Ground Proximity Warning System (GPWS) and co-pilot vocal callouts directly through the user's headphones or speakers.

### 2. Standard Callout Library
* **Takeoff Callouts:**
  * *"80 Knots"* (airspeed crosscheck).
  * *"V1"* (decision speed).
  * *"Rotate"* ($V_R$).
  * *"Positive Rate — Gear Up"*.
* **Approach & Landing Callouts:**
  * *"Approaching Minimums"*, *"Minimums"*.
  * Altitude countdown: *"500"*, *"400"*, *"300"*, *"200"*, *"100"*, *"50"*, *"40"*, *"30"*, *"20"*, *"10"*, *"Retard"*.
* **GPWS Warnings:**
  * *"Sink Rate"*, *"PULL UP"*.
  * *"Bank Angle"*.
  * *"Glide Slope"*.

### 3. Technical Implementation
* Built using the Web Audio API with synthesized low-latency audio buffers or bundled high-fidelity sound clips.
* Triggered deterministically inside the state machine based on `altitudeAgl` rate of change and ground proximity.

### 4. Reasoning & User Value
Many default and freeware MSFS aircraft lack realistic GPWS audio or co-pilot callouts. Adding this client-side creates a high-end airliner immersion layer with zero simulator performance penalty.

---

## Module 9: Interactive Flight Replay & Virtual Flight Data Recorder (FDR)

### 1. Feature Description
A synchronized flight replay tool that allows users to review any previously recorded flight in their logbook with playback controls (Play, Pause, 1x, 2x, 4x, 8x, scrubber timeline) and a virtual Primary Flight Display (PFD).

### 2. Technical Implementation
* **Virtual PFD Canvas:**
  * Artificial Horizon (pitch ladder, bank index, roll pointer).
  * Speed tape (IAS) and altitude tape (MSL & AGL) with vertical speed needle.
* **Map Synchronization:**
  * Moves the aircraft icon along the recorded Leaflet track in sync with the replay timestamp.
  * Displays instantaneous G-force and control inputs.

### 3. Reasoning & User Value
Pilots learn most by reviewing their mistakes. A full flight replay system allows pilots to inspect steep turns, stall recoveries, holding patterns, and landing flares second-by-second after shutting down their engines.

---

## Module 10: In-Flight Diversion & Emergency Alternate Assistant

### 1. Feature Description
An emergency in-flight utility that can be summoned with one click during an ongoing flight to instantly solve and rank the best emergency diversion airports within gliding or remaining fuel range.

### 2. Solving Criteria
* **Proximity & Direct Distance:** Computes great-circle bearing and distance to all aerodromes within 100 NM.
* **Runway Capability Filter:** Filters out runways too short for the active aircraft category (e.g., eliminates 2,000 ft grass strips for Cat D jets).
* **Fuel vs Distance Budget:** Estimates fuel burn to reach the airfield plus 30-minute reserve.
* **Direct Vector Guidance:** Provides immediate magnetic heading to fly and descent profile (3° descent path required).

### 3. Reasoning & User Value
Simulating emergencies (engine failures, weather deterioration, low fuel) is a cornerstone of IFR and procedural training. Having an instantaneous emergency dispatch calculator provides critical decision-support during high-workload scenarios.

---

## Module 11: Local WiFi Remote Companion (Tablet / EFB Secondary Screen)

### 1. Feature Description
An embedded lightweight local HTTP server hosted by the Tauri Rust backend that serves a mobile-responsive Electronic Flight Bag (EFB) web page over the local network (`http://192.168.x.x:3456`). Users can open the URL on an iPad, Android tablet, or smartphone.

### 2. Technical Implementation
* **Rust Backend (`src-tauri`):**
  * Lightweight web server using `tiny_http` or embedded `axum` listening on an ephemeral port.
  * Serves pre-built static client assets for remote view.
  * WebSocket or Server-Sent Events (SSE) streaming live telemetry at 2 Hz.
* **Remote EFB Features:**
  * Live moving map.
  * Real-time flight instruments & telemetry data.
  * Checklist viewer with toggleable checkmarks.

### 3. Reasoning & User Value
Almost all dedicated flight simmers own a tablet and prefer mounting it next to their flight yoke or joystick as a dedicated EFB. This enables true multi-device simulation without requiring third-party window management software.

---

## Module 12: Real-World METAR / TAF Weather Overlay Engine

### 1. Feature Description
Fetches and decodes real-time METAR and TAF weather observations for origin, destination, alternate, and enroute aerodromes directly within the Logbook, Route Generator, and Dashboard.

### 2. Technical Implementation
* **Free Public APIs:**
  * Primary: Aviation Weather Center (AWC / NOAA API: `https://aviationweather.gov/api/data/metar`).
  * Secondary fallback: Open-Meteo / VATSIM weather cache.
* **Decoded Output:**
  * Raw METAR string (e.g., `KJFK 051251Z 31012KT 10SM BKN045 08/M02 A3012 RMK AO2`).
  * Human-readable breakdown: Wind direction/speed, Flight Category badge (`VFR` Green, `MVFR` Blue, `IFR` Red, `LIFR` Magenta), visibility, ceiling, and altimeter setting.
  * Headwind / Crosswind calculator based on selected runway heading.

### 3. Reasoning & User Value
Aviation begins and ends with weather. Having weather parsed and integrated alongside runway selection allows pilots to automatically calculate crosswind components and make realistic go/no-go decisions before departure.

---

## Summary Matrix of Proposed Implementations

| Proposal | Module Title | Primary Audience | Complexity | Backend Changes |
| :---: | :--- | :--- | :---: | :---: |
| **M-01** | Real-Time Moving Map & Airspaces | All Simmers | Medium | Minimal (uses existing telemetry) |
| **M-02** | Stabilized Approach & Touchdown Footprint | Performance & Airliner Pilots | Medium | Frontend Canvas + Runway math |
| **M-03** | SimBrief OFP Dispatch Importer | Airliner & Virtual Airline Simmers | Low | SimBrief API client in Rust/TS |
| **M-04** | Flight Data Monitoring (FDM) Safety Scoring | Virtual Airlines & Students | Medium | State machine rule checker |
| **M-05** | Pilot Currency & Legal Hours Breakdown | Real Student Pilots & Simmers | Low | SQLite aggregation queries |
| **M-06** | Weight & Balance (W&B) CG Calculator | GA & Regional Pilots | Medium | Frontend Canvas envelope math |
| **M-07** | Cockpit Checklists with SimVar Binds | High-Immersion Simmers | Medium | Expanded FSUIPC read offsets |
| **M-08** | Synthetic GPWS & Co-Pilot Callouts | Airliner Pilots | Low | Web Audio API synthesize |
| **M-09** | Interactive Flight Replay (FDR) | Student Pilots & Debriefing | High | Telemetry replay clock & PFD Canvas |
| **M-10** | In-Flight Diversion & Alternate Assistant | IFR Pilots & Emergency Training | Low | Aerodrome spatial query |
| **M-11** | Local WiFi Tablet Companion (EFB) | Multi-Device Simmers | High | Embedded Rust HTTP/WS server |
| **M-12** | Live METAR / TAF Weather & Crosswinds | All Simmers | Low | Free NOAA/AWC Weather API fetcher |
