### Phase 19: Testing Unit & Error Management
We should have a testing unit standalone application/script which allows the development team to test the app without being actually in the game, simulating a FSUIPC bridge.
Implementation of UI usage testing should also be something to look into.

- [ ] Replace the default Vite error page with a custom error page or modal depending on the error. Any other error or issues such as handling problems at the backend should also be notified to the user as modals instead of banners inside the page UI;

[ Feature description will be added here ]

### Phase 20: Onboarding Update
Before launching the app as totally ready for use, we should implement an onboarding page/flow which allow people to understand how the app works, where they can find information/settings, and how they could configure the app for better usage.

### Phase 99: Eventual Changes (not planned in short future)
- [ ] Abstract database repository layer using Rust traits (`FlightRepository`).
- [ ] Plan JWT auth / Supabase / PostgreSQL schema alignment so local SQLite syncs transparently to remote backend.
- [ ] Voice Recognition for Checklists (Virtual Co-Pilot): Interactive voice-driven co-pilot for checklists. Pilot calls checklist sections (e.g., *"Before take-off checklist"*), Apollo speaks challenges via TTS, recognizes verbal responses via STT, checks off completed items, and advances sections hands-free. (Detailed technical spec in [VOICE_CHECKLISTS_SPEC.md](VOICE_CHECKLISTS_SPEC.md)).
