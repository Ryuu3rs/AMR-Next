import "fake-indexeddb/auto"
import type { ChapterRecord, MangaRecord, ReadingProgress, SourceLinkRecord } from "@amr/contracts"
import { beforeEach, describe, expect, it } from "vitest"
import {
    db,
    exportDatabase,
    getLocalStats,
    importDatabase,
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
        db.historyEvents.clear()
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
