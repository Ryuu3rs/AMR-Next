import type { ChapterRecord, MangaRecord, ReadingProgress, SourceLinkRecord } from "@amr/contracts"
import Dexie, { type EntityTable } from "dexie"
import { exportEnvelopeSchema } from "./schema"

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
            ...(Number.isFinite(input.chapter.sortKey) ? { latestChapterNumber: input.chapter.sortKey } : {}),
            ...(existing?.lastReadChapterId ? { lastReadChapterId: existing.lastReadChapterId } : {}),
            ...(existing?.lastReadChapterNumber !== undefined
                ? { lastReadChapterNumber: existing.lastReadChapterNumber }
                : {})
        }
        await db.manga.put(manga)
        await db.sourceLinks.put(input.sourceLink)
        await db.chapters.bulkPut(input.chapters ?? [input.chapter])
    })
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
    const result = exportEnvelopeSchema.safeParse(value)
    if (!result.success) {
        const issue = result.error.issues[0]
        const where = issue && issue.path.length > 0 ? ` at ${issue.path.join(".")}` : ""
        throw new Error(`Import file is invalid${where}: ${issue?.message ?? "unrecognized format"}`)
    }
    // Validated above; cast bridges Zod's `key?: T | undefined` optionals to the
    // Dexie insert types' `key?: T` under exactOptionalPropertyTypes.
    const data = result.data.data as {
        manga: LibraryManga[]
        sourceLinks: SourceLinkRecord[]
        chapters: ChapterRecord[]
        progress: ReadingProgress[]
        historyEvents: HistoryEvent[]
    }
    await db.transaction("rw", [db.manga, db.sourceLinks, db.chapters, db.progress, db.historyEvents], async () => {
        await db.manga.bulkPut(data.manga)
        await db.sourceLinks.bulkPut(data.sourceLinks)
        await db.chapters.bulkPut(data.chapters)
        await db.progress.bulkPut(data.progress)
        await db.historyEvents.bulkPut(data.historyEvents)
    })
    return { manga: data.manga.length, chapters: data.chapters.length }
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
                authors: [],
                status: "ongoing",
                sourceId: "mangadex",
                sourceUrl: "https://mangadex.org/chapter/3dff8b5f-844e-4964-abd7-641c34f1f091",
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
                authors: [],
                status: "ongoing",
                sourceId: "mangaread",
                sourceUrl: "https://www.mangaread.org/manga/entomologist-in-sichuan-tang-clan/chapter-79/?style=list",
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
                authors: [],
                status: "ongoing",
                sourceId: "mangaread",
                sourceUrl:
                    "https://www.mangaread.org/manga/legendary-youngest-son-of-the-marquis-house/chapter-161/?style=list",
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
                authors: [],
                status: "ongoing",
                sourceId: "mgeko",
                sourceUrl: "https://www.mgeko.cc/reader/en/barbarians-adventure-in-a-fantasy-world-chapter-52-eng-li/",
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
        url: e.chapterUrl,
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
