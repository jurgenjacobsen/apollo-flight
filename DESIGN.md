# Apollo Flight Design Specification & Token Reference

## 1. Brand Identity & Core Principles

### Brand Palette & Surfaces
- **App Name:** Apollo Flight (MSFS Companion & IFR Procedural Trainer)
- **Primary Surface:** `#171717` (Dark Cockpit Ink) / `#ffffff` (Clean Canvas Light)
- **Brand Accent:** `#EF233C` (Apollo Crimson - aircraft origami vector brand color from `Icon.svg` / `Icon.png`)
- **Accent Soft:** `#FEF2F3` (Pale Crimson Wash)
- **Interactive & Links:** `#0070F3` (Vercel Classic Link Blue)
- **Borders & Dividers:**
  - Light mode: `#EBEBEB` (`--geist-hairline`), `#E5E5E5`
  - Dark mode: `#262626` (`--geist-hairline`), `#171717`

### Typography Standards
- **Display & UI Sans:** `Geist` (weights 400, 500, 600) with tight negative tracking (`-0.02em` / `-0.6px` to `-2.4px`) on display headings. Display weights cap at weight 600; never use 700+ or extra-bold weights.
- **Flight Data & Telemetry Figures:** Geist Sans with `tabular-nums` for crisp tabular alignment without awkward monospace letter spacing (altitudes, speeds, vertical rates, navigation frequencies).
- **Technical Monospace:** `Geist Mono` reserved strictly for technical offsets, memory addresses (e.g. FSUIPC `0x0366`), waypoint identifiers, and raw GPS data.

### Component Radii System
- **In-App Controls:** `6px` (`rounded-sm` / `--geist-radius`) for buttons, inputs, dropdowns, and table borders.
- **Card Containers:** `8px` (`rounded-md` / `--geist-marketing-radius`) for dashboards, KPI cards, and telemetry panels.
- **Pill Badges:** `100px` (`rounded-full`) for status indicators, flight stage badges, and mini chips.

### Core Domain Rules
- **Visited Countries Rule:** A country is strictly marked as **visited** only if the user has logged a flight departing from or arriving at an aerodrome located within that sovereign territory. No manual toggle or artificial marking without verified flight activity.
- **Landing Evaluation:** Touchdown ratings and normal load factor ($+X.XX\text{ G}$) are derived from instantaneous vertical sink speed via oleo-pneumatic deceleration physics.

---

## 2. Token Specifications (Geist & Ink System)

### Colors

```yaml
colors:
  primary: "#171717"
  accent: "#EF233C"
  accent-soft: "#fef2f3"
  on-primary: "#ffffff"
  ink: "#171717"
  body: "#4d4d4d"
  mute: "#888888"
  hairline: "#ebebeb"
  hairline-strong: "#a1a1a1"
  canvas: "#ffffff"
  canvas-soft: "#fafafa"
  canvas-soft-2: "#f5f5f5"
  link: "#0070f3"
  link-deep: "#0761d1"
  link-bg-soft: "#d3e5ff"
  success: "#0070f3"
  error: "#ee0000"
  error-soft: "#f7d4d6"
  error-deep: "#c50000"
  warning: "#f5a623"
  warning-soft: "#ffefcf"
  warning-deep: "#ab570a"
  violet: "#7928ca"
  violet-soft: "#d8ccf1"
  violet-deep: "#4c2889"
  cyan: "#50e3c2"
  cyan-soft: "#aaffec"
  cyan-deep: "#29bc9b"
  highlight-pink: "#ff0080"
  highlight-magenta: "#eb367f"
  selection-bg: "#171717"
  selection-fg: "#f2f2f2"
```

### Typography Scale

```yaml
typography:
  display-xl:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 48px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -2.4px
  display-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -1.28px
  display-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.96px
  display-sm:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.6px
  body-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0px
  body-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md-strong:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
  body-sm:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: -0.28px
  body-sm-strong:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.28px
  caption:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  caption-mono:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  code:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  button-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  button-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
```

### Corner Radii

```yaml
rounded:
  none: 0px
  xs: 4px
  sm: 6px              # In-app controls, inputs, buttons, table borders
  md: 8px              # Feature cards, flight detail blocks, dashboard modules
  lg: 12px             # Large containers, modals
  xl: 16px
  pill-sm: 64px
  pill: 100px          # Signature CTA pill
  full: 9999px         # Circular buttons, status indicators, badges
```

### Spacing Scale

```yaml
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  4xl: 64px
  5xl: 96px
  6xl: 128px
  section: 192px
```

### Elevation & Stacked Shadows

The design system stacks subtle offsets rather than dropping a single heavy blur:
1. **Level 0 (Flat):** `none`
2. **Level 1 (Hairline Inset):** `inset 0 0 0 1px rgba(0, 0, 0, 0.08)` (Light) or `inset 0 0 0 1px rgba(255, 255, 255, 0.12)` (Dark).
3. **Level 2 (Subtle Drop):** `0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 1px rgba(0, 0, 0, 0.06)`.
4. **Level 3 (Soft Stack - Standard Cards):** `0 2px 4px rgba(0, 0, 0, 0.04), 0 8px 16px rgba(0, 0, 0, 0.06)`.
5. **Level 4 (Float Stack - Menus & Modals):** `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 16px 32px -4px rgba(0, 0, 0, 0.12)`.

---

## 3. Component Specifications

### In-App Navigation & Controls
- **`nav-button`:**
  - Background: `{colors.canvas}` or `{colors.primary}`
  - Border: 1px solid `{colors.hairline}`
  - Height: `28px` to `32px`
  - Shape: `{rounded.sm}` (6px)
  - Typography: `{typography.body-sm-strong}`
- **`custom-select`:**
  - Custom accessible replacement for native `<select>` dropdowns.
  - Trigger: height `32px`, padding `0 10px`, border 1px solid `{colors.hairline}`, radius `6px`.
  - Dropdown Menu: animated fade/zoom, Level 4 elevation stack, maxHeight `260px` with custom scrollbar.
  - Option items: padding `6px 10px`, radius `4px`, hover background `{colors.canvas-soft-2}`.

### Flight Telemetry & Instrument Cards
- **`kpi-stat-card`:**
  - Background: `{colors.canvas}` / `{colors.primary}`
  - Border: 1px solid `{colors.hairline}`
  - Shape: `{rounded.sm}` (6px)
  - Layout: Icon + uppercase 11px label, large 20px `tabular-nums` value, and inline unit.
- **`export-dropdown-menu`:**
  - Width: `256px` (`w-64`)
  - Shape: `{rounded.sm}` (6px)
  - Elevation: Level 4 floating shadow (`shadow-xl`)
  - Items: Icon badge with dedicated pastel background (Sky for GPX, Emerald for KML, Amber for GeoJSON, Purple for CSV), format title, and description.

### Form Inputs
- **`form-input`:**
  - Height: `32px` (compact) or `40px` (standard)
  - Shape: `{rounded.sm}` (6px)
  - Border: 1px solid `{colors.hairline}`
  - Focus state: border `{colors.ink}` (or `{colors.link}`), no heavy glow rings.
