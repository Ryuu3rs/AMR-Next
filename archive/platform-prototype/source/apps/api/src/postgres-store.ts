import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { Pool, type PoolClient } from "pg"
import type {
    EventIngestInput,
    IngestChapterPagesInput,
    IngestChapterPagesResult,
    IngestErrorInput,
    IngestErrorQuery,
    IngestErrorRecord,
    IngestOverview,
    IngestRunQuery,
    IngestRunSummary,
    IngestCatalogInput,
    IngestCatalogResult,
    LibraryProgressInput,
    LibraryWriteInput,
    MangaChapter,
    MangaChapterPage,
    MangaDetail,
    MangaSourceLink,
    UserLibraryEntry
} from "@amr-next/contracts"
import type { DataStore, PersistedEvent } from "./data-store.js"
import { runMigrations } from "./migration-runner.js"

type PostgresStoreOptions = {
    connectionString: string
    userId: string
    autoMigrate: boolean
}

const asStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
    return []
}

const toIso = (value: unknown): string => new Date(String(value)).toISOString()
const normalizeAlias = (value: string): string =>
    value
        .normalize("NFKD")
        .replace(/[^\w\s]|_/g, " ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()

const mapMangaRow = (row: Record<string, unknown>): MangaDetail => ({
    id: String(row.id),
    title: String(row.title),
    coverUrl: String(row.cover_url),
    synopsis: String(row.synopsis),
    genres: asStringArray(row.genres),
    themes: asStringArray(row.themes),
    status: row.status as MangaDetail["status"],
    sourceCount: Number(row.source_count),
    lastChapterNumber: String(row.last_chapter_number),
    updatedAt: toIso(row.updated_at),
    altTitles: asStringArray(row.alt_titles),
    authors: asStringArray(row.authors),
    artists: asStringArray(row.artists)
})

const mapChapterRow = (row: Record<string, unknown>): MangaChapter => ({
    id: String(row.id),
    mangaId: String(row.manga_id),
    title: String(row.title),
    number: String(row.number),
    sourceName: String(row.source_name),
    sourceChapterUrl: String(row.source_chapter_url),
    releasedAt: toIso(row.released_at)
})

const mapLibraryRow = (row: Record<string, unknown>): UserLibraryEntry => ({
    mangaId: String(row.manga_id),
    status: row.status as UserLibraryEntry["status"],
    lastReadChapterId: row.last_read_chapter_id ? String(row.last_read_chapter_id) : null,
    lastReadPage: row.last_read_page === null || row.last_read_page === undefined ? null : Number(row.last_read_page),
    lastReadAt: row.last_read_at ? toIso(row.last_read_at) : null,
    notifyOnUpdate: Boolean(row.notify_on_update),
    addedAt: toIso(row.added_at)
})

const mapIngestRunRow = (row: Record<string, unknown>): IngestRunSummary => ({
    id: String(row.id),
    source: String(row.source),
    harvestedAt: toIso(row.harvested_at),
    mangaUpserts: Number(row.manga_upserts),
    chapterUpserts: Number(row.chapter_upserts),
    createdAt: toIso(row.created_at)
})

const mapSourceLinkRow = (row: Record<string, unknown>): MangaSourceLink => ({
    source: String(row.source),
    sourceMangaId: row.source_manga_id ? String(row.source_manga_id) : null,
    sourceMangaUrl: row.source_manga_url ? String(row.source_manga_url) : null,
    sourceTitle: row.source_title ? String(row.source_title) : null,
    firstSeenAt: toIso(row.first_seen_at),
    lastSeenAt: toIso(row.last_seen_at)
})

const mapChapterPages = (value: unknown): MangaChapterPage[] => {
    if (!Array.isArray(value)) return []
    return value
        .filter(item => {
            const entry = item as MangaChapterPage
            return Number.isFinite(entry.index) && entry.index > 0 && typeof entry.imageUrl === "string"
        })
        .map(item => {
            const entry = item as MangaChapterPage
            return {
                index: Math.max(1, Math.floor(entry.index)),
                imageUrl: entry.imageUrl
            }
        })
        .sort((a, b) => a.index - b.index)
}

export class PostgresStore implements DataStore {
    private readonly pool: Pool
    private readonly userId: string
    private readonly autoMigrate: boolean

    constructor(options: PostgresStoreOptions) {
        this.pool = new Pool({ connectionString: options.connectionString })
        this.userId = options.userId
        this.autoMigrate = options.autoMigrate
    }

    async init(): Promise<void> {
        await this.pool.query("select 1")

        if (this.autoMigrate) {
            const migrationsDir = fileURLToPath(new URL("../db/migrations", import.meta.url))
            await runMigrations(this.pool, migrationsDir)
        }
    }

    async listCatalog(): Promise<MangaDetail[]> {
        const result = await this.pool.query(
            `select id, title, cover_url, synopsis, genres, themes, status, source_count, last_chapter_number, updated_at, alt_titles, authors, artists
       from manga
       order by updated_at desc, title asc`
        )
        return result.rows.map(row => mapMangaRow(row))
    }

    async getManga(mangaId: string): Promise<MangaDetail | null> {
        const result = await this.pool.query(
            `select id, title, cover_url, synopsis, genres, themes, status, source_count, last_chapter_number, updated_at, alt_titles, authors, artists
       from manga
       where id = $1
       limit 1`,
            [mangaId]
        )
        return result.rows[0] ? mapMangaRow(result.rows[0]) : null
    }

    async listChapters(mangaId: string): Promise<MangaChapter[]> {
        const result = await this.pool.query(
            `select id, manga_id, title, number, source_name, source_chapter_url, released_at
       from chapter
       where manga_id = $1
       order by released_at desc, number desc, id asc`,
            [mangaId]
        )
        return result.rows.map(row => mapChapterRow(row))
    }

    async listLibrary(): Promise<UserLibraryEntry[]> {
        const result = await this.pool.query(
            `select manga_id, status, last_read_chapter_id, last_read_page, last_read_at, notify_on_update, added_at
       from user_library
       where user_id = $1
       order by added_at desc`,
            [this.userId]
        )
        return result.rows.map(row => mapLibraryRow(row))
    }

    async upsertLibrary(input: LibraryWriteInput, nowIso: string): Promise<UserLibraryEntry> {
        const result = await this.pool.query(
            `insert into user_library (user_id, manga_id, status, last_read_chapter_id, last_read_page, last_read_at, notify_on_update, added_at)
       values ($1, $2, $3, null, null, null, $4, $5)
       on conflict (user_id, manga_id)
       do update set
         status = excluded.status,
         notify_on_update = excluded.notify_on_update
       returning manga_id, status, last_read_chapter_id, last_read_page, last_read_at, notify_on_update, added_at`,
            [this.userId, input.mangaId, input.status ?? "following", input.notifyOnUpdate ?? true, nowIso]
        )
        return mapLibraryRow(result.rows[0])
    }

    async patchLibrary(mangaId: string, patch: LibraryProgressInput, nowIso: string): Promise<UserLibraryEntry | null> {
        const existing = await this.pool.query(
            `select manga_id, status, last_read_chapter_id, last_read_page, last_read_at, notify_on_update, added_at
       from user_library
       where user_id = $1 and manga_id = $2
       limit 1`,
            [this.userId, mangaId]
        )
        if (!existing.rows[0]) return null

        const current = mapLibraryRow(existing.rows[0])
        const nextStatus = patch.status ?? current.status
        const nextChapterId =
            patch.lastReadChapterId !== undefined ? patch.lastReadChapterId : current.lastReadChapterId
        const nextPage =
            patch.lastReadPage !== undefined
                ? patch.lastReadPage === null
                    ? null
                    : Math.max(1, Math.floor(patch.lastReadPage))
                : patch.lastReadChapterId !== undefined
                ? null
                : current.lastReadPage
        const nextNotify = patch.notifyOnUpdate !== undefined ? patch.notifyOnUpdate : current.notifyOnUpdate
        const nextLastReadAt =
            patch.lastReadChapterId !== undefined || patch.lastReadPage !== undefined ? nowIso : current.lastReadAt

        const updated = await this.pool.query(
            `update user_library
       set status = $3,
           last_read_chapter_id = $4,
           last_read_page = $5,
           last_read_at = $6,
           notify_on_update = $7
       where user_id = $1 and manga_id = $2
       returning manga_id, status, last_read_chapter_id, last_read_page, last_read_at, notify_on_update, added_at`,
            [this.userId, mangaId, nextStatus, nextChapterId, nextPage, nextLastReadAt, nextNotify]
        )
        return mapLibraryRow(updated.rows[0])
    }

    async appendEvent(event: EventIngestInput, nowIso: string): Promise<PersistedEvent> {
        const at = event.at ?? nowIso
        await this.pool.query(
            `insert into event_log (user_id, type, manga_id, chapter_id, query, at)
       values ($1, $2, $3, $4, $5, $6)`,
            [this.userId, event.type, event.mangaId ?? null, event.chapterId ?? null, event.query ?? null, at]
        )
        return {
            ...event,
            at
        }
    }

    async listRecentEvents(limit: number): Promise<PersistedEvent[]> {
        const max = Math.min(Math.max(limit, 1), 2000)
        const result = await this.pool.query(
            `select type, manga_id, chapter_id, query, at
       from event_log
       where user_id = $1
       order by at desc
       limit $2`,
            [this.userId, max]
        )
        return result.rows.map(row => ({
            type: String(row.type) as PersistedEvent["type"],
            mangaId: row.manga_id ? String(row.manga_id) : undefined,
            chapterId: row.chapter_id ? String(row.chapter_id) : undefined,
            query: row.query ? String(row.query) : undefined,
            at: toIso(row.at)
        }))
    }

    async appendIngestError(error: IngestErrorInput, nowIso: string): Promise<IngestErrorRecord> {
        const persisted: IngestErrorRecord = {
            id: randomUUID(),
            source: error.source.trim(),
            stage: error.stage.trim() || "unknown",
            message: error.message.trim() || "Unknown ingest error",
            details: error.details,
            retryable: error.retryable ?? true,
            at: error.at ?? nowIso
        }

        await this.pool.query(
            `insert into ingest_error (id, source, stage, message, details, retryable, at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
            [
                persisted.id,
                persisted.source,
                persisted.stage,
                persisted.message,
                persisted.details ?? null,
                persisted.retryable,
                persisted.at
            ]
        )
        return persisted
    }

    async listIngestErrors(query: IngestErrorQuery = {}): Promise<IngestErrorRecord[]> {
        const max = Math.min(Math.max(query.limit ?? 50, 1), 500)
        const source = query.source?.trim()
        const result = await this.pool.query(
            `select id, source, stage, message, details, retryable, at
       from ingest_error
       where ($1::text is null or source = $1)
       order by at desc
       limit $2`,
            [source || null, max]
        )
        return result.rows.map(row => ({
            id: String(row.id),
            source: String(row.source),
            stage: String(row.stage),
            message: String(row.message),
            details: row.details ? String(row.details) : undefined,
            retryable: Boolean(row.retryable),
            at: toIso(row.at)
        }))
    }

    private async resolveCanonicalMangaId(
        client: PoolClient,
        source: string,
        item: IngestCatalogInput["items"][number]
    ): Promise<string> {
        const sourceMangaId = item.sourceMangaId?.trim()
        const sourceMangaUrl = item.sourceMangaUrl?.trim()

        if (sourceMangaId) {
            const bySourceId = await client.query(
                `select manga_id from source_manga_link where source = $1 and source_manga_id = $2 limit 1`,
                [source, sourceMangaId]
            )
            if (bySourceId.rows[0]?.manga_id) return String(bySourceId.rows[0].manga_id)
        }

        if (sourceMangaUrl) {
            const bySourceUrl = await client.query(
                `select manga_id from source_manga_link where source = $1 and source_manga_url = $2 limit 1`,
                [source, sourceMangaUrl]
            )
            if (bySourceUrl.rows[0]?.manga_id) return String(bySourceUrl.rows[0].manga_id)
        }

        const aliasCandidate = normalizeAlias(item.sourceTitle?.trim() || item.manga.title || "")
        if (aliasCandidate) {
            const byAlias = await client.query(`select manga_id from manga_alias where normalized_alias = $1 limit 1`, [
                aliasCandidate
            ])
            if (byAlias.rows[0]?.manga_id) return String(byAlias.rows[0].manga_id)
        }

        return item.manga.id
    }

    private async upsertAlias(
        client: PoolClient,
        mangaId: string,
        alias: string | null | undefined,
        source: string | null,
        seenAt: string
    ): Promise<void> {
        const rawAlias = alias?.trim() || ""
        const normalized = normalizeAlias(rawAlias)
        if (normalized.length < 2) return

        await client.query(
            `insert into manga_alias (id, manga_id, alias, normalized_alias, source, first_seen_at, last_seen_at)
       values ($1, $2, $3, $4, $5, $6, $6)
       on conflict (normalized_alias)
       do update set
         manga_id = excluded.manga_id,
         alias = excluded.alias,
         source = coalesce(excluded.source, manga_alias.source),
         last_seen_at = excluded.last_seen_at`,
            [randomUUID(), mangaId, rawAlias, normalized, source, seenAt]
        )
    }

    private async upsertSourceLink(
        client: PoolClient,
        inputSource: string,
        mangaId: string,
        sourceMangaId: string | null,
        sourceMangaUrl: string | null,
        sourceTitle: string | null,
        harvestedAt: string
    ): Promise<void> {
        if (sourceMangaId) {
            await client.query(
                `insert into source_manga_link (id, source, source_manga_id, source_manga_url, source_title, manga_id, first_seen_at, last_seen_at)
         values ($1, $2, $3, $4, $5, $6, $7, $7)
         on conflict (source, source_manga_id)
         where source_manga_id is not null
         do update set
           source_manga_url = coalesce(excluded.source_manga_url, source_manga_link.source_manga_url),
           source_title = coalesce(excluded.source_title, source_manga_link.source_title),
           manga_id = excluded.manga_id,
           last_seen_at = excluded.last_seen_at`,
                [randomUUID(), inputSource, sourceMangaId, sourceMangaUrl, sourceTitle, mangaId, harvestedAt]
            )
            return
        }

        if (sourceMangaUrl) {
            await client.query(
                `insert into source_manga_link (id, source, source_manga_id, source_manga_url, source_title, manga_id, first_seen_at, last_seen_at)
         values ($1, $2, null, $3, $4, $5, $6, $6)
         on conflict (source, source_manga_url)
         where source_manga_url is not null
         do update set
           source_title = coalesce(excluded.source_title, source_manga_link.source_title),
           manga_id = excluded.manga_id,
           last_seen_at = excluded.last_seen_at`,
                [randomUUID(), inputSource, sourceMangaUrl, sourceTitle, mangaId, harvestedAt]
            )
        }
    }

    async upsertCatalog(input: IngestCatalogInput): Promise<IngestCatalogResult> {
        const harvestedAt = input.harvestedAt ?? new Date().toISOString()
        let mangaUpserts = 0
        let chapterUpserts = 0
        const client = await this.pool.connect()

        try {
            await client.query("begin")

            for (const item of input.items) {
                const manga = item.manga
                const canonicalMangaId = await this.resolveCanonicalMangaId(client, input.source, item)
                const canonicalManga: MangaDetail = {
                    ...manga,
                    id: canonicalMangaId
                }

                await client.query(
                    `insert into manga (id, title, cover_url, synopsis, genres, themes, status, source_count, last_chapter_number, updated_at, alt_titles, authors, artists)
           values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb)
           on conflict (id)
           do update set
             title = excluded.title,
             cover_url = excluded.cover_url,
             synopsis = excluded.synopsis,
             genres = excluded.genres,
             themes = excluded.themes,
             status = excluded.status,
             source_count = excluded.source_count,
             last_chapter_number = excluded.last_chapter_number,
             updated_at = excluded.updated_at,
             alt_titles = excluded.alt_titles,
             authors = excluded.authors,
             artists = excluded.artists`,
                    [
                        canonicalManga.id,
                        canonicalManga.title,
                        canonicalManga.coverUrl,
                        canonicalManga.synopsis,
                        JSON.stringify(canonicalManga.genres),
                        JSON.stringify(canonicalManga.themes),
                        canonicalManga.status,
                        canonicalManga.sourceCount,
                        canonicalManga.lastChapterNumber,
                        canonicalManga.updatedAt || harvestedAt,
                        JSON.stringify(canonicalManga.altTitles),
                        JSON.stringify(canonicalManga.authors),
                        JSON.stringify(canonicalManga.artists)
                    ]
                )
                mangaUpserts += 1

                for (const chapter of item.chapters) {
                    await client.query(
                        `insert into chapter (id, manga_id, title, number, source_name, source_chapter_url, released_at)
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (manga_id, id)
             do update set
               title = excluded.title,
               number = excluded.number,
               source_name = excluded.source_name,
               source_chapter_url = excluded.source_chapter_url,
               released_at = excluded.released_at`,
                        [
                            chapter.id,
                            canonicalManga.id,
                            chapter.title,
                            chapter.number,
                            chapter.sourceName,
                            chapter.sourceChapterUrl,
                            chapter.releasedAt || harvestedAt
                        ]
                    )
                    chapterUpserts += 1
                }

                const sourceMangaId = item.sourceMangaId?.trim() || null
                const sourceMangaUrl = item.sourceMangaUrl?.trim() || null
                const sourceTitle = item.sourceTitle?.trim() || null
                await this.upsertSourceLink(
                    client,
                    input.source,
                    canonicalManga.id,
                    sourceMangaId,
                    sourceMangaUrl,
                    sourceTitle,
                    harvestedAt
                )

                // Maintain alias index so title-based dedupe can map future ingests.
                await this.upsertAlias(client, canonicalManga.id, canonicalManga.title, "catalog", harvestedAt)
                await this.upsertAlias(client, canonicalManga.id, sourceTitle, input.source, harvestedAt)
                for (const alias of canonicalManga.altTitles) {
                    await this.upsertAlias(client, canonicalManga.id, alias, "catalog", harvestedAt)
                }
            }

            const result: IngestCatalogResult = {
                source: input.source,
                harvestedAt,
                mangaUpserts,
                chapterUpserts
            }

            await client.query(
                `insert into ingest_run (id, source, harvested_at, manga_upserts, chapter_upserts, created_at)
         values ($1, $2, $3, $4, $5, $6)`,
                [
                    randomUUID(),
                    result.source,
                    result.harvestedAt,
                    result.mangaUpserts,
                    result.chapterUpserts,
                    new Date().toISOString()
                ]
            )

            await client.query("commit")
            return result
        } catch (error) {
            await client.query("rollback")
            throw error
        } finally {
            client.release()
        }
    }

    async upsertChapterPages(input: IngestChapterPagesInput): Promise<IngestChapterPagesResult> {
        const harvestedAt = input.harvestedAt ?? new Date().toISOString()
        let upserts = 0
        const client = await this.pool.connect()

        try {
            await client.query("begin")
            for (const item of input.items) {
                const sourceName = item.sourceName.trim()
                const sourceChapterUrl = item.sourceChapterUrl.trim()
                if (!sourceName || !sourceChapterUrl) continue

                const pages = mapChapterPages(item.items)
                if (pages.length === 0) continue

                await client.query(
                    `insert into chapter_page_cache (id, source, source_name, source_chapter_url, manga_id, chapter_id, pages, first_seen_at, last_seen_at)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
           on conflict (source_name, source_chapter_url)
           do update set
             source = excluded.source,
             manga_id = coalesce(excluded.manga_id, chapter_page_cache.manga_id),
             chapter_id = coalesce(excluded.chapter_id, chapter_page_cache.chapter_id),
             pages = excluded.pages,
             last_seen_at = excluded.last_seen_at`,
                    [
                        randomUUID(),
                        input.source,
                        sourceName,
                        sourceChapterUrl,
                        item.mangaId ?? null,
                        item.chapterId ?? null,
                        JSON.stringify(pages),
                        harvestedAt
                    ]
                )
                upserts += 1
            }

            await client.query("commit")
            return {
                source: input.source,
                harvestedAt,
                upserts
            }
        } catch (error) {
            await client.query("rollback")
            throw error
        } finally {
            client.release()
        }
    }

    async getChapterPages(sourceName: string, sourceChapterUrl: string): Promise<MangaChapterPage[] | null> {
        const result = await this.pool.query(
            `select pages
       from chapter_page_cache
       where source_name = $1 and source_chapter_url = $2
       limit 1`,
            [sourceName, sourceChapterUrl]
        )
        if (!result.rows[0]) return null
        const pages = mapChapterPages(result.rows[0].pages)
        return pages.length > 0 ? pages : null
    }

    async close(): Promise<void> {
        await this.pool.end()
    }

    async listIngestRuns(query: IngestRunQuery = {}): Promise<IngestRunSummary[]> {
        const max = Math.min(Math.max(query.limit ?? 25, 1), 200)
        const sourceFilter = query.source?.trim()
        const result = await this.pool.query(
            `select id, source, harvested_at, manga_upserts, chapter_upserts, created_at
       from ingest_run
       where ($1::text is null or source = $1)
       order by created_at desc
       limit $2`,
            [sourceFilter || null, max]
        )
        return result.rows.map(row => mapIngestRunRow(row))
    }

    async getIngestOverview(): Promise<IngestOverview> {
        const [manga, chapter, sourceLinks, aliases, runs] = await Promise.all([
            this.pool.query("select count(*)::int as total from manga"),
            this.pool.query("select count(*)::int as total from chapter"),
            this.pool.query("select count(*)::int as total from source_manga_link"),
            this.pool.query("select count(*)::int as total from manga_alias"),
            this.pool.query("select count(*)::int as total, max(created_at) as latest from ingest_run")
        ])

        return {
            totalManga: Number(manga.rows[0]?.total ?? 0),
            totalChapters: Number(chapter.rows[0]?.total ?? 0),
            totalSourceLinks: Number(sourceLinks.rows[0]?.total ?? 0),
            totalAliases: Number(aliases.rows[0]?.total ?? 0),
            totalIngestRuns: Number(runs.rows[0]?.total ?? 0),
            latestIngestAt: runs.rows[0]?.latest ? toIso(runs.rows[0].latest) : null
        }
    }

    async listMangaSources(mangaId: string): Promise<MangaSourceLink[]> {
        const result = await this.pool.query(
            `select source, source_manga_id, source_manga_url, source_title, first_seen_at, last_seen_at
       from source_manga_link
       where manga_id = $1
       order by last_seen_at desc`,
            [mangaId]
        )
        return result.rows.map(row => mapSourceLinkRow(row))
    }
}

export const resolveDatabaseUrl = (): string => {
    const dbUrl = process.env.DATABASE_URL
    if (dbUrl && dbUrl.trim()) return dbUrl.trim()
    const fallback = process.env.PG_URL
    if (fallback && fallback.trim()) return fallback.trim()
    throw new Error("DATABASE_URL is required when AMR_STORAGE=postgres")
}

export const resolvePostgresAutoMigrate = (): boolean => {
    const value = process.env.AMR_DB_AUTO_MIGRATE?.trim().toLowerCase()
    return value === "1" || value === "true"
}

export const resolveDefaultDbUser = (): string => {
    return process.env.AMR_USER_ID?.trim() || "local-dev"
}
