# Current State And Direction

> Status update (2026-03-03): this document describes the `amr-next/` experimental stack only.
> It is not the active extension rewrite roadmap. Active extension track is `svelte-rewrite/`.
> **PAUSED:** Do not work on `amr-next/` unless a human explicitly re-enables it.

Last updated: 2026-02-26

## Product Direction

AMR is being rebuilt as a platform with three core experiences:

1. Discover: searchable catalog with genres/themes/tags.
2. Personal: user library, progress tracking, updates, recommendations.
3. Read: chapter reader fed by source adapters and normalized chapter/page data.

This is a full-cutover rewrite. New feature work goes into `amr-next`.

## Architecture Direction

1. `apps/web`: user-facing app for discover/library/reader.
2. `apps/api`: system of record for catalog, user data, and recommendation APIs.
3. `apps/worker`: ingestion/update jobs, source adapters, scheduling, and indexing.
4. `packages/contracts`: shared API and domain contracts.

## Current Implementation Snapshot

### apps/web

-   Discover search/filter UI with genre and theme facets.
-   Discover supports status filters and sort modes (relevance, updated, title, source-count).
-   Manga open flow to detail + chapter list.
-   Library is grouped into status shelves with update badges and resume actions.
-   Recommendation and updates panels.
-   In-app chapter reader panel backed by a typed chapter pages endpoint.
-   Reader resume persistence (last chapter + page) synced through library progress, plus keyboard/page controls.
-   Dashboard shell now includes ingest KPIs, source health, recent runs, continue-reading cards, and ingest error surfacing.
-   API-first frontend contract usage.

### apps/api

-   `GET /health`
-   `GET /v1/discover`
-   `GET /v1/discover?status=&sort=`
-   `GET /v1/manga/:id`
-   `GET /v1/manga/:id/chapters`
-   `GET /v1/manga/:id/chapters/:chapterId/pages`
-   `GET /v1/manga/:id/sources`
-   `GET /v1/users/me/library`
-   `POST /v1/users/me/library`
-   `PATCH /v1/users/me/library/:mangaId`
-   `GET /v1/users/me/recommendations`
-   `GET /v1/users/me/updates`
-   `GET /v1/dashboard`
-   `POST /v1/users/me/events`
-   `POST /internal/ingest/catalog` (worker/source upsert path)
-   `POST /internal/ingest/chapter-pages` (worker/source chapter page manifest upsert)
-   `POST /internal/ingest/errors` (worker/source ingest error reporting)
-   `GET /internal/ingest/runs` (recent ingest run summaries, filterable by `source` and `limit`)
-   `GET /internal/ingest/overview` (aggregate ingest/storage counters)
-   `GET /internal/ingest/errors` (recent ingest failures, filterable by `source` and `limit`)

Current API data is persisted on disk in `apps/api/data/store.json` (or `AMR_DATA_FILE` override).
On first boot, seed data is generated. Mutations (library, events, ingest) are written back to the file.
Recommendations now blend followed-genre affinity with recency-weighted user events (view/read/follow).

PostgreSQL cutover groundwork is now in place:

-   `AMR_STORAGE=postgres` switches API storage backend.
-   `DATABASE_URL` connection string is required in postgres mode.
-   `apps/api/db/migrations/*.sql` holds versioned schema migrations.
-   Source link mapping is persisted (`source_manga_link`) for per-manga source traceability.
-   Alias mapping is persisted (`manga_alias`) for cross-source title normalization.
-   Chapter page manifests are persisted (`chapter_page_cache`) and used by the reader endpoint.
-   Library progress persists both `last_read_chapter_id` and `last_read_page`.
-   Ingest failures are persisted (`ingest_error`) for operational surfacing in dashboard.
-   `npm run db:migrate --workspace @amr-next/api` applies pending migrations manually.
-   `AMR_DB_AUTO_MIGRATE=true` applies pending migrations on API boot.

### apps/worker

-   Running worker loop.
-   Adapter contract implemented.
-   MangaDex + Jikan + Kitsu adapters post snapshot payloads to `/internal/ingest/catalog` each cycle.
-   MangaDex posts chapter-page manifests to `/internal/ingest/chapter-pages`; other adapters currently contribute catalog/chapter metadata.
-   Worker retries transient failures and uses exponential backoff between failed cycles.
-   Worker reports persistent ingest failures to `/internal/ingest/errors`.
-   `INGEST_API_KEY` can be set to protect ingest endpoint.
-   Ingest runs are recorded, filterable by source, and summarized by `/internal/ingest/overview`.

### contracts

-   Shared typed models for manga, chapters, discover query/response, library, recommendations, and event ingestion.

## What Is Next

1. Database completion:

-   Validate file-store and postgres dedupe parity against the same regression suite.
-   Remove file-store fallback once postgres is fully validated.

2. Search stack:

-   Add full-text/facet indexing (Meilisearch or OpenSearch).

3. Ingestion framework:

-   Add additional real source adapters beyond MangaDex/Jikan/Kitsu.
-   Queue and scheduler isolation for adapter-level workloads.
-   Normalization and dedupe pipeline hardening across heterogeneous sources.

4. Reader flow:

-   Chapter page endpoint + source image proxy strategy.
-   Reader state persistence and chapter continuity.

5. Recommendations:

-   Replace current heuristic with event-driven ranking pipeline.

## Legacy Repo Position

-   Legacy extension paths are kept for reference and temporary runtime continuity.
-   They are not the target architecture for new feature development.

## Validation Commands

1. `npm run test` (store regression coverage for alias/source dedupe and ingest counters)
2. `npm run type-check`
3. `npm run build`
