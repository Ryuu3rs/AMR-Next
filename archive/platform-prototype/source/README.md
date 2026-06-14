# AMR Next (Experimental Sandbox)

> Status update (2026-03-03): `amr-next/` is kept for experimental platform work and is **not** the active extension rewrite release track.
> Active extension rewrite lives in `svelte-rewrite/` with stable reference files in `stable-v3.1.0/`.
>
> **PAUSED:** Do not work on `amr-next/` unless a human explicitly re-enables it.

## Direction

-   Full cutover to a new architecture (not incremental migration of legacy pages).
-   Build AMR as a searchable discovery + library + reader platform.
-   Keep old code in repo only as reference during porting.

## Current State

| Area                 | Status                      | Notes                                                                                                                          |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web`           | Baseline implemented        | Site-like UI with dashboard cards, discover filters/sort, grouped library shelves, recommendations, updates, and in-app reader |
| `apps/api`           | Storage-selectable baseline | Typed endpoints with `file` or `postgres` backend plus ingest upsert, ingest run/error telemetry, dashboard aggregates         |
| `apps/worker`        | Ingestion slice implemented | Polling worker with retry/backoff and MangaDex + Jikan + Kitsu adapters posting catalog/chapter data into API                  |
| `packages/contracts` | Implemented                 | Shared types for API and app contracts                                                                                         |

Detailed status and roadmap:

-   `docs/CURRENT_STATE_AND_DIRECTION.md`

## Project Layout

-   `apps/web`: frontend app
-   `apps/api`: backend API
-   `apps/worker`: ingestion/update worker
-   `packages/contracts`: shared contracts

## Run

1. Install dependencies:

```bash
cd amr-next
npm install
```

2. Start API (`http://localhost:8787`):

```bash
npm run dev:api
```

Default storage mode is file-backed:

-   `AMR_STORAGE=file` (default)
-   data file: `apps/api/data/store.json` (override with `AMR_DATA_FILE`)

PostgreSQL mode:

```bash
$env:AMR_STORAGE="postgres"
$env:DATABASE_URL="postgres://user:pass@localhost:5432/amr_next"
$env:AMR_DB_AUTO_MIGRATE="true"
npm run dev:api
```

Manual schema apply (PostgreSQL):

```bash
npm run db:migrate --workspace @amr-next/api
```

Migrations live in `apps/api/db/migrations/*.sql` and are tracked in `schema_migration`.

Optional ingest key protection:

```bash
$env:INGEST_API_KEY="change-me"   # PowerShell
```

3. Start web (`http://localhost:5173`):

```bash
npm run dev:web
```

4. Start worker (optional):

```bash
npm run dev:worker
```

Worker posts adapter snapshots to `/internal/ingest/catalog`.
Worker can also post extracted chapter pages to `/internal/ingest/chapter-pages`.
Worker posts ingest errors to `/internal/ingest/errors`.
Per-manga source links are queryable at `/v1/manga/:id/sources`.
In-app reader pages are available at `/v1/manga/:id/chapters/:chapterId/pages`.
Dashboard aggregate view is available at `/v1/dashboard`.
Ingest monitoring endpoints:

-   `/internal/ingest/runs?limit=25&source=mirror-name`
-   `/internal/ingest/overview`
-   `/internal/ingest/errors?limit=50&source=source-name`

Worker adapter/runtime flags:

-   `WORKER_ENABLE_MANGADEX=true`
-   `WORKER_ENABLE_JIKAN=true`
-   `WORKER_ENABLE_KITSU=true`
-   `WORKER_ENABLE_MOCK_SOURCE=true` (optional fallback test adapter)
-   `WORKER_POLL_MS=30000`
-   `WORKER_RETRY_ATTEMPTS=3`
-   `WORKER_RETRY_BASE_MS=600`
-   `WORKER_MAX_BACKOFF_MS=300000`
-   `MANGADEX_MANGA_LIMIT=6`
-   `JIKAN_MANGA_LIMIT=6`
-   `KITSU_MANGA_LIMIT=6`

## Validation

-   Store regression tests (dedupe + ingest metrics):

```bash
npm run test
```

-   Type-check all workspaces:

```bash
npm run type-check
```

-   Build web:

```bash
npm run build
```
