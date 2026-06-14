# AMR Implementation Roadmap

Last updated: 2026-06-09

## Stage 0: Preserve And Scaffold

- [x] Preserve the dirty workspace in commit `1d032ef0`.
- [x] Tag upstream baseline `pre-clean-upstream-2026-06-09`.
- [x] Archive legacy Vue, parity Svelte, platform prototype, and stable reference.
- [x] Remove generated dependencies, builds, backups, and logs.
- [x] Create npm workspace.
- [x] Scaffold WXT and Svelte extension.
- [x] Create contracts, source SDK, sources, and fixture packages.
- [x] Move active documentation under `docs/`.
- [ ] Add strict linting.
- [ ] Add extension unit tests.
- [ ] Add Chromium browser harness.
- [ ] Add Firefox browser harness.
- [ ] Add fixture source server.
- [ ] Add manifest policy checks.
- [ ] Add browser failure artifact collection.

Exit:

- [ ] Empty extension installs automatically in Chromium tests.
- [ ] Empty extension installs automatically in Firefox tests.

## Stage 1: Reader Vertical Slice

### Foundation

- [ ] Add domain Zod schemas.
- [ ] Implement source registry with lazy loading.
- [ ] Implement bounded request client.
- [ ] Add safe HTML and script-literal parsing.
- [ ] Add Dexie database and migrations.

### MangaDex

- [ ] Add search fixtures.
- [ ] Add manga fixtures.
- [ ] Add chapter fixtures.
- [ ] Add page fixtures.
- [ ] Port MangaDex adapter.
- [ ] Add live canary.

### Reader

- [ ] Detect MangaDex manga and chapter URLs.
- [ ] Request host permission.
- [ ] Auto-add manga with undo.
- [ ] Open extension reader page.
- [ ] Add continuous mode.
- [ ] Add single-page mode.
- [ ] Add bounded image scheduler.
- [ ] Add previous and next chapter.
- [ ] Add keyboard shortcuts.
- [ ] Save and restore progress.

### Validation

- [ ] Chromium install, read, restart, and resume.
- [ ] Firefox install, read, restart, and resume.
- [ ] Long-chapter memory test.
- [ ] Offline behavior test.

## Stage 2: Local Product

- [ ] Popup current-page actions.
- [ ] Home.
- [ ] Library.
- [ ] Manga details.
- [ ] Search.
- [ ] Add by URL.
- [ ] Updates.
- [ ] Sources.
- [ ] Settings.
- [ ] Diagnostics.
- [ ] Manual update checks.
- [ ] Alarm-based update checks.
- [ ] Import and export.
- [ ] 1,000 and 10,000 record performance tests.

## Stage 3: Source Coverage

- [ ] Weeb Central.
- [ ] Dynasty Scans.
- [ ] One Madara family.
- [ ] Komga.
- [ ] Tachidesk.
- [ ] Generic template schema.
- [ ] Generic site wizard.
- [ ] Nightly source health checks.
- [ ] GitHub issue automation for broken sources.

## Stage 4: Local Features

- [ ] Reading history.
- [ ] Active reading time.
- [ ] Local achievements.
- [ ] Statistics.
- [ ] Goals and streaks.
- [ ] Bookmarks and tags.
- [ ] Local share cards.

## Stage 5: GitHub Distribution

- [ ] Chromium unpacked ZIP.
- [ ] Firefox XPI.
- [ ] Mozilla unlisted signing automation.
- [ ] GitHub Release workflow.
- [ ] SHA-256 checksums.
- [ ] Release notes.
- [ ] In-extension GitHub version check.
- [ ] Previous-version upgrade tests.
- [ ] Legacy import tests.
