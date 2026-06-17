import "fake-indexeddb/auto"
import type { ChapterRecord, MangaRecord, ReadingProgress, SourceLinkRecord } from "@amr/contracts"
import { beforeEach, describe, expect, it } from "vitest"
import {
    db,
    exportDatabase,
    getLocalStats,
    importDatabase,
    removeManga,
    saveProgress,
    saveResolvedChapter,
    seedDatabase
} from "./database"

const manga: MangaRecord = {
    id: "mangadex:manga:abc",
    title: "Test Manga",
    normalizedTitle: "test manga",
    authors: [],
    status: "ongoing",
    addedAt: 1,
    updatedAt: 1
}

const chapter: ChapterRecord = {
    id: "mangadex:chapter:1",
    mangaId: manga.id,
    sourceId: "mangadex",
    title: "Chapter 5",
    url: "https://mangadex.org/chapter/1",
    sortKey: 5
}

const sourceLink: SourceLinkRecord = {
    mangaId: manga.id,
    sourceId: "mangadex",
    url: "https://mangadex.org/title/abc",
    addedAt: 1,
    updatedAt: 1
}

beforeEach(async () => {
    await Promise.all([
        db.manga.clear(),
        db.sourceLinks.clear(),
        db.chapters.clear(),
        db.progress.clear(),
        db.historyEvents.clear(),
        db.downloads.clear(),
        db.covers.clear()
    ])
})

describe("saveResolvedChapter", () => {
    it("persists manga, chapter, link, and the latest chapter number", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        const stored = await db.manga.get(manga.id)
        expect(stored?.latestChapterId).toBe(chapter.id)
        expect(stored?.latestChapterNumber).toBe(5)
        expect(await db.chapters.get(chapter.id)).toBeDefined()
        expect(await db.sourceLinks.get(manga.id)).toBeDefined()
    })
})

describe("saveProgress", () => {
    it("records read chapter number + lastReadAt and emits history events", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        const progress: ReadingProgress = {
            mangaId: manga.id,
            chapterId: chapter.id,
            pageIndex: 9,
            pageCount: 10,
            completed: true,
            updatedAt: 1_700_000_000_000
        }
        await saveProgress(progress)

        const stored = await db.manga.get(manga.id)
        expect(stored?.lastReadChapterNumber).toBe(5)
        expect(stored?.lastReadAt).toBe(progress.updatedAt)

        const events = await db.historyEvents.toArray()
        expect(events.map(e => e.type).sort()).toEqual(["completed", "started"])
    })
})

describe("export / import round-trip", () => {
    it("preserves extended library fields (rating, categories, chapter numbers)", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await db.manga.update(manga.id, { rating: 4, categories: ["fav", "action"], lastReadChapterNumber: 3 })

        const envelope = await exportDatabase()
        await db.manga.clear()
        await db.chapters.clear()
        await db.sourceLinks.clear()

        const result = await importDatabase(envelope)
        expect(result.manga).toBe(1)
        const restored = await db.manga.get(manga.id)
        expect(restored?.rating).toBe(4)
        expect(restored?.categories).toEqual(["fav", "action"])
        expect(restored?.lastReadChapterNumber).toBe(3)
        expect(restored?.latestChapterNumber).toBe(5)
    })

    it("rejects a malformed envelope", async () => {
        await expect(importDatabase({ format: "wrong", version: 9, data: {} })).rejects.toThrow(/invalid/i)
    })

    it("accepts legacy envelope with missing optional tables", async () => {
        const legacyEnvelope = {
            format: "all-mangas-reader",
            version: 1,
            data: {
                manga: [
                    {
                        id: "legacy-1",
                        title: "Legacy Manga",
                        normalizedTitle: "legacy manga",
                        authors: [],
                        status: "ongoing",
                        sourceId: "mangadex",
                        sourceUrl: "https://mangadex.org/chapter/x",
                        sourceMangaId: "legacy-src-id",
                        mangaUrl: "https://mangadex.org/title/legacy-id",
                        addedAt: Date.now(),
                        updatedAt: Date.now()
                    }
                ]
                // sourceLinks, chapters, progress, historyEvents intentionally omitted
            }
        }

        const result = await importDatabase(legacyEnvelope)
        expect(result.manga).toBe(1)
        expect(result.chapters).toBe(0)

        const restored = await db.manga.get("legacy-1")
        expect(restored?.title).toBe("Legacy Manga")
    })
})

describe("seedDatabase", () => {
    it("is idempotent — re-seeding does not duplicate", async () => {
        await seedDatabase()
        const first = await db.manga.where("id").startsWith("seed-").count()
        await seedDatabase()
        const second = await db.manga.where("id").startsWith("seed-").count()
        expect(second).toBe(first)
        expect(first).toBeGreaterThan(0)
    })
})

describe("getLocalStats", () => {
    it("computes streaks from history days", async () => {
        const day = 86_400_000
        const base = Date.parse("2026-06-10T12:00:00Z")
        await db.historyEvents.bulkAdd([
            { mangaId: manga.id, chapterId: "c1", type: "completed", occurredAt: base },
            { mangaId: manga.id, chapterId: "c2", type: "completed", occurredAt: base + day },
            { mangaId: manga.id, chapterId: "c3", type: "completed", occurredAt: base + 2 * day }
        ])
        const stats = await getLocalStats()
        expect(stats.readingDays).toBe(3)
        expect(stats.longestStreak).toBe(3)
    })
})

describe("removeManga", () => {
    it("cascades delete to chapters, progress, history events, and source link", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await saveProgress({
            mangaId: manga.id,
            chapterId: chapter.id,
            pageIndex: 9,
            pageCount: 10,
            completed: true,
            updatedAt: 1_700_000_000_000
        })

        await removeManga(manga.id)

        expect(await db.manga.get(manga.id)).toBeUndefined()
        expect(await db.sourceLinks.get(manga.id)).toBeUndefined()
        expect(await db.chapters.where("mangaId").equals(manga.id).count()).toBe(0)
        expect(await db.progress.where("mangaId").equals(manga.id).count()).toBe(0)
        expect(await db.historyEvents.where("mangaId").equals(manga.id).count()).toBe(0)
    })

    it("does not remove other manga's data", async () => {
        const manga2: MangaRecord = {
            ...manga,
            id: "mangadex:manga:xyz",
            title: "Other Manga",
            normalizedTitle: "other manga"
        }
        const chapter2: ChapterRecord = { ...chapter, id: "mangadex:chapter:2", mangaId: manga2.id }
        const sourceLink2: SourceLinkRecord = { ...sourceLink, mangaId: manga2.id }

        await saveResolvedChapter({ manga, chapter, sourceLink })
        await saveResolvedChapter({ manga: manga2, chapter: chapter2, sourceLink: sourceLink2 })

        await removeManga(manga.id)

        expect(await db.manga.get(manga2.id)).toBeDefined()
        expect(await db.chapters.where("mangaId").equals(manga2.id).count()).toBe(1)
        expect(await db.sourceLinks.get(manga2.id)).toBeDefined()
    })
})

describe("export / import integrity", () => {
    it("export→import→export produces identical data", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await db.manga.update(manga.id, { rating: 4, categories: ["action"], lastReadChapterNumber: 3 })

        const first = await exportDatabase()

        await db.manga.clear()
        await db.chapters.clear()
        await db.sourceLinks.clear()
        await db.progress.clear()
        await db.historyEvents.clear()

        await importDatabase(first)
        const second = await exportDatabase()

        expect(second.data.manga).toEqual(first.data.manga)
        expect(second.data.chapters).toEqual(first.data.chapters)
        expect(second.data.sourceLinks).toEqual(first.data.sourceLinks)
        expect(second.data.progress).toEqual(first.data.progress)
        expect(second.data.historyEvents).toEqual(first.data.historyEvents)
    })
})
