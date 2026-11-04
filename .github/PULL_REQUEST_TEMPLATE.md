## Summary of Changes

A concise description of what this pull request changes and why.

- 

## Related Issue

Closes #<!-- issue number if applicable -->

## Type of Change

- [ ] **Bug fix** (non-breaking change which fixes an issue)
- [ ] **New feature** (non-breaking change which adds functionality)
- [ ] **Performance improvement** (optimizations to telemetry sampling, database queries, or UI rendering)
- [ ] **UI / UX enhancement** (visual design, layout adjustments, dark/light theme polish)
- [ ] **Database / Navdata** (schema migrations, airport data handling)
- [ ] **Documentation** (updates to guides, README, or code documentation)

## Verification & Testing

### Flight Simulator Environment
- **Simulator Used:**
  - [ ] Microsoft Flight Simulator 2024
  - [ ] Microsoft Flight Simulator 2020
  - [ ] Prepar3D / FSX
  - [ ] None (Frontend / Standalone testing)
- **Aircraft Tested:** <!-- e.g., Fenix A320, PMDG 738, Default C172 -->
- **FSUIPC Version:** <!-- e.g., FSUIPC7 v7.4.x -->

### Manual Test Steps
1. 
2. 
3. 

## Screenshots or Screen Recordings (if applicable)

<!-- Add before/after screenshots or GIFs for UI changes -->

## Pre-Merge Checklist

- [ ] My code adheres to the project's coding and style guidelines.
- [ ] I have tested changes in both **Dark Mode** and **Light Mode**.
- [ ] `npx tsc --noEmit` passes with 0 TypeScript errors.
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` passes with 0 Rust compilation errors.
- [ ] Any new or modified database operations preserve user data integrity in `logbook.db`.
- [ ] No extraneous console logs, sensitive paths, or temporary files are left in the codebase.
