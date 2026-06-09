import type { ChapterRecord, MangaRecord, ReadingProgress, SourceLinkRecord } from "@amr/contracts"
import Dexie, { type EntityTable } from "dexie"

export type LibraryManga = MangaRecord & {
    sourceId: string
    sourceUrl: string
    sourceMangaId?: string
    mangaUrl?: string
    latestChapterId?: string
    lastReadChapterId?: string
}

export type HistoryEvent = {
    id?: number
    mangaId: string
    chapterId: string
    type: "started" | "completed"
    occurredAt: number
}

export class AmrDatabase extends Dexie {
    manga!: EntityTable<LibraryManga, "id">
    sourceLinks!: EntityTable<SourceLinkRecord, "mangaId">
    chapters!: EntityTable<ChapterRecord, "id">
    progress!: EntityTable<ReadingProgress, "chapterId">
    historyEvents!: EntityTable<HistoryEvent, "id">

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
    }
}

export const db = new AmrDatabase()

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
            ...(existing?.lastReadChapterId ? { lastReadChapterId: existing.lastReadChapterId } : {})
        }
        await db.manga.put(manga)
        await db.sourceLinks.put(input.sourceLink)
        await db.chapters.bulkPut(input.chapters ?? [input.chapter])
    })
}

export async function saveProgress(progress: ReadingProgress): Promise<void> {
    await db.transaction("rw", db.progress, db.manga, db.historyEvents, async () => {
        const existing = await db.progress.get(progress.chapterId)
        await db.progress.put(progress)
        await db.manga.update(progress.mangaId, {
            lastReadChapterId: progress.chapterId,
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

export async function importDatabase(value: unknown): Promise<{ manga: number; chapters: number }> {
    if (!value || typeof value !== "object") throw new Error("Import file is invalid")
    const envelope = value as {
        format?: unknown
        version?: unknown
        data?: {
            manga?: LibraryManga[]
            sourceLinks?: SourceLinkRecord[]
            chapters?: ChapterRecord[]
            progress?: ReadingProgress[]
            historyEvents?: HistoryEvent[]
        }
    }
    if (envelope.format !== "all-mangas-reader" || envelope.version !== 1 || !envelope.data) {
        throw new Error("Import format or version is not supported")
    }

    const manga = envelope.data.manga ?? []
    const chapters = envelope.data.chapters ?? []
    await db.transaction("rw", [db.manga, db.sourceLinks, db.chapters, db.progress, db.historyEvents], async () => {
        await db.manga.bulkPut(manga)
        await db.sourceLinks.bulkPut(envelope.data?.sourceLinks ?? [])
        await db.chapters.bulkPut(chapters)
        await db.progress.bulkPut(envelope.data?.progress ?? [])
        await db.historyEvents.bulkPut(envelope.data?.historyEvents ?? [])
    })
    return { manga: manga.length, chapters: chapters.length }
}

export async function seedDatabase(): Promise<void> {
    const now = Date.now()
    const seedManga: LibraryManga[] = [
        {
            id: "seed-md-001",
            title: "Chainsaw Man",
            normalizedTitle: "chainsaw man",
            authors: [],
            status: "ongoing",
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/seed-c1",
            addedAt: now - 86400000 * 7,
            updatedAt: now - 3600000 * 2,
            latestChapterId: "seed-c1"
        },
        {
            id: "seed-md-002",
            title: "Jujutsu Kaisen",
            normalizedTitle: "jujutsu kaisen",
            authors: [],
            status: "ongoing",
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/seed-c2",
            addedAt: now - 86400000 * 5,
            updatedAt: now - 3600000 * 5,
            latestChapterId: "seed-c2"
        },
        {
            id: "seed-md-003",
            title: "Blue Lock",
            normalizedTitle: "blue lock",
            authors: [],
            status: "ongoing",
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/seed-c3",
            addedAt: now - 86400000 * 3,
            updatedAt: now - 3600000 * 8,
            latestChapterId: "seed-c3"
        },
        {
            id: "seed-md-004",
            title: "Spy x Family",
            normalizedTitle: "spy x family",
            authors: [],
            status: "ongoing",
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/seed-c4",
            addedAt: now - 86400000 * 2,
            updatedAt: now - 3600000 * 12,
            latestChapterId: "seed-c4"
        },
        {
            id: "seed-md-005",
            title: "Dungeon Meshi",
            normalizedTitle: "dungeon meshi",
            authors: [],
            status: "completed",
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/seed-c5",
            addedAt: now - 86400000 * 1,
            updatedAt: now - 3600000 * 1,
            latestChapterId: "seed-c5"
        }
    ]
    const seedChapters: import("@amr/contracts").ChapterRecord[] = seedManga.map(m => ({
        id: m.latestChapterId!,
        mangaId: m.id,
        sourceId: "mangadex",
        title: "Chapter 1",
        sortKey: 1,
        url: m.sourceUrl,
        addedAt: m.addedAt
    }))
    const seedLinks: import("@amr/contracts").SourceLinkRecord[] = seedManga.map(m => ({
        mangaId: m.id,
        sourceId: "mangadex",
        sourceMangaId: m.id,
        url: m.sourceUrl,
        title: m.title,
        addedAt: m.addedAt,
        updatedAt: m.updatedAt
    }))
    await db.transaction("rw", db.manga, db.sourceLinks, db.chapters, async () => {
        await db.manga.bulkPut(seedManga)
        await db.sourceLinks.bulkPut(seedLinks)
        await db.chapters.bulkPut(seedChapters)
    })
}

export async function getLocalStats() {
    const [mangaCount, progress, history] = await Promise.all([
        db.manga.count(),
        db.progress.toArray(),
        db.historyEvents.orderBy("occurredAt").toArray()
    ])
    const completedChapters = progress.filter(item => item.completed).length
    const readingDays = new Set(history.map(event => new Date(event.occurredAt).toISOString().slice(0, 10))).size

    return {
        mangaCount,
        completedChapters,
        readingDays,
        achievements: [
            {
                id: "first-chapter",
                title: "First Chapter",
                description: "Complete one chapter",
                unlocked: completedChapters >= 1,
                progress: Math.min(completedChapters, 1),
                target: 1
            },
            {
                id: "shelf-starter",
                title: "Shelf Starter",
                description: "Add five manga",
                unlocked: mangaCount >= 5,
                progress: Math.min(mangaCount, 5),
                target: 5
            },
            {
                id: "page-turner",
                title: "Page Turner",
                description: "Complete 100 chapters",
                unlocked: completedChapters >= 100,
                progress: Math.min(completedChapters, 100),
                target: 100
            }
        ]
    }
}
