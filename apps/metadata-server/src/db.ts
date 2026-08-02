import Database from "better-sqlite3"
import { join } from "node:path"
import type { MangaStatus, MetadataResult } from "./types.js"

export const STALE_TTL_SECONDS = 30 * 24 * 3600

function defaultPath(): string {
    return join(process.env.DATA_DIR ?? "./data", "metadata.db")
}

export type MetadataRow = {
    normalizedTitle: string
    anilistId?: number
    title?: string
    status?: MangaStatus
    coverUrl?: string
    genres?: string[]
    tags?: string[]
    isOneshot?: boolean
    source: string
}

type StoredRow = {
    normalized_title: string
    anilist_id: number | null
    title: string | null
    status: string
    cover_url: string | null
    genres: string
    tags: string
    format: string | null
    source: string
    fetched_at: number
}

export type MetadataHit = {
    result: MetadataResult
    source: string
    fetched_at: number
}

export function createDb(path: string = defaultPath()) {
    const db = new Database(path)
    db.pragma("journal_mode = WAL")

    db.exec(`
        CREATE TABLE IF NOT EXISTS title_metadata (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            normalized_title TEXT NOT NULL,
            anilist_id       INTEGER,
            title            TEXT,
            status           TEXT NOT NULL DEFAULT 'unknown',
            cover_url        TEXT,
            genres           TEXT NOT NULL DEFAULT '[]',
            tags             TEXT NOT NULL DEFAULT '[]',
            format           TEXT,
            source           TEXT NOT NULL,
            fetched_at       INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_norm ON title_metadata(normalized_title);
        CREATE INDEX IF NOT EXISTS idx_metadata_anilist ON title_metadata(anilist_id);
    `)

    function parseJsonArray(raw: string): string[] {
        try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
        } catch {
            return []
        }
    }

    function toResult(row: StoredRow): MetadataResult {
        const result: MetadataResult = { status: (row.status || "unknown") as MangaStatus }
        if (row.anilist_id != null) result.anilistId = row.anilist_id
        if (row.title != null) result.title = row.title
        if (row.cover_url != null) result.coverUrl = row.cover_url
        const genres = parseJsonArray(row.genres)
        if (genres.length > 0) result.genres = genres
        const tags = parseJsonArray(row.tags)
        if (tags.length > 0) result.tags = tags
        if (row.format === "ONE_SHOT") result.isOneshot = true
        return result
    }

    function getByNormalizedTitle(norm: string): MetadataHit | undefined {
        const row = db.prepare("SELECT * FROM title_metadata WHERE normalized_title = ?").get(norm) as
            | StoredRow
            | undefined
        if (!row) return undefined
        return { result: toResult(row), source: row.source, fetched_at: row.fetched_at }
    }

    function getByAnilistId(id: number): MetadataHit | undefined {
        const row = db
            .prepare("SELECT * FROM title_metadata WHERE anilist_id = ? ORDER BY fetched_at DESC LIMIT 1")
            .get(id) as StoredRow | undefined
        if (!row) return undefined
        return { result: toResult(row), source: row.source, fetched_at: row.fetched_at }
    }

    const upsert = db.prepare(
        `INSERT INTO title_metadata
            (normalized_title, anilist_id, title, status, cover_url, genres, tags, format, source, fetched_at)
         VALUES (@normalized_title, @anilist_id, @title, @status, @cover_url, @genres, @tags, @format, @source, unixepoch())
         ON CONFLICT (normalized_title) DO UPDATE SET
            anilist_id = excluded.anilist_id,
            title      = excluded.title,
            status     = excluded.status,
            cover_url  = excluded.cover_url,
            genres     = excluded.genres,
            tags       = excluded.tags,
            format     = excluded.format,
            source     = excluded.source,
            fetched_at = excluded.fetched_at`
    )

    function upsertMetadata(row: MetadataRow): void {
        upsert.run({
            normalized_title: row.normalizedTitle,
            anilist_id: row.anilistId ?? null,
            title: row.title ?? null,
            status: row.status ?? "unknown",
            cover_url: row.coverUrl ?? null,
            genres: JSON.stringify(row.genres ?? []),
            tags: JSON.stringify(row.tags ?? []),
            format: row.isOneshot ? "ONE_SHOT" : null,
            source: row.source
        })
    }

    // A no-match must never destroy an existing good row: insert a fresh no-match only
    // when nothing is cached, and refresh the timestamp only when the existing row is
    // ALREADY a no-match. A previously-resolved title (source 'anilist'/'manual') is
    // left intact - so a genuine "not found" for a title we already know can't wipe it.
    const noMatch = db.prepare(
        `INSERT INTO title_metadata (normalized_title, status, genres, tags, source, fetched_at)
         VALUES (@norm, 'unknown', '[]', '[]', 'none', unixepoch())
         ON CONFLICT (normalized_title) DO UPDATE SET fetched_at = excluded.fetched_at
         WHERE title_metadata.source = 'none'`
    )

    function markNoMatch(norm: string): void {
        noMatch.run({ norm })
    }

    return { db, getByNormalizedTitle, getByAnilistId, upsertMetadata, markNoMatch }
}

export function isStale(fetched_at: number, now: number = Math.floor(Date.now() / 1000)): boolean {
    return now - fetched_at > STALE_TTL_SECONDS
}

export type Db = ReturnType<typeof createDb>

let _default: Db | undefined
export function getDb(): Db {
    if (!_default) _default = createDb()
    return _default
}
