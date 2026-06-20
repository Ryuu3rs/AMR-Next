import type { ChapterRecord, MangaRecord, ReadingProgress, SourceLinkRecord } from "@amr/contracts"
import Dexie, { type EntityTable, type Table } from "dexie"
import { exportEnvelopeSchema } from "./schema"

export interface CoverCacheRecord {
    mangaId: string
    blob: Blob
    cachedAt: number
}

export type LibraryManga = MangaRecord & {
    sourceId: string
    sourceUrl: string
    sourceMangaId?: string
    mangaUrl?: string
    latestChapterId?: string
    lastReadChapterId?: string
    // Domain-independent progress: the chapter *number* survives mirror/domain
    // changes that invalidate the URL-derived chapter IDs above.
    latestChapterNumber?: number
    lastReadChapterNumber?: number
    // When the user last read a chapter of this title (for "recently read" sort),
    // distinct from updatedAt which also moves on source update checks.
    lastReadAt?: number
    // Manual / "Do Not Scan": skip automatic update checks; the user maintains the
    // available + read chapter numbers by hand (e.g. Asura-style domain-hoppers).
    manualTracking?: boolean
    // User categories / labels for filtering the library.
    categories?: string[]
    // User-flagged adult content (covers blurred when the blur setting is on).
    nsfw?: boolean
    // Free-form per-manga notes the user keeps alongside the title.
    notes?: string
    // Genres fetched from the source (cached to avoid repeat network calls).
    genres?: string[]
}

export type HistoryEvent = {
    id?: number
    mangaId: string
    chapterId: string
    type: "started" | "completed"
    occurredAt: number
}

export type ChapterDownload = {
    chapterId: string
    mangaId: string
    pageBlobs: Blob[]
    pageCount: number
    downloadedAt: number
}

export type PageBookmark = {
    id: string
    mangaId: string
    chapterId: string
    pageIndex: number
    mangaTitle: string
    chapterTitle: string
    chapterUrl: string
    addedAt: number
}

export type AnalyticsEvent = {
    id?: number
    event:
        | "capture_ok" // chapter URL auto-captured from a tab
        | "capture_error" // capture failed (CF block, 404, etc.)
        | "reader_opened" // user opened chapter in AMR reader
        | "on_site_track" // marked read while reading on-site (via panel)
        | "panel_action" // any panel button click (detail: { action })
        | "resolve_direct" // chapter resolved via direct HTTP fetch
        | "resolve_tab" // chapter required the tab-fallback (CF-gated site)
    sourceId?: string
    ts: number
    detail?: string // JSON blob for event-specific fields
}

export class AmrDatabase extends Dexie {
    manga!: EntityTable<LibraryManga, "id">
    sourceLinks!: EntityTable<SourceLinkRecord, "mangaId">
    chapters!: EntityTable<ChapterRecord, "id">
    progress!: EntityTable<ReadingProgress, "chapterId">
    historyEvents!: EntityTable<HistoryEvent, "id">
    downloads!: EntityTable<ChapterDownload, "chapterId">
    covers!: Table<CoverCacheRecord, string>
    pageBookmarks!: EntityTable<PageBookmark, "id">
    analyticsEvents!: EntityTable<AnalyticsEvent, "id">

    constructor() {
        super("all-mangas-reader")
        this.version(1).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed"
        })
        this.version(2).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt"
        })
        this.version(3).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt",
            downloads: "chapterId, mangaId, downloadedAt"
        })
        this.version(4).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt",
            downloads: "chapterId, mangaId, downloadedAt",
            covers: "mangaId"
        })
        this.version(5).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt",
            downloads: "chapterId, mangaId, downloadedAt",
            covers: "mangaId",
            pageBookmarks: "id, mangaId, chapterId, addedAt"
        })
        this.version(6).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt",
            downloads: "chapterId, mangaId, downloadedAt",
            covers: "mangaId",
            pageBookmarks: "id, mangaId, chapterId, addedAt",
            analyticsEvents: "++id, event, ts, sourceId"
        })
    }
}

export const db = new AmrDatabase()

export async function cacheCover(mangaId: string, blob: Blob): Promise<void> {
    await db.covers.put({ mangaId, blob, cachedAt: Date.now() })
}

export async function getCachedCover(mangaId: string): Promise<Blob | undefined> {
    return (await db.covers.get(mangaId))?.blob
}

export async function removeManga(mangaId: string): Promise<void> {
    await db.transaction(
        "rw",
        [db.manga, db.sourceLinks, db.chapters, db.progress, db.historyEvents, db.downloads, db.pageBookmarks],
        async () => {
            await db.manga.delete(mangaId)
            await db.sourceLinks.delete(mangaId)
            await db.chapters.where("mangaId").equals(mangaId).delete()
            await db.progress.where("mangaId").equals(mangaId).delete()
            await db.historyEvents.where("mangaId").equals(mangaId).delete()
            await db.downloads.where("mangaId").equals(mangaId).delete()
            await db.pageBookmarks.where("mangaId").equals(mangaId).delete()
        }
    )
}

export async function saveResolvedChapter(input: {
    manga: MangaRecord
    chapter: ChapterRecord
    sourceLink: SourceLinkRecord
    chapters?: ChapterRecord[]
}): Promise<void> {
    await db.transaction("rw", db.manga, db.sourceLinks, db.chapters, async () => {
        const existing = await db.manga.get(input.manga.id)
        const manga: LibraryManga = {
            ...input.manga,
            sourceId: input.chapter.sourceId,
            sourceUrl: input.chapter.url,
            ...(input.sourceLink.sourceMangaId ? { sourceMangaId: input.sourceLink.sourceMangaId } : {}),
            mangaUrl: input.sourceLink.url,
            latestChapterId: input.chapter.id,
            ...(Number.isFinite(input.chapter.sortKey) ? { latestChapterNumber: input.chapter.sortKey } : {}),
            // Preserve user-controlled and read-progress fields from the existing record
            // so a re-capture never silently clears ratings, categories, notes, or history.
            ...(existing?.lastReadChapterId ? { lastReadChapterId: existing.lastReadChapterId } : {}),
            ...(existing?.lastReadChapterNumber !== undefined
                ? { lastReadChapterNumber: existing.lastReadChapterNumber }
                : {}),
            ...(existing?.lastReadAt !== undefined ? { lastReadAt: existing.lastReadAt } : {}),
            ...(existing?.manualTracking !== undefined ? { manualTracking: existing.manualTracking } : {}),
            ...(existing?.categories !== undefined ? { categories: existing.categories } : {}),
            ...(existing?.nsfw !== undefined ? { nsfw: existing.nsfw } : {}),
            ...(existing?.notes !== undefined ? { notes: existing.notes } : {}),
            // rating lives in MangaRecord — prefer existing if the source didn't supply one
            ...(!input.manga.rating && existing?.rating !== undefined ? { rating: existing.rating } : {})
        }
        await db.manga.put(manga)
        await db.sourceLinks.put(input.sourceLink)
        await db.chapters.bulkPut(input.chapters ?? [input.chapter])
    })
}

const MANGA_PATH_MARKERS = ["manga", "comic", "comics", "series", "manhwa", "manhua", "title", "read"]

function deriveSlug(u: URL): string {
    const segments = u.pathname.split("/").filter(Boolean)
    const markerIndex = segments.findIndex(s => MANGA_PATH_MARKERS.includes(s.toLowerCase()))
    const afterMarker = markerIndex >= 0 ? segments[markerIndex + 1] : undefined
    if (afterMarker) return afterMarker
    const last = segments[segments.length - 1] ?? ""
    const readerStyle = last.match(/^(.*?)-chapter[-_]/i)
    if (readerStyle?.[1]) return readerStyle[1]
    return segments[0] ?? ""
}

function deriveMangaUrl(u: URL, slug: string): string {
    const segments = u.pathname.split("/").filter(Boolean)
    const markerIndex = segments.findIndex(s => MANGA_PATH_MARKERS.includes(s.toLowerCase()))
    const marker = markerIndex >= 0 ? segments[markerIndex] : undefined
    if (marker && segments[markerIndex + 1]) return `${u.origin}/${marker.toLowerCase()}/${segments[markerIndex + 1]}/`
    return slug ? `${u.origin}/manga/${slug}/` : u.origin
}

function sameHostSlug(a: string, b: string): boolean {
    try {
        const ua = new URL(a)
        const ub = new URL(b)
        if (ua.hostname !== ub.hostname) return false
        const sa = deriveSlug(ua)
        return Boolean(sa) && sa === deriveSlug(ub)
    } catch {
        return false
    }
}

function humanizeSlug(slug: string): string {
    return slug
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim()
}

// Track a chapter the user is reading on the source site directly (used when the
// in-app reader can't load a site's images). Records progress + history by chapter
// number without scraping pages, matching an existing library title when possible.
export async function trackExternalChapter(input: {
    url: string
    sourceId: string
    completed?: boolean
}): Promise<{ tracked: boolean; title: string; chapterNumber: number | null }> {
    const now = Date.now()
    const u = new URL(input.url)
    const numberMatch = input.url.match(/chapter[-_ ]?(\d+(?:\.\d+)?)/i)
    const number = numberMatch?.[1] !== undefined ? Number(numberMatch[1]) : undefined

    const all = await db.manga.toArray()
    let manga =
        all.find(m => m.mangaUrl && input.url.startsWith(m.mangaUrl.replace(/\/$/, ""))) ??
        all.find(m => m.sourceId === input.sourceId && m.mangaUrl && sameHostSlug(m.mangaUrl, input.url)) ??
        all.find(m => m.sourceId === input.sourceId && m.sourceUrl && sameHostSlug(m.sourceUrl, input.url))

    if (!manga) {
        const slug = deriveSlug(u)
        const title = humanizeSlug(slug) || u.hostname
        manga = {
            id: `${input.sourceId}:manga:${slug || u.pathname}`,
            title,
            normalizedTitle: title.toLocaleLowerCase("en"),
            sourceId: input.sourceId,
            sourceUrl: input.url,
            mangaUrl: deriveMangaUrl(u, slug),
            authors: [],
            status: "unknown",
            addedAt: now,
            updatedAt: now
        }
        await db.manga.put(manga)
        await db.sourceLinks.put({
            mangaId: manga.id,
            sourceId: input.sourceId,
            url: manga.mangaUrl ?? input.url,
            title: manga.title,
            addedAt: now,
            updatedAt: now
        })
    }

    const chapterKey = number !== undefined ? `ch-${number}` : (u.pathname.split("/").filter(Boolean).pop() ?? "ext")
    const chapterId = `${manga.id}:ext:${chapterKey}`
    await db.chapters.put({
        id: chapterId,
        mangaId: manga.id,
        sourceId: input.sourceId,
        title: number !== undefined ? `Chapter ${number}` : "External chapter",
        url: input.url,
        sortKey: number ?? 0
    })
    await saveProgress({
        mangaId: manga.id,
        chapterId,
        pageIndex: 0,
        pageCount: 1,
        completed: input.completed ?? true,
        updatedAt: now
    })
    return { tracked: true, title: manga.title, chapterNumber: number ?? null }
}

export async function saveProgress(progress: ReadingProgress): Promise<void> {
    await db.transaction("rw", db.progress, db.manga, db.chapters, db.historyEvents, async () => {
        const existing = await db.progress.get(progress.chapterId)
        await db.progress.put(progress)
        const chapter = await db.chapters.get(progress.chapterId)
        await db.manga.update(progress.mangaId, {
            lastReadChapterId: progress.chapterId,
            ...(chapter && Number.isFinite(chapter.sortKey) ? { lastReadChapterNumber: chapter.sortKey } : {}),
            lastReadAt: progress.updatedAt,
            updatedAt: progress.updatedAt
        })
        if (!existing) {
            await db.historyEvents.add({
                mangaId: progress.mangaId,
                chapterId: progress.chapterId,
                type: "started",
                occurredAt: progress.updatedAt
            })
        }
        if (progress.completed && !existing?.completed) {
            await db.historyEvents.add({
                mangaId: progress.mangaId,
                chapterId: progress.chapterId,
                type: "completed",
                occurredAt: progress.updatedAt
            })
        }
    })
}

export async function saveDownload(d: ChapterDownload): Promise<void> {
    await db.downloads.put(d)
}

export async function getDownload(chapterId: string): Promise<ChapterDownload | undefined> {
    return db.downloads.get(chapterId)
}

export async function removeDownload(chapterId: string): Promise<void> {
    await db.downloads.delete(chapterId)
}

export async function listDownloads(): Promise<
    Array<{ chapterId: string; mangaId: string; pageCount: number; downloadedAt: number }>
> {
    const all = await db.downloads.orderBy("downloadedAt").reverse().toArray()
    return all.map(({ chapterId, mangaId, pageCount, downloadedAt }) => ({
        chapterId,
        mangaId,
        pageCount,
        downloadedAt
    }))
}

export async function downloadsCount(): Promise<number> {
    return db.downloads.count()
}

export async function exportDatabase() {
    return {
        format: "all-mangas-reader",
        version: 1,
        exportedAt: Date.now(),
        data: {
            manga: await db.manga.toArray(),
            sourceLinks: await db.sourceLinks.toArray(),
            chapters: await db.chapters.toArray(),
            progress: await db.progress.toArray(),
            historyEvents: await db.historyEvents.toArray()
        }
    } as const
}

export type ImportResolution = "overwrite" | "skip" | "merge"

export type ImportConflict = {
    mangaId: string
    existingTitle: string
    importedTitle: string
    existingUpdatedAt: number
    importedUpdatedAt: number
}

function parseImportData(value: unknown) {
    const result = exportEnvelopeSchema.safeParse(value)
    if (!result.success) {
        const issue = result.error.issues[0]
        const where = issue && issue.path.length > 0 ? ` at ${issue.path.join(".")}` : ""
        throw new Error(`Import file is invalid${where}: ${issue?.message ?? "unrecognized format"}`)
    }
    return {
        manga: (result.data.data?.manga as LibraryManga[] | undefined) ?? [],
        sourceLinks: (result.data.data?.sourceLinks as SourceLinkRecord[] | undefined) ?? [],
        chapters: (result.data.data?.chapters as ChapterRecord[] | undefined) ?? [],
        progress: (result.data.data?.progress as ReadingProgress[] | undefined) ?? [],
        historyEvents: (result.data.data?.historyEvents as HistoryEvent[] | undefined) ?? []
    }
}

function mergeManga(existing: LibraryManga, imported: LibraryManga): LibraryManga {
    return {
        ...imported,
        // user preferences: always keep existing
        rating: existing.rating ?? imported.rating,
        categories: existing.categories ?? imported.categories,
        notes: existing.notes ?? imported.notes,
        nsfw: existing.nsfw ?? imported.nsfw,
        manualTracking: existing.manualTracking ?? imported.manualTracking,
        // progress: keep the further-along value
        lastReadChapterNumber:
            Math.max(existing.lastReadChapterNumber ?? 0, imported.lastReadChapterNumber ?? 0) || undefined,
        latestChapterNumber:
            Math.max(existing.latestChapterNumber ?? 0, imported.latestChapterNumber ?? 0) || undefined,
        lastReadAt: existing.lastReadAt
            ? imported.lastReadAt
                ? Math.max(existing.lastReadAt, imported.lastReadAt)
                : existing.lastReadAt
            : imported.lastReadAt,
        addedAt: Math.min(existing.addedAt, imported.addedAt),
        updatedAt: Math.max(existing.updatedAt, imported.updatedAt)
    }
}

export async function previewImport(value: unknown): Promise<ImportConflict[]> {
    const data = parseImportData(value)
    if (data.manga.length === 0) return []
    const ids = data.manga.map(m => m.id)
    const existing = await db.manga.bulkGet(ids)
    const conflicts: ImportConflict[] = []
    for (let i = 0; i < data.manga.length; i++) {
        const ex = existing[i]
        const im = data.manga[i]
        if (ex) {
            conflicts.push({
                mangaId: im.id,
                existingTitle: ex.title,
                importedTitle: im.title,
                existingUpdatedAt: ex.updatedAt,
                importedUpdatedAt: im.updatedAt
            })
        }
    }
    return conflicts
}

export async function importDatabase(
    value: unknown,
    resolutions: Record<string, ImportResolution> = {}
): Promise<{ manga: number; chapters: number }> {
    const data = parseImportData(value)

    const skippedIds = new Set<string>()
    const mangaToWrite: LibraryManga[] = []

    if (data.manga.length > 0) {
        const ids = data.manga.map(m => m.id)
        const existing = await db.manga.bulkGet(ids)
        for (let i = 0; i < data.manga.length; i++) {
            const im = data.manga[i]
            const ex = existing[i]
            const resolution = ex ? (resolutions[im.id] ?? "overwrite") : "overwrite"
            if (resolution === "skip") {
                skippedIds.add(im.id)
            } else if (resolution === "merge" && ex) {
                mangaToWrite.push(mergeManga(ex, im))
            } else {
                mangaToWrite.push(im)
            }
        }
    }

    const sourceLinksToWrite = data.sourceLinks.filter(sl => !skippedIds.has(sl.mangaId))
    const chaptersToWrite = data.chapters.filter(ch => !skippedIds.has(ch.mangaId))
    const progressToWrite = data.progress.filter(p => !skippedIds.has(p.mangaId))
    const historyToWrite = data.historyEvents.filter(h => !skippedIds.has(h.mangaId))

    await db.transaction("rw", [db.manga, db.sourceLinks, db.chapters, db.progress, db.historyEvents], async () => {
        if (mangaToWrite.length > 0) await db.manga.bulkPut(mangaToWrite)
        if (sourceLinksToWrite.length > 0) await db.sourceLinks.bulkPut(sourceLinksToWrite)
        if (chaptersToWrite.length > 0) await db.chapters.bulkPut(chaptersToWrite)
        if (progressToWrite.length > 0) await db.progress.bulkPut(progressToWrite)
        if (historyToWrite.length > 0) await db.historyEvents.bulkPut(historyToWrite)
    })
    return { manga: mangaToWrite.length, chapters: chaptersToWrite.length }
}

export async function seedDatabase(): Promise<void> {
    const now = Date.now()
    const seedEntries: Array<{
        manga: LibraryManga
        chapterUrl: string
        sourceId: string
        chapterTitle: string
        sortKey: number
    }> = [
        {
            manga: {
                id: "seed-md-001",
                title: "Buried Injustice",
                normalizedTitle: "buried injustice",
                coverUrl: "/sample-covers/buried-injustice.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "mangadex",
                sourceUrl: "https://mangadex.org/chapter/3dff8b5f-844e-4964-abd7-641c34f1f091",
                sourceMangaId: "62994137-014f-4499-b88a-c219b115fd64",
                mangaUrl: "https://mangadex.org/title/62994137-014f-4499-b88a-c219b115fd64",
                addedAt: now - 86400000 * 7,
                updatedAt: now - 3600000 * 2,
                latestChapterId: "seed-md-001-ch"
            },
            chapterUrl: "https://mangadex.org/chapter/3dff8b5f-844e-4964-abd7-641c34f1f091",
            sourceId: "mangadex",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-mr-001",
                title: "Entomologist In Sichuan Tang Clan",
                normalizedTitle: "entomologist in sichuan tang clan",
                coverUrl: "/sample-covers/entomologist.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "mangaread",
                sourceUrl: "https://www.mangaread.org/manga/entomologist-in-sichuan-tang-clan/chapter-79/?style=list",
                sourceMangaId: "entomologist-in-sichuan-tang-clan",
                mangaUrl: "https://www.mangaread.org/manga/entomologist-in-sichuan-tang-clan/",
                addedAt: now - 86400000 * 5,
                updatedAt: now - 3600000 * 5,
                latestChapterId: "seed-mr-001-ch"
            },
            chapterUrl: "https://www.mangaread.org/manga/entomologist-in-sichuan-tang-clan/chapter-79/?style=list",
            sourceId: "mangaread",
            chapterTitle: "Chapter 79",
            sortKey: 79
        },
        {
            manga: {
                id: "seed-mr-002",
                title: "Legendary Youngest Son Of The Marquis House",
                normalizedTitle: "legendary youngest son of the marquis house",
                coverUrl: "/sample-covers/legendary-marquis.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "mangaread",
                sourceUrl:
                    "https://www.mangaread.org/manga/legendary-youngest-son-of-the-marquis-house/chapter-161/?style=list",
                sourceMangaId: "legendary-youngest-son-of-the-marquis-house",
                mangaUrl: "https://www.mangaread.org/manga/legendary-youngest-son-of-the-marquis-house/",
                addedAt: now - 86400000 * 3,
                updatedAt: now - 3600000 * 8,
                latestChapterId: "seed-mr-002-ch"
            },
            chapterUrl:
                "https://www.mangaread.org/manga/legendary-youngest-son-of-the-marquis-house/chapter-161/?style=list",
            sourceId: "mangaread",
            chapterTitle: "Chapter 161",
            sortKey: 161
        },
        {
            manga: {
                id: "seed-mgk-001",
                title: "Barbarian's Adventure In A Fantasy World",
                normalizedTitle: "barbarian's adventure in a fantasy world",
                coverUrl: "/sample-covers/barbarian-fantasy.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "mgeko",
                sourceUrl: "https://www.mgeko.cc/reader/en/barbarians-adventure-in-a-fantasy-world-chapter-52-eng-li/",
                sourceMangaId: "barbarians-adventure-in-a-fantasy-world",
                mangaUrl: "https://www.mgeko.cc/comic/barbarians-adventure-in-a-fantasy-world/",
                addedAt: now - 86400000 * 2,
                updatedAt: now - 3600000 * 12,
                latestChapterId: "seed-mgk-001-ch"
            },
            chapterUrl: "https://www.mgeko.cc/reader/en/barbarians-adventure-in-a-fantasy-world-chapter-52-eng-li/",
            sourceId: "mgeko",
            chapterTitle: "Chapter 52",
            sortKey: 52
        }
    ]

    const seedManga = seedEntries.map(e => e.manga)
    const seedChapters: import("@amr/contracts").ChapterRecord[] = seedEntries.map(e => ({
        id: e.manga.latestChapterId!,
        mangaId: e.manga.id,
        sourceId: e.sourceId,
        title: e.chapterTitle,
        sortKey: e.sortKey,
        url: e.chapterUrl
    }))
    const seedLinks: import("@amr/contracts").SourceLinkRecord[] = seedEntries.map(e => ({
        mangaId: e.manga.id,
        sourceId: e.sourceId,
        ...(e.manga.sourceMangaId ? { sourceMangaId: e.manga.sourceMangaId } : {}),
        url: e.manga.mangaUrl ?? e.chapterUrl,
        title: e.manga.title,
        addedAt: e.manga.addedAt,
        updatedAt: e.manga.updatedAt
    }))
    await db.transaction("rw", db.manga, db.sourceLinks, db.chapters, async () => {
        const staleIds = (await db.manga.where("id").startsWith("seed-").primaryKeys()) as string[]
        if (staleIds.length > 0) {
            await db.manga.bulkDelete(staleIds)
            await db.sourceLinks.bulkDelete(staleIds)
            await db.chapters.where("mangaId").anyOf(staleIds).delete()
        }
        await db.manga.bulkPut(seedManga)
        await db.sourceLinks.bulkPut(seedLinks)
        await db.chapters.bulkPut(seedChapters)
    })
}

export async function getLocalStats() {
    const [manga, progress, history, downloadedChapters] = await Promise.all([
        db.manga.toArray(),
        db.progress.toArray(),
        db.historyEvents.orderBy("occurredAt").toArray(),
        db.downloads.count()
    ])
    const mangaCount = manga.length
    const completedChapters = progress.filter(item => item.completed).length

    const ratedCount = manga.filter(m => m.rating !== undefined).length
    const categoriesCount = new Set(manga.flatMap(m => m.categories ?? [])).size
    const sourcesUsed = new Set(manga.map(m => m.sourceId)).size
    const manualCount = manga.filter(m => m.manualTracking === true).length
    const completedSeries = manga.filter(
        m =>
            m.latestChapterNumber !== undefined &&
            m.lastReadChapterNumber !== undefined &&
            m.lastReadChapterNumber >= m.latestChapterNumber
    ).length
    const dayKeys = [...new Set(history.map(event => new Date(event.occurredAt).toISOString().slice(0, 10)))].sort()
    const readingDays = dayKeys.length

    const dayMs = 86_400_000
    const asDay = (key: string) => Date.parse(`${key}T00:00:00Z`)
    let longestStreak = 0
    let run = 0
    let prev: number | null = null
    for (const key of dayKeys) {
        const t = asDay(key)
        run = prev !== null && t - prev === dayMs ? run + 1 : 1
        longestStreak = Math.max(longestStreak, run)
        prev = t
    }
    // Current streak: consecutive days ending today or yesterday.
    let currentStreak = 0
    const todayKey = new Date().toISOString().slice(0, 10)
    let cursor = asDay(todayKey)
    const daySet = new Set(dayKeys.map(asDay))
    if (!daySet.has(cursor) && daySet.has(cursor - dayMs)) cursor -= dayMs
    while (daySet.has(cursor)) {
        currentStreak += 1
        cursor -= dayMs
    }
    const weekAgo = Date.now() - 7 * dayMs
    const chaptersThisWeek = history.filter(e => e.type === "completed" && e.occurredAt >= weekAgo).length
    const chaptersToday = history.filter(
        e => e.type === "completed" && new Date(e.occurredAt).toISOString().slice(0, 10) === todayKey
    ).length

    const ACHIEVEMENT_DEFS: Array<{
        id: string
        title: string
        description: string
        category: string
        metric: number
        target: number
    }> = [
        {
            id: "first-chapter",
            title: "First Chapter",
            description: "Complete one chapter",
            category: "Chapters",
            metric: completedChapters,
            target: 1
        },
        {
            id: "chapters-10",
            title: "Just Warming Up",
            description: "Complete ten chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 10
        },
        {
            id: "chapters-50",
            title: "Bookworm",
            description: "Complete 50 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 50
        },
        {
            id: "chapters-100",
            title: "Page Turner",
            description: "Complete 100 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 100
        },
        {
            id: "chapters-250",
            title: "Voracious",
            description: "Complete 250 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 250
        },
        {
            id: "chapters-500",
            title: "Marathon",
            description: "Complete 500 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 500
        },
        {
            id: "chapters-1000",
            title: "Living Library",
            description: "Complete 1000 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 1000
        },
        {
            id: "manga-1",
            title: "First Title",
            description: "Save your first manga",
            category: "Library",
            metric: mangaCount,
            target: 1
        },
        {
            id: "manga-5",
            title: "Shelf Starter",
            description: "Save five manga",
            category: "Library",
            metric: mangaCount,
            target: 5
        },
        {
            id: "manga-10",
            title: "Collector",
            description: "Save ten manga",
            category: "Library",
            metric: mangaCount,
            target: 10
        },
        {
            id: "manga-25",
            title: "Curator",
            description: "Save 25 manga",
            category: "Library",
            metric: mangaCount,
            target: 25
        },
        {
            id: "manga-50",
            title: "Archivist",
            description: "Save 50 manga",
            category: "Library",
            metric: mangaCount,
            target: 50
        },
        {
            id: "manga-100",
            title: "Hoarder",
            description: "Save 100 manga",
            category: "Library",
            metric: mangaCount,
            target: 100
        },
        {
            id: "streak-3",
            title: "Consistent",
            description: "Keep a three-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 3
        },
        {
            id: "streak-7",
            title: "Dedicated",
            description: "Reach a seven-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 7
        },
        {
            id: "streak-14",
            title: "Committed",
            description: "Reach a fourteen-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 14
        },
        {
            id: "streak-30",
            title: "Unstoppable",
            description: "Reach a thirty-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 30
        },
        {
            id: "streak-60",
            title: "Relentless",
            description: "Reach a sixty-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 60
        },
        {
            id: "streak-100",
            title: "Centurion",
            description: "Reach a hundred-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 100
        },
        {
            id: "active-days-7",
            title: "Explorer",
            description: "Read on seven different days",
            category: "Activity",
            metric: readingDays,
            target: 7
        },
        {
            id: "active-days-30",
            title: "Regular",
            description: "Read on 30 different days",
            category: "Activity",
            metric: readingDays,
            target: 30
        },
        {
            id: "active-days-100",
            title: "Veteran",
            description: "Read on 100 different days",
            category: "Activity",
            metric: readingDays,
            target: 100
        },
        {
            id: "weekly-reader",
            title: "Weekly Reader",
            description: "Complete ten chapters in a week",
            category: "Pace",
            metric: chaptersThisWeek,
            target: 10
        },
        {
            id: "binge-week",
            title: "Binge Week",
            description: "Complete 30 chapters in a week",
            category: "Pace",
            metric: chaptersThisWeek,
            target: 30
        },
        {
            id: "day-blitz",
            title: "Day Blitz",
            description: "Complete ten chapters in a single day",
            category: "Pace",
            metric: chaptersToday,
            target: 10
        },
        {
            id: "rate-5",
            title: "Critic",
            description: "Rate five titles",
            category: "Curation",
            metric: ratedCount,
            target: 5
        },
        {
            id: "rate-25",
            title: "Reviewer",
            description: "Rate 25 titles",
            category: "Curation",
            metric: ratedCount,
            target: 25
        },
        {
            id: "categories-3",
            title: "Organizer",
            description: "Create three categories",
            category: "Curation",
            metric: categoriesCount,
            target: 3
        },
        {
            id: "manual-1",
            title: "Hands On",
            description: "Mark a title for manual tracking",
            category: "Curation",
            metric: manualCount,
            target: 1
        },
        {
            id: "complete-series-1",
            title: "The End",
            description: "Catch up to the latest chapter of a series",
            category: "Curation",
            metric: completedSeries,
            target: 1
        },
        {
            id: "complete-series-5",
            title: "Caught Up",
            description: "Catch up on five full series",
            category: "Curation",
            metric: completedSeries,
            target: 5
        },
        {
            id: "offline-5",
            title: "Going Offline",
            description: "Download five chapters for offline reading",
            category: "Offline",
            metric: downloadedChapters,
            target: 5
        },
        {
            id: "offline-25",
            title: "Stocked Up",
            description: "Download 25 chapters for offline reading",
            category: "Offline",
            metric: downloadedChapters,
            target: 25
        },
        {
            id: "sources-3",
            title: "Source Hopper",
            description: "Read from three distinct sources",
            category: "Sources",
            metric: sourcesUsed,
            target: 3
        },
        {
            id: "sources-5",
            title: "Source Connoisseur",
            description: "Read from five distinct sources",
            category: "Sources",
            metric: sourcesUsed,
            target: 5
        }
    ]

    return {
        mangaCount,
        completedChapters,
        readingDays,
        currentStreak,
        longestStreak,
        chaptersThisWeek,
        chaptersToday,
        ratedCount,
        categoriesCount,
        downloadedChapters,
        sourcesUsed,
        completedSeries,
        estimatedMinutes: completedChapters * 5,
        minutesThisWeek: chaptersThisWeek * 5,
        achievements: ACHIEVEMENT_DEFS.map(def => ({
            id: def.id,
            title: def.title,
            description: def.description,
            category: def.category,
            target: def.target,
            progress: Math.min(def.metric, def.target),
            unlocked: def.metric >= def.target
        }))
    }
}

function localDayKey(d: Date): string {
    const year = d.getFullYear()
    const month = `${d.getMonth() + 1}`.padStart(2, "0")
    const day = `${d.getDate()}`.padStart(2, "0")
    return `${year}-${month}-${day}`
}

export async function getActivityCalendar(days = 120): Promise<Array<{ date: string; count: number }>> {
    const events = await db.historyEvents.where("type").equals("completed").toArray()
    const perDay = new Map<string, Set<string>>()
    for (const event of events) {
        const key = localDayKey(new Date(event.occurredAt))
        const seen = perDay.get(key)
        if (seen) seen.add(event.chapterId)
        else perDay.set(key, new Set([event.chapterId]))
    }
    const result: Array<{ date: string; count: number }> = []
    const cursor = new Date()
    cursor.setHours(0, 0, 0, 0)
    cursor.setDate(cursor.getDate() - (days - 1))
    for (let i = 0; i < days; i += 1) {
        const key = localDayKey(cursor)
        result.push({ date: key, count: perDay.get(key)?.size ?? 0 })
        cursor.setDate(cursor.getDate() + 1)
    }
    return result
}

export async function recordAnalyticsEvent(event: Omit<AnalyticsEvent, "id">): Promise<void> {
    await db.analyticsEvents.add(event)
    // Keep last 90 days only — prune inline to avoid a separate cleanup job.
    const cutoff = Date.now() - 90 * 86_400_000
    void db.analyticsEvents.where("ts").below(cutoff).delete()
}

export async function getAnalyticsSummary(days = 30) {
    const since = Date.now() - days * 86_400_000
    const [events, allManga] = await Promise.all([
        db.analyticsEvents.where("ts").above(since).toArray(),
        db.manga.toArray()
    ])

    const sourceErrors = new Map<string, number>()
    const sourceCaptures = new Map<string, number>()
    const panelActions = new Map<string, number>()
    const errorTypeCount = new Map<string, number>()
    let captureOk = 0,
        captureErrors = 0,
        readerOpened = 0,
        onSiteTrack = 0,
        directResolves = 0,
        tabResolves = 0

    for (const ev of events) {
        if (ev.event === "capture_ok") {
            captureOk++
            if (ev.sourceId) sourceCaptures.set(ev.sourceId, (sourceCaptures.get(ev.sourceId) ?? 0) + 1)
        } else if (ev.event === "capture_error") {
            captureErrors++
            if (ev.sourceId) sourceErrors.set(ev.sourceId, (sourceErrors.get(ev.sourceId) ?? 0) + 1)
            try {
                const d = ev.detail ? (JSON.parse(ev.detail) as { errorType?: string }) : null
                const type = d?.errorType ?? "unknown"
                errorTypeCount.set(type, (errorTypeCount.get(type) ?? 0) + 1)
            } catch {
                errorTypeCount.set("unknown", (errorTypeCount.get("unknown") ?? 0) + 1)
            }
        } else if (ev.event === "reader_opened") {
            readerOpened++
        } else if (ev.event === "on_site_track") {
            onSiteTrack++
        } else if (ev.event === "resolve_direct") {
            directResolves++
        } else if (ev.event === "resolve_tab") {
            tabResolves++
        } else if (ev.event === "panel_action" && ev.detail) {
            try {
                const d = JSON.parse(ev.detail) as { action?: string }
                const a = d.action ?? "unknown"
                panelActions.set(a, (panelActions.get(a) ?? 0) + 1)
            } catch {
                // ignore malformed detail
            }
        }
    }

    const readerRate = captureOk > 0 ? Math.round((readerOpened / captureOk) * 100) : 0
    const errorRate =
        captureOk + captureErrors > 0 ? Math.round((captureErrors / (captureOk + captureErrors)) * 100) : 0

    // Aggregate genre, author, and status distributions from the full library.
    // Genres are only counted for manga that have had their genres fetched and cached.
    const genreCounts = new Map<string, number>()
    const authorCounts = new Map<string, number>()
    const statusCounts = new Map<string, number>()

    for (const m of allManga) {
        for (const g of m.genres ?? []) {
            genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1)
        }
        for (const a of m.authors ?? []) {
            authorCounts.set(a, (authorCounts.get(a) ?? 0) + 1)
        }
        const st = m.status ?? "unknown"
        statusCounts.set(st, (statusCounts.get(st) ?? 0) + 1)
    }

    return {
        days,
        captureOk,
        captureErrors,
        readerOpened,
        onSiteTrack,
        directResolves,
        tabResolves,
        readerRate,
        errorRate,
        topSources: [...sourceCaptures.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([sourceId, count]) => ({ sourceId, count })),
        topErrors: [...sourceErrors.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([sourceId, count]) => ({ sourceId, count })),
        panelActions: [...panelActions.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([action, count]) => ({ action, count })),
        topGenres: [...genreCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([genre, count]) => ({ genre, count })),
        topAuthors: [...authorCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([author, count]) => ({ author, count })),
        statusBreakdown: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
        errorTypes: [...errorTypeCount.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }))
    }
}

export async function toggleBookmark(data: Omit<PageBookmark, "id" | "addedAt">): Promise<boolean> {
    const id = `${data.chapterId}:${data.pageIndex}`
    const existing = await db.pageBookmarks.get(id)
    if (existing) {
        await db.pageBookmarks.delete(id)
        return false
    }
    await db.pageBookmarks.put({ ...data, id, addedAt: Date.now() })
    return true
}

export async function bookmarkedPagesForChapter(chapterId: string): Promise<number[]> {
    const records = await db.pageBookmarks.where("chapterId").equals(chapterId).toArray()
    return records.map(r => r.pageIndex)
}

export async function listBookmarks(): Promise<PageBookmark[]> {
    return db.pageBookmarks.orderBy("addedAt").reverse().toArray()
}

export async function removeBookmark(id: string): Promise<void> {
    await db.pageBookmarks.delete(id)
}
