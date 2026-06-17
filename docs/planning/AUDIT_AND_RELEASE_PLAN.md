# AMR — Codebase Audit, Feature Backlog & Release/Versioning Plan

Last updated: 2026-06-17
Branch at time of writing: `main`
Status: **v0.6.x active** (release-please). 0.6.x patch series complete: MangaNato adapter, 8 Madara config rows, Weeb Central adapter, mangaread.org image-extraction fix, wildcard-origins crash fix, chapterRe trailing-slash fix, CSP modulepreload fix, cover backfill loop fix, GitHub update-check banner (E4). All correctness issues (I2–I9) resolved. Path to 1.0.0: ① AMO secrets in GitHub (user action) + ② Release PR merge.

---

## 1. Issues In The Current Codebase

### 1.1 Correctness / risk (fix first)

| #     | Issue                                                                                                                                                                                                  | Location                                     | Impact                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------- |
| I1    | `importDatabase()` accepts `unknown` and hand-casts the envelope — no Zod validation. A malformed/old export can corrupt the DB or throw mid-transaction.                                              | `apps/extension/src/database.ts` (~L112-138) | Data loss on import          |
| ✅ I2 | Permission origins centralized in `permissions.ts` (`SOURCE_ORIGINS`); both `app/App.svelte` and `popup/App.svelte` import `sourceOrigins()` — no duplication.                                         | `apps/extension/src/permissions.ts`          | Resolved                     |
| ✅ I3 | `search()` added to `SourceAdapter` contract as optional method; MangaDex + Madara implement it; extension aggregates across all searchable sources.                                                   | `packages/source-sdk/src/types.ts`           | Resolved                     |
| ✅ I4 | `listChapters()` **throws "not supported"** for mangaread + mgeko — **resolved for mangaread** (generic Madara adapter now handles chapter listing and image extraction). mgeko listing still pending. | `mgeko.ts` L197                              | Updates never work for mgeko |
| ✅ I5 | Rate limiting enforced: `waitForRateSlot()` spaces requests using `minIntervalMs` from manifest; no unbounded bursts.                                                                                  | `packages/source-sdk/src/request.ts`         | Resolved                     |
| ✅ I6 | Retry with exponential backoff implemented: `attemptWithRetries()` retries 429/5xx/timeouts with `retryBaseDelayMs * 2^attempt + jitter`.                                                              | `packages/source-sdk/src/request.ts`         | Resolved                     |
| ✅ I7 | Update failures surfaced in the Updates tab: `updateStatus?.errors` shows failed title names + reasons (were `console.warn`-only).                                                                     | `apps/extension/entrypoints/app/App.svelte`  | Resolved                     |
| I8    | Reader image fallback regex is MangaDex-specific and brittle; non-MangaDex failures just warn with no recovery.                                                                                        | `reader/App.svelte` L69-75                   | Dead images, no retry        |
| ✅ I9 | `--passWithNoTests` removed from root `test` script; 45 adapter tests pass cleanly.                                                                                                                    | root `package.json`                          | Resolved                     |

### 1.2 Architecture / debt

| #     | Issue                                                                                                                                                                                                                       | Notes                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| D1    | Source registry is a **hardcoded array** — no lazy loading, no dynamic/plugin registration (roadmap Stage 1 wanted "lazy loading").                                                                                         | `packages/sources/src/index.ts`        |
| D2    | **Contract drift**: `packages/contracts` defines `Preferences` (8 fields), `PageRecord`, `SourceHealth` — the extension implements a parallel, smaller `AppSettings` (4 fields) and ignores the rest. Two sources of truth. | `settings.ts` vs `contracts/domain.ts` |
| ✅ D3 | In-flight GET coalescing added to the bounded client (dedupe concurrent identical GETs). TTL metadata cache still future.                                                                                                   | `mangadex.ts`                          |
| D4    | No **ESLint** — Prettier only. No unused-import/var detection, no naming rules.                                                                                                                                             | repo-wide                              |
| D5    | `archive/` (legacy-vue, parity-svelte, platform-prototype) is dead weight in the tree. Fine to keep, but it inflates the repo and confuses search.                                                                          | `archive/`                             |
| ✅ D6 | Version automation via release-please: bumps `package.json`, generates `CHANGELOG.md`, tags on Release PR merge. Already cut `0.5.0`.                                                                                       | release tooling                        |

### 1.3 Gaps vs the domain model (defined but unbuilt)

- **Reading preferences**: `readingDirection`, `pageFit`, `preloadPages`, `showPageNumber` implemented in the reader (A1–A4 shipped). `autoMarkCompleted` and per-reader `theme` override still future.
- **Source health**: `SourceHealth` schema exists; no monitoring, no UI, no nightly checks.
- **Multi-language**: `SourceLinkRecord.language` exists but `listMangaChapters()` is hardcoded to English.
- **Page records**: `PageRecord` (with width/height) defined but never stored — no local image cache.

---

## 2. New Feature Backlog (the long list)

Grouped by theme, each tagged with a rough size (S/M/L) and the target release where it lands (see §4).

### A. Reader experience

- ✅ A1 (M) Reading direction: LTR / RTL / vertical webtoon.
- ✅ A2 (S) Page fit modes: width / height / contain / original.
- ✅ A3 (S) Show page-number overlay toggle.
- ✅ A4 (M) Configurable preload (0-20 pages) + bounded image scheduler.
- ✅ A5 (S) Zoom — double-click a page (or the zoom button) toggles between the configured fit and original size.
- ✅ A6 (M) Fullscreen + immersive — fullscreen button + auto-hide header on scroll-down (reappears on scroll-up).
- ✅ A7 (M) Prev/next chapter navigation — reader fetches the source chapter list and offers Prev/Next (header + [ ] keys + end-of-chapter bar). (Page-list prefetch is a future optimization.)
- ✅ A8 (S) "Mark read & next" — one action at the end of a chapter marks it complete and loads the next.
- ✅ A9 (L) Offline downloads — download a chapter's page images as Blobs (Dexie v3 downloads table); reader reads offline from object URLs; count in the Data tab.
- ✅ A10 (S) Remember per-title reading mode — the scroll/single choice is saved per manga and restored on next open (overrides the global default). (Direction override is a future add.)

### B. Library & tracking

- ✅ B1 (M) Manga detail view — modal with cover, source, status, read/latest chapter, inline rating, and open-reader/open-source actions (from the library ⋯ menu). (full chapter list per source = future.)
- ✅ B2/G10 (M) Categories + filtering — assign comma-separated categories from the detail modal; filter the library by category. (assign-from-reader still to add.)
- B3 (S) Bookmarks (per-page). → 1.2
- ✅ B4 (M) Reading history view — timeline of started/completed events (from historyEvents) in a new History tab.
- ✅ B5 (M) Statistics — completed chapters, saved, active days, current/longest day streak, chapters this week, in the Stats & achievements tab. (Active reading time needs session timing — future.)
- B6 (M) Goals & streaks (daily/weekly). → 1.3
- ✅ B7 (S) Data-driven achievements — getLocalStats computes 10 achievements from a definition list (streaks/days/chapters), with an X/N unlocked summary.
- B8 (S) Local share cards (export a stats image). → 1.3
- ✅ B9 (M) Sort/group library — dropdown with recently read, recently added, title, latest-chapter options.
- ✅ B10 (S) Star rating (1–5) per manga — inline in the detail modal.
- B11 (M) Advanced library filters — multi-facet (status, source, tags, rating, unread count, language, updated-since) with saved filter presets. → 1.2
- ✅ B12 (S) Per-manga notes — textarea in the detail panel, saved via `library:note` message.
- B13 (M) Custom collections / smart lists (rule-based, e.g. "ongoing + rating ≥ 4 + unread > 0"). → 1.3

### C. Sources & discovery

- ✅ C1 (L) **`search()` in the adapter contract** — MangaDex (with latest chapter) + generic Madara (`?s=` results: title, cover, latest chapter); extension aggregates across all searchable sources.
- ✅ C2 (L) **`listChapters()` for the Madara family** (incl. mangaread) — parses the manga page chapter list with an admin-ajax fallback, so background update checks now work for every Madara site. (mgeko listing still pending.)
- ✅ C3 (L) Generic template adapters — Madara family (8 sites) AND MangaStream/ts family (6 sites: drakecomic, cypher, thunderscans, kappabeast, phoenix, spider) each via one config-driven factory.
- C4 (M) Self-hosted sources: Komga / Suwayomi(Tachidesk) with credentials. → 2.0
- ✅ C5 (M) Add-by-URL flow for any supported domain.
- ✅ C6 (L) Multi-language — a chapter-language preference (16 MangaDex codes) flows into chapter listing + update checks; per-link language still wins.
- ✅ C7 (M) Weeb Central (0.6.0) — ULID-based IDs, series + chapter page + images endpoint. Dynasty Scans still pending → 1.2+

### D. Reliability & platform

- ✅ D1 (M) Enforce rate limiting (token-bucket per source from manifest).
- ✅ D2 (M) Retry with exponential backoff + jitter for transient errors.
- D3 (M) Request coalescing + short-TTL metadata cache. → 1.2
- D4 (M) Source health monitoring + nightly checks + UI badges. → 1.3
- ✅ D5/I7 (S) Surface update failures in the UI — failed titles + reasons shown in the Updates tab (were console-only).
- 🚧 D6 (M) Diagnostics — registered-adapter list with capabilities/search in the Sources tab + update-error panel. (DB stats/logs still to add.)
- D7 (M) Validated import with Zod + conflict resolution (merge/overwrite/skip) + dry-run. → 1.1

### F. Curation & source management

- F1 (L) **Automatic scanlation clustering** — group multiple scanlation groups/sources of the same series into one library entry; pick a preferred source; dedupe chapters across groups by chapter number; show which groups cover which chapters. Depends on C1 (search contract) + a title-similarity matcher. → 2.0
- F2 (L) **Migration wizard for dead sources** — when D4 health monitoring flags a source dead/unavailable, fuzzy-match each affected title to candidate sources, preview matches, bulk re-link, and preserve reading progress by mapping chapter numbers. Depends on C1 + D4. → 2.0
- ✅ F3 (M) Duplicate detection + merge — groups titles by normalized name; one click merges a group into the highest-progress entry (max chapter numbers, union categories, removes the rest).
- ✅ F4 (S) NSFW flag — mark a title NSFW from the detail view; its library cover blurs (hover to reveal) when the "Blur NSFW covers" setting is on.
- ✅ F5 (M) Bulk actions — Select mode in the library to multi-select titles, then bulk add-category, mark-manual, or remove.
- F6 (M) Local recommendations ("because you read X") derived from tags/authors/history — no network. → 2.0
- ✅ F7 (S) Continue-reading / up-next queue shelf on Home.
- ✅ F8 (S) Search autocomplete + recent searches.

### E. UX polish

- ✅ E1 (S) Theme — dark/light/system selector applied via data-theme on the dashboard; light + system (prefers-color-scheme) palettes over the CSS variables. (Reader theming is a follow-up.)
- ✅ E2 (S) Keyboard-shortcut help overlay (? key / button) listing the reader shortcuts. (Remapping is future.)
- ✅ E3 (S) First-run onboarding — a welcome card on Home (when source access is not yet granted) with a grant button + quick steps; dismissible and remembered.
- ✅ E4 (S) In-extension "update available" banner — background checks GitHub Releases API; non-blocking dismiss-able banner shown if newer version exists.
- E5 (S) Accessibility pass (focus, aria, contrast). → 1.2

### G. Tracking integrity & resilience (owner's core needs + community asks)

These are weighted toward the owner's stated priorities: accurate list/updates over a variety of generic sites, smart cross-site search, reliable open-in-browser, and high-integrity human-readable sync — reader polish is explicitly low priority.

- G1 (M) **Chapter-number tracking** — store the last-read chapter _number_ (and available count) on the record, independent of the URL/domain, so a mirror domain change never loses progress. The durable key for everything else. (community #90/#92) → 0.4
- ✅ G2 (M) **Manual / "Do Not Scan" titles** — flag a title to skip auto-scan and set the available + read chapter numbers by hand from the library menu; manual titles are excluded from update checks and show a "Manual" badge (Asura-style). (community #80/#95/#110)
- ✅ G3 (M) **Broken-link re-link/migrator** — paste a chapter URL from a new mirror in the detail modal to re-point a title to a different source; reading progress is preserved by chapter number (G1). Failed updates are already surfaced (I7). (community #30/#33/#34/#110)
- ✅ G4 (S) **Per-source refresh** — Updates tab can refresh one source at a time (buttons per source in the library) instead of the whole list. (community #36/#112)
- ✅ G5 (M) **Human-readable sync + Gist** — pretty-printed JSON export round-trips the import/export envelope; GitHub Gist push/pull (token with `gist` scope stored locally), optional hourly auto-push, Settings UI under Data. (owner core) Future: per-record last-write-wins merge + YAML option.
- G6 (S) **Timed local backups** — scheduled export to a user-chosen location on a frequency (lazy: compare-on-open). (community #87/#89) → 1.x
- ✅ G7 (M) **Smart cross-site search w/ latest-chapter** — Browse searches every permitted source at once; each result shows its source and latest hosted chapter. Builds on C1. (owner core + bonus)
- 🚧 G8 (M) **Mirror compare + one-click switch** — "Check mirrors" ranks every supported source by latest chapter; "Switch" re-points the title to that mirror (lists its chapters, picks the latest, preserves progress by number). Next: MangaUpdates as the canonical identity backbone. — use the MangaUpdates API as the canonical series identity for search, clustering (F1), and mirror comparison/auto-pick-best (per yonilern's fork). → 1.x
- G9 (M) **Suwayomi/Tachidesk connector** — offload source breadth to a self-hosted Suwayomi backend (== C4, owner-recommended). → 2.0
- G10 (S) Categories/labels + assign-from-reader — tag titles into categories and add/remove them from the reader view (== B2 + a reader hook). (community #12/#79/#84) → 1.2
- ✅ G11 (S) Open chapter in new tab / Ctrl+click — `read()` checks `ctrlKey`/`metaKey`/middle-click and opens in browser. (community #23)
- ✅ G12 (S) Sort by recently added / recently read / title / latest-chapter — library sort dropdown implemented. (community #20/#22)
- G13 (S) Bulk-remove broken/disabled-mirror titles to keep large lists fast. (community #109/#110) → 1.2
- 🚧 G14 (L) **Android** — responsive layout pass for phone viewports + Android install docs (docs/ANDROID.md). Runs on Firefox-Android via the same firefox-mv3 build. Needs on-device verification. (owner bonus)
- G15 (S) Asura/Void-style "unreliable domain" warning banner (dismissible) on known domain-hoppers. (community #25) → 1.x
- ✅ G16 (M) **Cover system** — covers were unreliable because entries added by _reading_ a chapter didn't always carry one. Added an optional `resolveCover(sourceMangaId/url)` on the adapter contract (MangaDex via cover API; Madara/mgeko via the manga page's og:image), a bounded background backfill for library entries missing a cover (auto-runs on load when permission is granted, plus a "Refresh covers" button), and graceful `onerror` fallback to the title initial so a failed cover never shows blank. Future: store a `PageRecord`-style cover cache + periodic refresh.
- ✅ G17 (M) **Check mirrors** — from a title's detail, search every supported source and list which mirrors carry it, sorted by latest hosted chapter (freshest first), each openable. Builds on C1/G7; groundwork for automatic mirror comparison (G8).

---

## 3. Testing & Quality Plan (prerequisite for trustworthy releases)

1. ✅ **Drop `--passWithNoTests`** — removed from root `test` script; 45 adapter tests run cleanly.
2. 🚧 **Adapter fixture tests** — mangaread done (`whitespaceSourceHtml` + `preferSrcAttribute` regression tests in `madara.test.ts`, 45 tests total). mgeko chapter-listing fixture tests still needed.
3. **Database tests** (fake-indexeddb): save/resolve round-trip, `saveProgress` history events, **export→import→export integrity**, seed cleanup.
4. **Background handler tests**: cascading delete on `library:remove`, `updates:check` detection, alarm reconfig on settings change.
5. **Add ESLint** (typescript-eslint + svelte plugin) wired into `npm run check` and CI.
6. **Coverage reporting** (vitest `--coverage`) uploaded as a CI artifact; set a soft floor (e.g. 60%) that ratchets up.
7. Wire the **Firefox smoke test** into the Playwright/runner config (it exists but isn't matched).

---

## 4. Versioning & GitHub Release Integration (the full plan)

### 4.1 Versioning scheme

- **Single-version monorepo.** One version of record in root `package.json`; all `@amr/*` packages stay private and lockstep.
- **Semantic Versioning.** The Vue era ended at `v3.1.0`. This rewrite ships under a **fresh `all-mangas-reader@ryuu3rs.dev` extension id**, so we restart the public line:
    - **`0.y.z`** while the rewrite stabilizes (now). Breaking changes allowed between minors.
    - **`1.0.0`** = first public stable: reader + library + history + ≥3 working sources + validated import/export + Firefox signed build. (Cutting `1.0.0` rather than reclaiming `4.x` avoids confusing the new extension id with old AMO listings.)
    - After 1.0.0: `MAJOR` = breaking data/permission changes, `MINOR` = features, `PATCH` = fixes.
- **Manifest version sync.** `wxt.config.ts` reads `package.json` version at build — keep that, and make the bump script the single mutation point so manifest never drifts.

### 4.2 Conventional commits + automated changelog

- Adopt **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `ci:`, `perf:`, plus `feat!:`/`BREAKING CHANGE:`).
- Add **commitlint + a PR title lint** (GitHub Action) — soft at first, enforced before 1.0.0.
- Generate `CHANGELOG.md` from commits with **`changesets`** (preferred for the monorepo) _or_ `release-please`. Recommendation below.

### 4.3 Tooling choice — recommendation

Use **`release-please` (Google) in manifest/monorepo-single mode**:

- Watches `main`, parses conventional commits, and opens/maintains a **"Release PR"** that bumps `package.json`, updates `CHANGELOG.md`, and — on merge — creates the `vX.Y.Z` tag.
- The existing `release.yml` (tag-triggered) then builds + publishes artifacts unchanged.
- Why over changesets: no per-PR changeset files to author by hand; commit messages are the source of truth, which fits a solo/small-team flow. (If you later want manual per-change notes, switch to changesets.)

Flow:

```
PR merged to main ──▶ release-please updates Release PR (version + CHANGELOG)
Release PR merged ──▶ tag vX.Y.Z pushed ──▶ release.yml builds, signs, publishes
```

### 4.4 Branch & tag strategy

- **Trunk-based.** `main` is always releasable. Short-lived `feat/*`, `fix/*` branches → PR → squash-merge with a conventional title.
- Retire the long-lived `rewrite/extension-core` branch by merging it to `main` once §3 test baseline + I1/I2 fixes land (so `main` reflects the rewrite).
- Tags: `vX.Y.Z` (stable), `vX.Y.Z-beta.N` (prerelease). No release branches until an LTS need appears.

### 4.5 Release channels

| Channel     | Trigger                                   | Artifact                                      | Audience |
| ----------- | ----------------------------------------- | --------------------------------------------- | -------- |
| **nightly** | every push to `main` (existing CI)        | `extension-builds` artifact, 14-day retention | devs     |
| **beta**    | `vX.Y.Z-beta.N` tag → GitHub _prerelease_ | signed zip/xpi + checksums                    | testers  |
| **stable**  | `vX.Y.Z` tag → GitHub Release             | signed zip/xpi + checksums + notes            | users    |

### 4.6 Harden the release workflow

Augment `.github/workflows/release.yml`:

1. **Pre-release gate**: run `npm run check` + full tests + browser smoke before packaging (today it runs `check` but not the browser smoke).
2. **Version/tag consistency check**: fail if the git tag ≠ `package.json` version.
3. **Firefox AMO signing automation** (roadmap Stage 5, still open):
    - Add `web-ext sign` (or `wxt zip` + AMO API) step using repo secrets `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` for the **unlisted** signing flow.
    - Attach the signed `.xpi` to the release alongside the unsigned zips.
4. **Prerelease handling**: mark `-beta.N` tags as GitHub prereleases (`softprops/action-gh-release` `prerelease: true` when tag matches).
5. **Checksums**: keep `SHA256SUMS.txt` (already present); also sign it if/when a signing key exists.
6. **(Optional, post-1.0) Chrome Web Store** publish via the CWS API + `CWS_*` secrets — gated behind a manual approval environment.

### 4.7 In-extension update awareness (no auto-execute)

- ✅ **E4 implemented**: `checkExtensionUpdate()` in `background.ts` fetches the GitHub Releases API and stores the result in extension storage. `App.svelte` shows a non-blocking dismiss-able banner linking to the release page when a newer version is available. No remote code is downloaded or executed.

### 4.8 Release runbook (target end-state, mostly automated)

```
1. Land PRs to main with conventional commit titles (CI green).
2. release-please keeps a Release PR up to date (version bump + CHANGELOG).
3. Merge the Release PR → tag vX.Y.Z is pushed automatically.
4. release.yml: check → test → browser smoke → build chrome+firefox →
   sign firefox (AMO) → checksums → GitHub Release (notes auto + CHANGELOG).
5. (post-1.0, optional) manual-approval job publishes to Chrome Web Store.
6. Smoke-install the published artifacts (manual checklist until automated).
```

---

## 5. Suggested Phasing → versions

> Each phase ends in a tagged release. Issues from §1.1 are folded into the earliest phases.

- ✅ **0.2.0 — Foundation & trust** (shipped) — I1, I2, I5, I6 done; adapter test baseline; release-please + PR-title lint + AMO-signing hook; version-sync.
- ✅ **0.3.0 — Reader & reliability** (shipped) — A1–A4, B10, D1/D2, A7/A8, E1, E3.
- ✅ **0.4.0 — Library depth** (shipped) — B1, B4, B9, C5, D6, A5, A6, F7, F8. Detail pages, history, diagnostics, up-next, search autocomplete.
- ✅ **0.5.0 — Source breadth + polish** (shipped) — C1/C2/C3 generic adapters (Madara × 8 sites, MangaStream × 6, MangaBuddy), multi-source search, tags, grouped history, source health, achievements, stats, bulk actions, NSFW, covers, command palette, list view.
- 🚧 **0.6.x — New sources + fixes** (active patch series) — MangaNato/ChapMangaNato adapter (145 import entries), 8 additional Madara config rows, Weeb Central adapter (ULID-based routing), mangaread.org image-extraction fix (whitespace trim + `preferSrcAttribute` + `?style=list`), Madara `chapterRe` trailing-slash fix (`(?:/|$)`), wildcard origins crash fix (`*://*.mangadex.network/*` filter), CSP modulepreload polyfill fix (`modulePreload: { polyfill: false }`), cover backfill loop fix (module-level `coverBackfillAttempted` Set). GitHub version-check banner (E4) shipped. FanFox (23 entries) pending viability check.
- **1.0.0 — Public stable** — Requires: ① AMO secrets (`AMO_JWT_ISSUER` / `AMO_JWT_SECRET`) added to GitHub repo secrets by owner → Release PR merge → signed Firefox XPI attached to release. Code requirements already met as of 0.6.x.
- **1.x** — B3/B6/B8/B11/B13, D3/D4, E5, F1/F6, G6/G8/G10/G13/G15. Advanced filters, collections, bookmarks, timed backups, mirror compare.
- **2.0** — A9 offline/downloads, C4 self-hosted (Komga/Suwayomi), F1 scanlation clustering, F2 migration wizard, F6 recommendations, G9/G14 Android. Data-model bump justifies major.

**Contract impact of the new features.** Several need additive `MangaRecord` fields (a `MINOR`, non-breaking schema bump): `rating?` (1–5, B10), `nsfw?` (F4), `notes?` (B12), and a cluster/group key for F1. Tags/collections (B2/B13) need a tags table or array. Plan these into the `0.4.0` contract change so later features don't each re-migrate the DB.

---

## 6. Immediate next actions (this/next session)

1. **Dynasty Scans adapter** — Stage 3 remaining new source; add as config row or bespoke adapter.
2. **FanFox viability** — 23 user entries; `chapterfun.ashx` is encrypted, making image extraction hard. Confirm whether to implement or permanently defer.
3. **Add AMO secrets to GitHub** — owner must add `AMO_JWT_ISSUER` + `AMO_JWT_SECRET` to repo secrets to enable the AMO signing step in `release.yml`.
4. **Merge Release PR** to cut `1.0.0` — code requirements already met as of 0.6.x; pending only the AMO secrets above.
5. **Add mgeko fixture tests** — mangaread tests done (`madara.test.ts` covers whitespace-trim + `preferSrcAttribute`); mgeko chapter-listing still needs a fixture test.

---

## Deferred — Source Hardening (tracked, not in this plan)

**mangaread.org is resolved.** The `preferSrcAttribute` flag (src-first attribute priority), forced `?style=list` query param, AJAX fallback, and whitespace-trim fix (`getImgAttr` now calls `.trim()` before the `startsWith("http")` check) together covered the anti-scraping pattern mangaread.org used. No content-script extraction or headless fetch was needed.

The remaining concern is sites using **Canvas/SVG rendering**, **hard Cloudflare challenges (Turnstile/managed challenge)**, or **DDoS-Guard** — these are still future/deferred and are the "red" tier in the source probe policy. The Suwayomi route (G9/C4) is the recommended approach for those.

---

## 7. Strategic direction — escaping the whack-a-mole (owner question)

> "Functionality is gradually decaying. Upkeep for site compatibility is constant whack-a-mole. Is there a path forward?"

Yes. The decay comes from **one per-site adapter per site**, each breaking independently. Four moves change the economics so the owner's true needs (accurate list/updates, smart search, reliable open-in-browser, high-integrity human-readable sync, ideally Android) stop depending on any single fragile mirror.

1. **Generic theme adapters, not per-site.** Most requested sites are a handful of CMS templates — **Madara** (WordPress `wp-manga`), **MangaStream/MangaReader** (`ts_reader`), **MangaBuddy** clones, a few bespoke. One config-driven adapter per _template_ covers dozens of domains; a new site is usually a row in a table, not new code. (== C3, raised in priority.) This is the single biggest lever against whack-a-mole.
2. **Decouple identity from mirrors via MangaUpdates (G8).** Track series by a stable MangaUpdates id, not a URL. Search, clustering, and "which mirror has the latest chapter" all hang off that. When a mirror dies, identity + progress survive and migration (F2/G3) is a re-link, not a rebuild.
3. **Chapter-number tracking (G1).** Persist the read chapter _number_, not just the URL. Domain hops (Asura/Manganato→chapmanganato) stop destroying progress — the #1 cause of "stuck/broken" entries in the community logs.
4. **Suwayomi/Tachidesk as the heavy-lift backend (G9/C4).** For breadth and aggressive anti-scrape sites, let a self-hosted Suwayomi do extraction; AMR becomes the tracker/sync/UI over it. This also gives a clean **Android** story (G14): Suwayomi-Server + the extension on Firefox-for-Android, or Suwayomi's own clients, with AMR's YAML/JSON sync (G5) as the portable source of truth.

**Honest alternative if upkeep still outweighs value:** track in AMR but read in **Suwayomi/Tachiyomi-class apps** that have a maintained extension ecosystem; AMR's differentiator becomes high-integrity, human-readable, Gist-synced tracking (G1/G5) across devices — which is exactly the owner's stated core need and the "easy part" reader is explicitly _not_.

**Near-term sequencing to serve the core needs fastest:** G1 + G5 + G4 + G11 + G12 (0.4) → C1 + C2 + G7 + C3 generic-Madara + G3 (0.5) → G8 + G10 (1.x) → G9 + G14 (2.0).

---

## 8. Mirror candidates & auto-triage

Every site mentioned in the community/owner backlog is captured as machine-readable input for an **anti-scrape probe** that classifies each before we invest in an adapter — exactly the requested "auto-test whether it has anti-scrape code, how bad, and whether it's workable; if not, move on."

- **Candidate list:** `tooling/source-probe/candidates.json` (owner-priority sites flagged).
- **Probe:** `tooling/source-probe/probe.mjs` (`npm run probe -w @amr/source-probe`) fetches each, detects reachability, anti-scrape signatures (Cloudflare "Just a moment"/`cf_chl`, Turnstile, DDoS-Guard, generic captcha), guesses the CMS/template (Madara, MangaStream, MangaBuddy, etc.), and emits a **viability score** + report.
- **Workflow:** a manual-dispatch GitHub Action runs the probe and uploads the report so triage stays current without local setup.
- **Policy:** green (no/weak anti-scrape, known template) → add via the matching generic adapter; yellow (cookies/credentials help) → revisit with content-script mode; red (hard Cloudflare/Turnstile/captcha) → skip, prefer a Suwayomi route. Owner core sites — **mangaread.org, mangahub.io, toonclash.com / mangaclash.com** — are first in the queue.
