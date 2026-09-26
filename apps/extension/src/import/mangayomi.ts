// Parse a Mangayomi backup's JSON (already extracted from the .backup zip) into ImportedManga[].
// Envelope + field names are from Mangayomi's own models (Manga/Chapter/Track/Category toJson) and
// the backup writer: { version, manga[], chapters[], tracks[], categories[] }. Chapters and tracks
// are separate collections linked to a manga by its `id`, so read progress is joined here.

import type { ImportedManga, ReaderStatus } from "./types"

// Mangayomi Status enum order: 0 ongoing, 1 completed, 2 canceled, 3 unknown, 4 onHiatus,
// 5 publishingFinished. (Different order from Tachiyomi - do not share the mapping.)
function mangayomiStatus(n: number | undefined): ReaderStatus {
    switch (n) {
        case 0:
            return "ongoing"
        case 1:
        case 5:
            return "completed"
        case 2:
            return "cancelled"
        case 4:
            return "hiatus"
        default:
            return "unknown"
    }
}

// Mangayomi mirrors the Tachiyomi tracker sync ids: MyAnimeList = 1, AniList = 2.
const TRACKER_ANILIST = 2
const TRACKER_MYANIMELIST = 1

function asRecord(v: unknown): Record<string, unknown> | undefined {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}
function asArray(v: unknown): unknown[] {
    return Array.isArray(v) ? v : []
}
function asNum(v: unknown): number | undefined {
    return typeof v === "number" && Number.isFinite(v) ? v : undefined
}
function asStr(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined
}

export function parseMangayomiBackup(text: string): ImportedManga[] {
    let root: unknown
    try {
        root = JSON.parse(text)
    } catch {
        throw new Error("Backup is not valid JSON.")
    }
    const doc = asRecord(root)
    if (!doc) throw new Error("Unexpected backup contents.")

    const categoryName = new Map<number, string>()
    for (const c of asArray(doc.categories)) {
        const rec = asRecord(c)
        const id = asNum(rec?.id)
        const name = asStr(rec?.name)
        if (id !== undefined && name) categoryName.set(id, name)
    }

    // Read-chapter count per manga id (Mangayomi chapters carry no chapter number).
    const readCount = new Map<number, number>()
    for (const ch of asArray(doc.chapters)) {
        const rec = asRecord(ch)
        if (rec?.isRead !== true) continue
        const mid = asNum(rec.mangaId)
        if (mid !== undefined) readCount.set(mid, (readCount.get(mid) ?? 0) + 1)
    }

    const trackByManga = new Map<number, { anilistId?: number; malId?: number; lastChapterRead?: number }>()
    for (const t of asArray(doc.tracks)) {
        const rec = asRecord(t)
        if (!rec) continue
        const mid = asNum(rec.mangaId)
        if (mid === undefined) continue
        const cur = trackByManga.get(mid) ?? {}
        const syncId = asNum(rec.syncId)
        const mediaId = asNum(rec.mediaId)
        const lcr = asNum(rec.lastChapterRead)
        if (syncId === TRACKER_ANILIST && mediaId) cur.anilistId = mediaId
        else if (syncId === TRACKER_MYANIMELIST && mediaId) cur.malId = mediaId
        if (lcr !== undefined && lcr > 0 && (cur.lastChapterRead === undefined || lcr > cur.lastChapterRead))
            cur.lastChapterRead = lcr
        trackByManga.set(mid, cur)
    }

    const out: ImportedManga[] = []
    for (const raw of asArray(doc.manga)) {
        const m = asRecord(raw)
        if (!m) continue
        const itemType = asNum(m.itemType)
        if (itemType !== undefined && itemType !== 0) continue // manga only (skip anime/novel)
        const title = asStr(m.name)?.trim()
        if (!title) continue

        const id = asNum(m.id)
        const track = id !== undefined ? trackByManga.get(id) : undefined
        // Prefer the tracker's real last-read number; else the read-chapter count as a best effort.
        const maxReadChapter = track?.lastChapterRead ?? (id !== undefined ? readCount.get(id) : undefined)
        const categories = asArray(m.categories)
            .map(asNum)
            .map(cid => (cid !== undefined ? categoryName.get(cid) : undefined))
            .filter((n): n is string => Boolean(n))
        const url = asStr(m.link)
        const coverUrl = asStr(m.imageUrl)
        const source = asNum(m.sourceId)
        const genres = asArray(m.genre).filter((g): g is string => typeof g === "string")

        out.push({
            title,
            ...(url ? { url } : {}),
            ...(source !== undefined ? { sourceId: source.toString() } : {}),
            ...(coverUrl ? { coverUrl } : {}),
            genres,
            status: mangayomiStatus(asNum(m.status)),
            categories,
            ...(maxReadChapter && maxReadChapter > 0 ? { maxReadChapter } : {}),
            ...(track?.anilistId ? { anilistId: track.anilistId } : {}),
            ...(track?.malId ? { malId: track.malId } : {})
        })
    }
    return out
}
