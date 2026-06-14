# AMR — Codebase Audit, Feature Backlog & Release/Versioning Plan

Last updated: 2026-06-14
Branch at time of writing: `main` (rewrite merged)
Status: **v0.2.0 released** — rewrite merged to `main`; release-please pipeline live and proven end-to-end (CI fixes, version-sync, AMO-signing hook in place). Foundation phase (§1.1 I1/I2/I5/I6, §3 test baseline, §4 release automation) is done. Stage 1 (Reader) and most of Stage 2 (Local Product) are functionally complete. This document reconciles reality with the roadmap and plans the path to public stable.

> Scope note: the mangaread.org / Madara anti-scraping problem is **deliberately deferred**. It needs a multi-angle approach (content-script extraction in page context, alternate Madara endpoints, optional headless fetch) and is tracked separately under "Deferred — Source Hardening". Nothing in this plan depends on solving it.

---

## 1. Issues In The Current Codebase

### 1.1 Correctness / risk (fix first)

| #   | Issue                                                                                                                                                                                        | Location                                     | Impact                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| I1  | `importDatabase()` accepts `unknown` and hand-casts the envelope — no Zod validation. A malformed/old export can corrupt the DB or throw mid-transaction.                                    | `apps/extension/src/database.ts` (~L112-138) | Data loss on import                     |
| I2  | Permission origin lists are **duplicated in 3 places** (`sources.ts`, `app/App.svelte`, `popup/App.svelte`). They already drifted once (the mangaread bug).                                  | 3 files                                      | Recurring permission bugs               |
| I3  | `search()` is **not part of the `SourceAdapter` contract**. Search is hardcoded to MangaDex via a direct `fetch()` in `sources.ts`, bypassing the bounded request client + origin allowlist. | `apps/extension/src/sources.ts` L39-92       | No multi-source search; unbounded fetch |
| I4  | `listChapters()` **throws "not supported"** for mangaread + mgeko. Library update checks silently count these as failures forever.                                                           | `mangaread.ts` L303, `mgeko.ts` L197         | Updates never work for 2/3 sources      |
| I5  | Rate limit is **declared in the manifest but never enforced**. `requestRateLimit` is decorative; no queue/backoff. Bulk update checks can hammer a host.                                     | `source-sdk/src/request.ts`                  | Risk of IP bans / source blocks         |
| I6  | No retry / backoff on transient failures (timeouts, 5xx). One blip = hard fail surfaced to user.                                                                                             | `source-sdk/src/request.ts`                  | Fragile UX                              |
| I7  | Update-check + auto-capture failures are `console.warn`-only; never surfaced in UI. User sees nothing when a source breaks.                                                                  | `background.ts` L64, L138                    | Silent failures                         |
| I8  | Reader image fallback regex is MangaDex-specific and brittle; non-MangaDex failures just warn with no recovery.                                                                              | `reader/App.svelte` L69-75                   | Dead images, no retry                   |
| I9  | `--passWithNoTests` masks the fact that database, background handlers, UI, and 2/3 adapters have **zero tests**. CI is green over ~85% untested production code.                             | root `test` script                           | False confidence                        |

### 1.2 Architecture / debt

| #   | Issue                                                                                                                                                                                                                       | Notes                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| D1  | Source registry is a **hardcoded array** — no lazy loading, no dynamic/plugin registration (roadmap Stage 1 wanted "lazy loading").                                                                                         | `packages/sources/src/index.ts`        |
| D2  | **Contract drift**: `packages/contracts` defines `Preferences` (8 fields), `PageRecord`, `SourceHealth` — the extension implements a parallel, smaller `AppSettings` (4 fields) and ignores the rest. Two sources of truth. | `settings.ts` vs `contracts/domain.ts` |
| D3  | No caching / request coalescing. MangaDex `resolveChapter()` makes 3 sequential calls every time; re-resolving chapters in the same manga refetches manga metadata.                                                         | `mangadex.ts`                          |
| D4  | No **ESLint** — Prettier only. No unused-import/var detection, no naming rules.                                                                                                                                             | repo-wide                              |
| D5  | `archive/` (legacy-vue, parity-svelte, platform-prototype) is dead weight in the tree. Fine to keep, but it inflates the repo and confuses search.                                                                          | `archive/`                             |
| D6  | Version is hardcoded in root `package.json` and read by WXT at build — no automation, no manifest sync step, no changelog generation.                                                                                       | release tooling                        |

### 1.3 Gaps vs the domain model (defined but unbuilt)

- **Reading preferences**: `readingDirection` (LTR/RTL/vertical), `pageFit` (width/height/contain/original), `preloadPages` (0-20), `showPageNumber`, `autoMarkCompleted`, `theme: "system"` — all defined in `contracts`, none in the reader.
- **Source health**: `SourceHealth` schema exists; no monitoring, no UI, no nightly checks.
- **Multi-language**: `SourceLinkRecord.language` exists but `listMangaChapters()` is hardcoded to English.
- **Page records**: `PageRecord` (with width/height) defined but never stored — no local image cache.

---

## 2. New Feature Backlog (the long list)

Grouped by theme, each tagged with a rough size (S/M/L) and the target release where it lands (see §4).

### A. Reader experience

- A1 (M) Reading direction: LTR / RTL / vertical webtoon. → 1.1
- A2 (S) Page fit modes: width / height / contain / original. → 1.1
- A3 (S) Show page-number overlay toggle. → 1.1
- A4 (M) Configurable preload (0-20 pages) + bounded image scheduler. → 1.1
- A5 (S) Zoom / pinch + double-click-to-fit. → 1.2
- A6 (M) Fullscreen + immersive mode (hide chrome on scroll). → 1.2
- A7 (M) Prev/next chapter navigation with prefetch of next chapter's page list. → 1.1
- A8 (S) "Mark as read & go to next" single action. → 1.1
- A9 (L) Offline / downloaded chapters (store `PageRecord` + blobs in IndexedDB). → 2.0
- A10 (S) Remember per-manga reading mode + direction overrides. → 1.2

### B. Library & tracking

- B1 (M) Manga detail page: cover, description, chapter list, read/unread state. → 1.1
- B2 (M) Tags / categories + filtering. → 1.2
- B3 (S) Bookmarks (per-page). → 1.2
- B4 (M) Reading history view (uses existing `historyEvents`). → 1.1
- B5 (M) Statistics dashboard: chapters read, active reading time, streaks. → 1.2
- B6 (M) Goals & streaks (daily/weekly). → 1.3
- B7 (S) Extensible achievements (data-driven, not 3 hardcoded). → 1.3
- B8 (S) Local share cards (export a stats image). → 1.3
- B9 (M) Sort/group library (recently read, updated, title, unread count). → 1.1
- B10 (S) Star rating (1–5) per manga; sortable + filterable; stored on the manga record. → 1.2
- B11 (M) Advanced library filters — multi-facet (status, source, tags, rating, unread count, language, updated-since) with saved filter presets. → 1.2
- B12 (S) Per-manga notes. → 1.3
- B13 (M) Custom collections / smart lists (rule-based, e.g. "ongoing + rating ≥ 4 + unread > 0"). → 1.3

### C. Sources & discovery

- ✅ C1 (L) **`search()` in the adapter contract** — MangaDex (with latest chapter) + generic Madara (`?s=` results: title, cover, latest chapter); extension aggregates across all searchable sources.
- C2 (L) **Implement `listChapters()` for mangaread + mgeko** so updates work. → 1.2 (pairs with deferred scraper hardening)
- C3 (L) Generic Madara-family template adapter (one config → many sites). → 2.0
- C4 (M) Self-hosted sources: Komga / Suwayomi(Tachidesk) with credentials. → 2.0
- C5 (M) Add-by-URL flow for any supported domain. → 1.1
- C6 (L) Multi-language chapter selection per manga. → 1.3
- C7 (M) New sources: Weeb Central, Dynasty Scans (roadmap Stage 3). → 1.2-2.0

### D. Reliability & platform

- D1 (M) Enforce rate limiting (token-bucket per source from manifest). → 1.1
- D2 (M) Retry with exponential backoff + jitter for transient errors. → 1.1
- D3 (M) Request coalescing + short-TTL metadata cache. → 1.2
- D4 (M) Source health monitoring + nightly checks + UI badges. → 1.3
- D5 (S) Surface update/capture failures in the UI (toast + diagnostics panel). → 1.1
- D6 (M) Diagnostics page: last errors, source status, DB stats, export logs. → 1.2
- D7 (M) Validated import with Zod + conflict resolution (merge/overwrite/skip) + dry-run. → 1.1

### F. Curation & source management

- F1 (L) **Automatic scanlation clustering** — group multiple scanlation groups/sources of the same series into one library entry; pick a preferred source; dedupe chapters across groups by chapter number; show which groups cover which chapters. Depends on C1 (search contract) + a title-similarity matcher. → 2.0
- F2 (L) **Migration wizard for dead sources** — when D4 health monitoring flags a source dead/unavailable, fuzzy-match each affected title to candidate sources, preview matches, bulk re-link, and preserve reading progress by mapping chapter numbers. Depends on C1 + D4. → 2.0
- F3 (M) Duplicate detection + merge (same series added twice, e.g. via two URLs). → 1.3
- F4 (S) NSFW flag with blur/hide toggle + setting. → 1.3
- F5 (M) Bulk actions — multi-select in the library for tag, remove, mark-read, rate, migrate. → 1.2
- F6 (M) Local recommendations ("because you read X") derived from tags/authors/history — no network. → 2.0
- F7 (S) Continue-reading / up-next queue shelf on Home. → 1.2
- F8 (S) Search autocomplete + recent searches. → 1.2

### E. UX polish

- E1 (S) `theme: "system"` + light theme parity. → 1.1
- E2 (S) Keyboard shortcut help overlay + remapping. → 1.2
- E3 (S) Onboarding for first-run permission grant. → 1.1
- E4 (S) In-extension "update available" banner via GitHub release check. → 1.0
- E5 (S) Accessibility pass (focus, aria, contrast). → 1.2

### G. Tracking integrity & resilience (owner's core needs + community asks)

These are weighted toward the owner's stated priorities: accurate list/updates over a variety of generic sites, smart cross-site search, reliable open-in-browser, and high-integrity human-readable sync — reader polish is explicitly low priority.

- G1 (M) **Chapter-number tracking** — store the last-read chapter _number_ (and available count) on the record, independent of the URL/domain, so a mirror domain change never loses progress. The durable key for everything else. (community #90/#92) → 0.4
- ✅ G2 (M) **Manual / "Do Not Scan" titles** — flag a title to skip auto-scan and set the available + read chapter numbers by hand from the library menu; manual titles are excluded from update checks and show a "Manual" badge (Asura-style). (community #80/#95/#110)
- G3 (M) **Broken-link checker + migrator** — detect entries whose source 403s/redirects/dies, surface them, and offer re-link (overlaps F2). (community #30/#33/#34/#110) → 0.5
- G4 (S) **Per-source refresh** — refresh updates for one source/mirror instead of the whole library. (community #36/#112) → 0.4
- ✅ G5 (M) **Human-readable sync + Gist** — pretty-printed JSON export round-trips the import/export envelope; GitHub Gist push/pull (token with `gist` scope stored locally), optional hourly auto-push, Settings UI under Data. (owner core) Future: per-record last-write-wins merge + YAML option.
- G6 (S) **Timed local backups** — scheduled export to a user-chosen location on a frequency (lazy: compare-on-open). (community #87/#89) → 1.x
- ✅ G7 (M) **Smart cross-site search w/ latest-chapter** — Browse searches every permitted source at once; each result shows its source and latest hosted chapter. Builds on C1. (owner core + bonus)
- G8 (M) **MangaUpdates backbone** — use the MangaUpdates API as the canonical series identity for search, clustering (F1), and mirror comparison/auto-pick-best (per yonilern's fork). → 1.x
- G9 (M) **Suwayomi/Tachidesk connector** — offload source breadth to a self-hosted Suwayomi backend (== C4, owner-recommended). → 2.0
- G10 (S) Categories/labels + assign-from-reader — tag titles into categories and add/remove them from the reader view (== B2 + a reader hook). (community #12/#79/#84) → 1.2
- G11 (S) Open chapter in new tab / Ctrl+click / context-menu, in the user's default browser. (community #23) → 0.4
- G12 (S) Sort by recently added / recently read (local), distinct from source "recently updated". (community #20/#22) → 0.4
- G13 (S) Bulk-remove broken/disabled-mirror titles to keep large lists fast. (community #109/#110) → 1.2
- G14 (L) **Android** — package/verify on Firefox-for-Android (extensions supported) so the list + sync + open-in-browser work on phone. (owner bonus) → 2.0
- G15 (S) Asura/Void-style "unreliable domain" warning banner (dismissible) on known domain-hoppers. (community #25) → 1.x
- ✅ G16 (M) **Cover system** — covers were unreliable because entries added by _reading_ a chapter didn't always carry one. Added an optional `resolveCover(sourceMangaId/url)` on the adapter contract (MangaDex via cover API; Madara/mgeko via the manga page's og:image), a bounded background backfill for library entries missing a cover (auto-runs on load when permission is granted, plus a "Refresh covers" button), and graceful `onerror` fallback to the title initial so a failed cover never shows blank. Future: store a `PageRecord`-style cover cache + periodic refresh.

---

## 3. Testing & Quality Plan (prerequisite for trustworthy releases)

1. **Drop `--passWithNoTests`** at the repo level once each package has ≥1 test (keep per-workspace where genuinely empty).
2. **Adapter fixture tests** for mangaread + mgeko mirroring the MangaDex pattern (`__fixtures__/` + `*.test.ts`). Captures the `src`-vs-`data-src` regression we just fixed.
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

- Implement **E4**: a background check against `GET /repos/Ryuu3rs/all-mangas-reader-3/releases/latest` (already implied by README). Compare `tag_name` to `manifest.version`; if newer, show a non-blocking banner linking to the release. **Never download or run remote code** (CONTRIBUTING + security ops forbid it).

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

- ✅ **0.2.0 — Foundation & trust** (shipped) — I1, I2, I5, I6 done; adapter test baseline; release-please + PR-title lint + AMO-signing hook; version-sync. (I7/D5/D7-conflict-resolution/E4 carried forward.)
- 🚧 **0.3.0 — Reader & reliability** (in Release PR) — ✅ A1–A4 (reading direction, page fit, page number, preload), ✅ B10 (star rating, pulled earlier), ✅ D1/D2 (rate-limit/retry, shipped in 0.2.0). Remaining: A7/A8 (blocked by C2), E1 (theme), E3 (onboarding).
- **0.4.0 — Library depth** (B1, B4, B9, ~~B10~~✅, C5, D6, A5, A6, F7, F8). Detail pages, history, diagnostics, up-next, search autocomplete.
- **0.5.0 — Source breadth** (C1 contract + C2 listChapters + C7 new sources; pairs with deferred scraper hardening). Search across sources; updates work everywhere.
- **1.0.0 — Public stable** (Firefox AMO signing automation live, in-extension update check, full test floor, docs/runbook complete, ≥3 sources solid). Reclaim the roadmap Stage 5 checkboxes.
- **1.x** — B2/B3/B5/B6/B7/B8/B11/B12/B13, C6, D3/D4, E2/E5, A10, F3/F4/F5. Advanced filters, collections, bulk actions, duplicate merge, NSFW.
- **2.0** — A9 offline/downloads, C3 Madara template, C4 self-hosted (Komga/Suwayomi), **F1 scanlation clustering**, **F2 migration wizard**, F6 recommendations. Data-model bump justifies major.

**Contract impact of the new features.** Several need additive `MangaRecord` fields (a `MINOR`, non-breaking schema bump): `rating?` (1–5, B10), `nsfw?` (F4), `notes?` (B12), and a cluster/group key for F1. Tags/collections (B2/B13) need a tags table or array. Plan these into the `0.4.0` contract change so later features don't each re-migrate the DB.

---

## 6. Immediate next actions (this/next session)

1. **Centralize permission origins** into one exported constant (`SOURCE_ORIGINS`) consumed by `sources.ts`, both Svelte apps, and `wxt.config.ts` — kills I2 and the class of bug behind the mangaread regression.
2. **Zod-validate `importDatabase()`** against the export envelope schema in `contracts` — fixes I1.
3. **Stand up release-please + commitlint** and cut **0.2.0** as the first automated release (proves the pipeline end-to-end).
4. **Add mangaread + mgeko fixture tests** to lock in the image-extraction fix before touching the scraper again.
5. Reconcile `ROADMAP.md` checkboxes with shipped reality (Stages 1-2 mostly done).

---

## Deferred — Source Hardening (tracked, not in this plan)

The mangaread.org / Madara anti-scraping issue. Approaches to evaluate together later:

- Content-script extraction **in page context** (real `src` + executed lazy-load JS, full cookies).
- Alternate Madara endpoints / nonce acquisition strategies.
- Optional user-opt-in headless fetch.
- Per-source "extraction mode" flag in the adapter manifest.

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
