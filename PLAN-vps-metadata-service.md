# Plan: VPS metadata service (`@amr/metadata-server`)

Full design + infra + per-file breakdown for the self-hosted metadata catalog that
becomes the **primary** metadata provider ahead of AniList. Decisions locked: separate
service; enrichment on by default; VPS-preferred with AniList fallback. NO chapters or
page content ever stored - metadata only.

## 1. Why / how it fits

The extension already resolves metadata through a provider chain
(`apps/extension/src/metadata/index.ts`, today `[anilistProvider]`). This service adds
a `vpsProvider` in front:

```
extension enrichMetadata pass
  -> resolveMetadata({title, sourceId})
       -> vpsProvider  (GET amr-meta.weeb.ltd/metadata/resolve)   <-- NEW, primary
            -> server cache hit? return row
            -> miss? server queries AniList once, caches, returns
       -> anilistProvider (direct)  <-- fallback if VPS down/unreachable
```

Payoff vs AniList-direct: one AniList lookup is shared across ALL users (server-side
cache), so AniList is hit rarely; the catalog can later power discovery (genres/tags
browse) since it also already sees anonymous read events via the community server. The
extension keeps AniList-direct as a fallback so a VPS outage never breaks enrichment.

## 2. Data model (SQLite, better-sqlite3)

One table. Metadata only; `cover_url` is a URL string, never an image blob.

```sql
CREATE TABLE title_metadata (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    normalized_title TEXT NOT NULL,          -- lowercase, whitespace-collapsed lookup key
    anilist_id     INTEGER,                  -- cross-id, nullable (no-match rows too)
    title          TEXT,
    status         TEXT NOT NULL DEFAULT 'unknown',  -- ongoing|completed|hiatus|cancelled|unknown
    cover_url      TEXT,
    genres         TEXT NOT NULL DEFAULT '[]',       -- json array
    tags           TEXT NOT NULL DEFAULT '[]',       -- json array
    format         TEXT,                     -- e.g. ONE_SHOT
    source         TEXT NOT NULL,            -- 'anilist' | 'manual' | 'none' (no-match)
    fetched_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX idx_meta_norm ON title_metadata(normalized_title);
CREATE INDEX idx_meta_anilist ON title_metadata(anilist_id);
```

Rows with `source='none'` are cached no-matches (title genuinely not on AniList) so we
don't re-hit AniList every request. A `fetched_at` older than a TTL (e.g. 30 days) is
treated as stale and re-resolved.

## 3. Endpoints (Hono)

- `GET /health` -> `{ ok: true }`.
- `GET /metadata/resolve?title=<t>&sourceId=<s>&sourceMangaId=<id>` ->
  `MetadataResult | { result: null }`. Normalizes the title, looks up the row; on miss
  or stale, queries AniList server-side (rate-limited, backoff on 429), upserts, returns.
  Response body is the same `MetadataResult` shape the extension already consumes:
  `{ anilistId?, title?, status, coverUrl?, genres?, tags?, isOneshot? }`.
- `GET /metadata/by-anilist/:id` -> direct fetch by AniList id (cache-through).
- `POST /metadata/link` `{ normalizedTitle, anilistId }` -> manual correction: force a
  title to a specific AniList id (source='manual'), refetch its fields. For the future
  "relink AniList" UI control.

CORS: `origin: '*'`, methods GET/POST, header Content-Type (same as community-server).
No auth - it's public metadata, read-mostly; `/metadata/link` is low-risk (only remaps
public metadata). Rate-limit `/metadata/link` per-IP if abuse appears (future).

## 4. Server-side AniList (the shared cache)

`resolveFromAniList(title)` = the same GraphQL `Media(search, type: MANGA)` query the
extension's `metadata/anilist.ts` uses (verified live), mapped to `MetadataResult`.
Server enforces AniList's 90/min budget with a simple in-process token-bucket + a retry
on 429 (Retry-After). Because results are cached in SQLite, steady-state AniList traffic
is tiny regardless of user count.

## 5. Files

### New app `apps/metadata-server/` (mirrors community-server)

- `package.json` - `@amr/metadata-server`, deps hono + @hono/node-server +
  better-sqlite3 + tsx; scripts dev/start.
- `tsconfig.json` - copy community-server's (ES2022, NodeNext, strict).
- `src/db.ts` - open SQLite at `DATA_DIR`, create table, `getByNormalizedTitle`,
  `getByAnilistId`, `upsertMetadata`, `markNoMatch`, staleness helper.
- `src/anilist.ts` - server-side `resolveFromAniList(title)` + `mapMedia` + token-bucket.
- `src/normalize.ts` - `normalizeTitle()` (shared rule; must match the extension's
  normalizedTitle so lookups line up).
- `src/index.ts` - Hono app + the 4 routes + resolve/cache orchestration.
- `Dockerfile` - copy community-server's (node:22-alpine, /data, PORT 3000).
- `docker-compose.yml` - copy + change Traefik host to the metadata subdomain + volume
  to `/opt/amr-metadata/data`.
- `README.md` - run/deploy notes.

### Extension changes

- `src/metadata/vps.ts` - `vpsProvider`: `resolve()` GETs `${VITE_METADATA_API_ORIGIN}/metadata/resolve`;
  returns null on non-ok/timeout so the chain falls through to AniList. Base URL from
  `import.meta.env.VITE_METADATA_API_ORIGIN` (build-time, like the community URL).
- `src/metadata/index.ts` - providers become `[vpsProvider, anilistProvider]` (VPS
  first) when the origin is configured, else `[anilistProvider]`.
- `wxt.config.ts` + `permissions.ts` - add the metadata origin to host_permissions
  (build-time, like `VITE_COMMUNITY_API_ORIGIN`); update the manifest-policy snapshot.
- `.env.example` - document `VITE_METADATA_API_ORIGIN`.

### Tests

- `apps/metadata-server` has no vitest today; add lightweight `node --test` for db.ts
  (upsert/get/no-match/staleness) + normalize.ts, matching the repo's node-test style.
- Extension: `metadata/vps.test.ts` (mocked fetch: hit, miss->null, error->null,
  timeout->null) + update `metadata/index` behavior test for the VPS-first order.

## 6. Infra (Coolify + Traefik, mirroring community-server)

- **Subdomain**: `amr-meta.weeb.ltd` (proposed - mirrors `amr-api.weeb.ltd`). DNS A
  record -> the VPS. Traefik label `Host(\`amr-meta.weeb.ltd\`)`, https + letsencrypt.
- **Coolify**: new app from `apps/metadata-server` (Docker Compose), external `coolify`
  network, restart unless-stopped, volume `/opt/amr-metadata/data:/data`.
- **Extension build**: set `VITE_METADATA_API_ORIGIN=https://amr-meta.weeb.ltd/*` in
  `apps/extension/.env` (local) and as a CI repository variable (like
  `VITE_COMMUNITY_API_ORIGIN`).
- **Deploy is gated**: code + compose land in the repo; the actual Coolify deploy + DNS
  is a manual step the user runs/approves (server-safety rule). Nothing deploys from CI.

## 7. Privacy / security

- Metadata only, no chapters/pages/content - legally a catalog, same class as the data
  AniList already exposes.
- Requests carry only a title string (+ optional sourceId) - no userId, no PII. Do not
  log full titles beyond what's needed; no per-user data stored.
- Cover URLs only; images are fetched by the client from the CDN and cached locally.

## 8. Build order + agent roles (multi-agent)

Role split is chosen so agents touch mostly disjoint files (low merge conflict):

1. **Backend agent** - create all of `apps/metadata-server/*` (db, anilist, normalize,
   index, Dockerfile, compose, package.json, tsconfig, README) + its node tests. Owns a
   new directory; no overlap with the extension.
2. **Extension-integration agent** - create `src/metadata/vps.ts`, edit
   `src/metadata/index.ts`, `permissions.ts`, `wxt.config.ts`, `.env.example`, the
   manifest-policy snapshot; add `metadata/vps.test.ts`. Owns extension wiring.
3. **Contract/verify agent** - ensure the server's `MetadataResult` JSON exactly matches
   the extension's `MetadataResult` type + the normalizeTitle rule matches on both sides
   (the one real cross-cutting risk); run `npm run check` and reconcile.

Then I integrate, run the full gate (true exit), and commit. Deploy stays for the user.

## 9. Open infra assumptions (confirm before deploy)

1. Subdomain `amr-meta.weeb.ltd` acceptable? (or a path on amr-api, or another name.)
2. Same VPS + Coolify as community-server? (assumed yes.)
3. Extension origin var name `VITE_METADATA_API_ORIGIN`? (assumed.)
