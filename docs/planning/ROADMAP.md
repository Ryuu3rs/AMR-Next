# AMR Implementation Roadmap

Last updated: 2026-06-17

> **Status:** v0.5.0 shipped. Active: 0.6.x — shipped: MangaNato adapter, 8 new Madara sites, E4 update check, I3 raw-fetch fix, Weeb Central adapter (ULID routing), mangaread.org image extraction (src-first + whitespace trim), wildcard-origins crash fix, infinite cover-backfill loop fix, CSP modulepreload polyfill disabled. See `AUDIT_AND_RELEASE_PLAN.md` §5 for the full phasing plan.

## Stage 0: Preserve And Scaffold (0.2.0–0.3.0)

✅ Core scaffolding complete:

- [x] Preserve the dirty workspace in commit `1d032ef0`.
- [x] Tag upstream baseline `pre-clean-upstream-2026-06-09`.
- [x] Archive legacy Vue, parity Svelte, platform prototype, and stable reference.
- [x] Remove generated dependencies, builds, backups, and logs.
- [x] Create npm workspace.
- [x] Scaffold WXT and Svelte extension.
- [x] Create contracts, source SDK, sources, and fixture packages.
- [x] Move active documentation under `docs/`.
- [x] Add ESLint (typescript-eslint + svelte plugin, 0.3.0).
- [x] Add extension unit tests (adapter fixtures, database tests, runtime tests).
- [x] Add manifest policy checks.
- [ ] Add Chromium browser harness (blocking: Chromium install in CI).
- [ ] Add Firefox browser harness (blocking: Firefox install in CI).
- [ ] Add fixture source server.
- [ ] Add browser failure artifact collection.

Exit (pending):

- [ ] Empty extension installs automatically in Chromium tests (blocked).
- [ ] Empty extension installs automatically in Firefox tests (blocked).

## Stage 1: Reader Vertical Slice (0.2.0–0.3.0)

✅ Reader + MangaDex complete:

### Foundation

- [x] Add domain Zod schemas.
- [x] Implement source registry with lazy loading.
- [x] Implement bounded request client.
- [x] Add safe HTML and script-literal parsing.
- [x] Add Dexie database and migrations.

### MangaDex

- [x] Add search fixtures.
- [x] Add manga fixtures.
- [x] Add chapter fixtures.
- [x] Add page fixtures.
- [x] Port MangaDex adapter.
- [x] Add live canary.

### Reader

- [x] Detect MangaDex manga and chapter URLs.
- [x] Request host permission.
- [x] Auto-add manga with undo.
- [x] Open extension reader page.
- [x] Add continuous mode (0.2.0).
- [x] Add single-page mode (0.2.0).
- [x] Add bounded image scheduler.
- [x] Add previous and next chapter (0.3.0).
- [x] Add keyboard shortcuts.
- [x] Save and restore progress.

### Validation (pending browser harnesses)

- [ ] Chromium install, read, restart, and resume.
- [ ] Firefox install, read, restart, and resume.
- [ ] Long-chapter memory test.
- [ ] Offline behavior test.

## Stage 2: Local Product (0.2.0–0.5.0)

✅ Library + tracking + multi-source complete:

- [x] Popup current-page actions.
- [x] Home (0.4.0).
- [x] Library with grid/list views (0.5.0).
- [x] Manga details (0.4.0).
- [x] Multi-source search (0.5.0).
- [x] Add by URL (0.4.0).
- [x] Updates tab with per-source refresh (0.2.0).
- [x] Sources diagnostics (0.4.0).
- [x] Settings.
- [x] Diagnostics panel (0.4.0).
- [x] Manual update checks (0.2.0).
- [x] Alarm-based update checks (0.2.0).
- [x] Import and export with Zod validation (0.2.0).
- [x] 1,000 and 10,000 record performance tests (0.2.0).

## Stage 3: Source Coverage (1.0.0+)

⏳ Generic adapters + hardening:

- [x] Generic Madara template (multiple sites via config, 0.5.0).
- [x] Generic MangaStream/ts template (0.5.0).
- [x] Generic MangaBuddy template (0.5.0).
- [x] MangaNato / ChapMangaNato adapter (0.6.0) — covers chapmanganato.com/to, manganato.com, chapmanganelo.com.
- [x] 8 additional Madara config rows (0.6.0) — aquascans, lhtranslation, harimanga, manhuaus, s2manga, utoon, mangasushi, manhuatop.
- [x] Weeb Central (0.6.0) — ULID-based IDs, series + chapter page + images endpoint.
- [x] Dynasty Scans (0.6.x) — bespoke adapter, `var pages = [...]` JSON extraction, search support.
- [ ] FanFox (fanfox.net — 23 user entries, deferred: encrypted chapter pages via chapterfun.ashx).
- [ ] Komga (self-hosted, 2.0).
- [ ] Tachidesk (self-hosted, 2.0).
- [x] Nightly source health checks (0.5.0).
- [ ] GitHub issue automation for broken sources.

## Stage 4: Local Features (1.x–2.0)

⏳ Tracking depth + analytics:

- [x] Reading history with grouped view (0.5.0).
- [ ] Active reading time.
- [x] Local achievements (0.5.0).
- [x] Statistics (0.5.0).
- [ ] Goals and streaks.
- [ ] Bookmarks (per-page, 1.2).
- [x] Tags system (0.5.0).
- [ ] Local share cards.

## Stage 5: GitHub Distribution (0.2.0–1.0.0)

✅ Release automation + signed builds:

- [x] Chromium unpacked ZIP (0.2.0).
- [x] Firefox XPI (0.2.0).
- [x] Mozilla unlisted signing automation hook (0.2.0).
- [x] GitHub Release workflow (0.2.0).
- [x] SHA-256 checksums (0.2.0).
- [x] Release notes (0.2.0).
- [x] In-extension GitHub version check (0.6.0) — background check + dismissible banner.
- [ ] Previous-version upgrade tests.
- [ ] Legacy import tests.
