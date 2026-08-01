# Plan: metadata catalog + AniList sync

Planning doc for issues #2 (non-MangaDex status), #6/#7 (AniList). Decisions locked:
VPS-preferred metadata with AniList fallback; manual token paste for AniList auth;
metadata before sync; integer chapter progress. NO chapters/content ever stored on
the VPS - metadata only.

## Three layers

1. **VPS metadata catalog** - primary metadata source (extend the existing
   community-server: Hono + better-sqlite3). Metadata only: title, genres, tags,
   status, cover URL, format, cross-IDs. Cover URLs only, never images.
2. **AniList** - fallback metadata source when the VPS has no entry, AND the target
   for personal-list sync.
3. **Extension** - a metadata client (VPS -> AniList fallback) + a sync engine.

## Part A - metadata catalog (fixes #2 + cover/status fallback, no login)

### VPS (extend community-server)

One table `title_metadata`:

- keys: `normalized_title`, `alt_titles` (json)
- fields: `status`, `cover_url`, `genres` (json), `tags` (json), `format`, `description?`
- cross-ids: `anilist_id`, `mal_id`
- provenance: `source` ('anilist' | 'manual'), `fetched_at`
- indexes: `normalized_title`, `anilist_id`

Endpoints:

- `GET /metadata/resolve?title=&sourceId=&sourceMangaId=` -> best match or null. On a
  cache miss the server queries AniList once, stores the row, returns it. So AniList is
  hit rarely and the result is shared across all users.
- `GET /metadata/by-anilist/:id` -> direct fetch.
- `POST /metadata/link` -> manual correction (map a title to a specific anilist_id).
- AniList rate-limit handled server-side (90/min, 30 degraded) with backoff.

### Extension

- `metadata/provider.ts` interface: `resolve(title, {sourceId, sourceMangaId}) -> MetadataResult | null`. Implementations: `vpsProvider` (primary), `anilistProvider` (direct GraphQL fallback). Swappable (MAL/MangaUpdates later).
- Dexie **v10**: add `anilistId?` (+ `metadataUpdatedAt?`) to the manga record. Resolve the id once, reuse it for status, cover AND sync.
- Enrichment pass: generalize `backfillMangaGenres` (updates-sources.ts) -> `enrichMetadata`. For any manga missing status / cover / genres (or stale), resolve via the provider and write via `updateManga` (+ `cacheCover`). Abort-aware, rate-limited, caches no-match. Runs on install/startup like today. Never overwrites a real value with "unknown".
- Fix `resolveMangaMetadata` (sources.ts) to carry `status` through when an adapter does provide it (mangadex/kagane).
- AniList `format: ONE_SHOT` gives an authoritative oneshot signal (nice-to-have for the panel).
- Manual relink control in the detail panel: "AniList: <title> (change)" -> sets anilistId, re-enriches. Robustness against a wrong title match.

This fixes #2 uniformly - no per-adapter scraping - and supplies the cover/status fallback of #7. Works for everyone, no token.

## Part B - AniList sync (#6 phase 1, then #7 phase 2)

### Auth (manual token paste)

- Register an AniList API v2 client (implicit grant). User authorizes via a link,
  AniList shows an access token, user pastes it into Settings.
- New `anilist.ts` config store: storage.local `anilistConfig` = {token, autoSync,
  lastSyncAt}, with a token-free status view (mirror `sync.ts`).
- Host `https://graphql.anilist.co/*` -> permissions.ts + wxt.config.ts + manifest-policy snapshot test.

### Phase 1 - chapter progress push

- `handlers/anilist.ts runAnilistSync()` modeled on `runCommunitySync`: for each library
  manga with an `anilistId`, progress = `Math.floor(lastReadChapterNumber)` (integer
  only; 10.2 -> 10). Push `SaveMediaListEntry(mediaId, progress)` only when local >
  remote (never silently lower AniList).
- Trigger: "Sync now" button in Settings + optional `configureAnilistAlarm` (gated on
  token && autoSync). Watermark `lastSyncAt`; only reconsider titles with
  `lastReadAt > lastSyncAt`.
- Direction phase 1: local -> AniList (chapter updates, as requested).

### Phase 2 - add/remove + two-way

- Library add -> `SaveMediaListEntry` (status CURRENT/PLANNING); remove ->
  `DeleteMediaListEntry`. Gated behind a setting.
- Cover/status fallback already delivered by Part A (AniList as fallback provider).
- Optional later: pull AniList progress back (two-way), conflict policy = higher wins.

## Storage sizing (answered)

Metadata-only + cover URLs only + user-seen titles = single-digit MB now, tens of MB
long-term. No image caching on the VPS. Current VPS is fine.

## Build order (metadata before sync)

1. VPS `title_metadata` + `/metadata/resolve` (server-side AniList fetch + cache).
2. Extension provider interface + vps/anilist providers + Dexie v10 `anilistId` +
   `enrichMetadata` pass. -> fixes #2 + cover/status fallback. No login.
3. AniList auth (token paste) + config store + host permission.
4. Sync engine (progress push) + Settings UI + alarm. (#6)
5. Phase 2: add/remove, then optional two-way. (#7)

## Open questions

1. Extend community-server, or stand up a separate metadata service? (Recommend
   extend - shares infra + the existing anonymous userId.)
2. Enrichment default-on or opt-in? (Recommend on - public metadata, no token, privacy-safe.)
3. Sync conflict policy: push-only + never-lower-remote for phase 1, two-way later? (Recommend yes.)
