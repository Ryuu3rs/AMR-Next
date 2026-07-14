import "fake-indexeddb/auto"
import type { ChapterRecord, MangaRecord, SourceLinkRecord } from "@amr/contracts"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../database"
import type { LibraryManga } from "../database"

vi.mock("../sources", async () => {
    const actual = await vi.importActual<typeof import("../sources")>("../sources")
    return {
        ...actual,
        resolveChapterUrl: vi.fn(),
        resolveCoverFor: vi.fn(),
        listChaptersForSource: vi.fn(),
        findSource: vi.fn()
    }
})

vi.mock("../background/covers", () => ({
    inlineCover: vi.fn()
}))

vi.mock("../background/chapter-cache", () => ({
    scheduleChapterListRefresh: vi.fn()
}))

const { libraryHandlers } = await import("./library")
const { resolveChapterUrl, listChaptersForSource, findSource, resolveCoverFor } = await import("../sources")
const { inlineCover } = await import("../background/covers")

const ctx = { sender: {} } as never

const manga: MangaRecord = {
    id: "mangadex:manga:abc",
    title: "Test Manga",
    normalizedTitle: "test manga",
    authors: [],
    status: "ongoing",
    addedAt: 1,
    updatedAt: 1
}

const sourceLink: SourceLinkRecord = {
    mangaId: manga.id,
    sourceId: "mangadex",
    url: "https://mangadex.org/title/abc",
    addedAt: 1,
    updatedAt: 1
}

beforeEach(async () => {
    vi.clearAllMocks()
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

describe("library:switch", () => {
    it("deletes the old mirror's chapters and preserves user fields on the manga record", async () => {
        const libraryManga: LibraryManga = {
            ...manga,
            sourceId: "mangadex",
            sourceUrl: sourceLink.url,
            sourceMangaId: "abc",
            mangaUrl: "https://mangadex.org/title/abc",
            rating: 4,
            categories: ["fav"]
        }
        await db.manga.put(libraryManga)
        await db.sourceLinks.put(sourceLink)

        const oldChapter: ChapterRecord = {
            id: "mangadex:chapter:old-1",
            mangaId: manga.id,
            sourceId: "mangadex",
            title: "Old Chapter 1",
            url: "https://mangadex.org/chapter/old-1",
            sortKey: 1
        }
        await db.chapters.put(oldChapter)

        const newChapter: ChapterRecord = {
            id: "othermirror:chapter:new-1",
            mangaId: manga.id,
            sourceId: "othermirror",
            title: "New Chapter 1",
            url: "https://othermirror.example/chapter/new-1",
            sortKey: 1
        }
        vi.mocked(listChaptersForSource).mockResolvedValue([newChapter] as never)

        const handler = libraryHandlers["library:switch"]!
        await handler(
            {
                type: "library:switch",
                mangaId: manga.id,
                sourceId: "othermirror",
                sourceMangaId: "new-src-id",
                mangaUrl: "https://othermirror.example/title/new-src-id"
            } as never,
            ctx
        )

        const chaptersAfter = await db.chapters.where("mangaId").equals(manga.id).toArray()
        expect(chaptersAfter.map(c => c.id).sort()).toEqual([newChapter.id])
        expect(chaptersAfter.some(c => c.sourceId !== "othermirror")).toBe(false)

        const stored = await db.manga.get(manga.id)
        expect(stored?.rating).toBe(4)
        expect(stored?.categories).toEqual(["fav"])
        expect(stored?.sourceId).toBe("othermirror")
    })

    it("flags chapterNumberingUnreliable when switching to mangahub from a different source with existing read progress", async () => {
        const libraryManga: LibraryManga = {
            ...manga,
            sourceId: "mangadex",
            sourceUrl: sourceLink.url,
            sourceMangaId: "abc",
            mangaUrl: "https://mangadex.org/title/abc",
            lastReadChapterNumber: 50
        }
        await db.manga.put(libraryManga)
        await db.sourceLinks.put(sourceLink)

        const newChapter: ChapterRecord = {
            id: "mangahub:chapter:new-1",
            mangaId: manga.id,
            sourceId: "mangahub",
            title: "Chapter 45",
            url: "https://mangahub.io/chapter/new-src-id/chapter-45",
            sortKey: 45
        }
        vi.mocked(listChaptersForSource).mockResolvedValue([newChapter] as never)

        const handler = libraryHandlers["library:switch"]!
        await handler(
            {
                type: "library:switch",
                mangaId: manga.id,
                sourceId: "mangahub",
                sourceMangaId: "new-src-id",
                mangaUrl: "https://mangahub.io/manga/new-src-id"
            } as never,
            ctx
        )

        const stored = (await db.manga.get(manga.id)) as
            | (LibraryManga & { chapterNumberingUnreliable?: boolean })
            | undefined
        expect(stored?.chapterNumberingUnreliable).toBe(true)
        // The old source's read-progress number itself is left untouched by the switch.
        expect(stored?.lastReadChapterNumber).toBe(50)
    })

    it("does not flag chapterNumberingUnreliable when switching between two non-mangahub sources", async () => {
        const libraryManga: LibraryManga = {
            ...manga,
            sourceId: "mangadex",
            sourceUrl: sourceLink.url,
            sourceMangaId: "abc",
            mangaUrl: "https://mangadex.org/title/abc",
            lastReadChapterNumber: 50
        }
        await db.manga.put(libraryManga)
        await db.sourceLinks.put(sourceLink)

        const newChapter: ChapterRecord = {
            id: "othermirror:chapter:new-1",
            mangaId: manga.id,
            sourceId: "othermirror",
            title: "New Chapter 1",
            url: "https://othermirror.example/chapter/new-1",
            sortKey: 1
        }
        vi.mocked(listChaptersForSource).mockResolvedValue([newChapter] as never)

        const handler = libraryHandlers["library:switch"]!
        await handler(
            {
                type: "library:switch",
                mangaId: manga.id,
                sourceId: "othermirror",
                sourceMangaId: "new-src-id",
                mangaUrl: "https://othermirror.example/title/new-src-id"
            } as never,
            ctx
        )

        const stored = (await db.manga.get(manga.id)) as
            | (LibraryManga & { chapterNumberingUnreliable?: boolean })
            | undefined
        expect(stored?.chapterNumberingUnreliable).toBeUndefined()
    })
})

describe("library:relink", () => {
    it("preserves user fields and coverUrl through the relink, and removes the old-id record", async () => {
        const oldId = manga.id
        const newId = "webtoons:manga:xyz"

        const libraryManga: LibraryManga = {
            ...manga,
            id: oldId,
            sourceId: "mangadex",
            sourceUrl: sourceLink.url,
            sourceMangaId: "abc",
            mangaUrl: "https://mangadex.org/title/abc",
            rating: 5,
            categories: ["action", "fav"],
            lastReadChapterId: "mangadex:chapter:3",
            addedAt: 12345,
            coverUrl: "https://existing-cdn.example/cover.jpg"
        }
        await db.manga.put(libraryManga)
        await db.sourceLinks.put({ ...sourceLink, mangaId: oldId })

        const resolvedChapter: ChapterRecord & { sourceChapterId: string; language: string } = {
            id: "webtoons:chapter:1",
            mangaId: newId,
            sourceId: "webtoons",
            title: "Episode 1",
            url: "https://www.webtoons.com/en/x/y/ep-1/viewer?title_no=99&episode_no=1",
            sortKey: 1,
            sourceChapterId: "1",
            language: "en"
        }

        const resolvedManga: MangaRecord = {
            id: newId,
            title: "Relinked Title",
            normalizedTitle: "relinked title",
            authors: [],
            status: "ongoing",
            addedAt: 999,
            updatedAt: 999,
            coverUrl: "https://new-cdn.example/cover.jpg"
        }

        vi.mocked(resolveChapterUrl).mockResolvedValue({
            manga: {
                manga: resolvedManga,
                sourceId: "webtoons",
                sourceMangaId: "99",
                url: "https://www.webtoons.com/en/x/y/"
            },
            chapter: resolvedChapter,
            pages: []
        } as never)
        vi.mocked(findSource).mockReturnValue({ manifest: { id: "webtoons" } } as never)

        const { libraryHandlers } = await import("./library")
        const handler = libraryHandlers["library:relink"]!
        const result = (await handler(
            {
                type: "library:relink",
                mangaId: oldId,
                url: resolvedChapter.url
            } as never,
            ctx
        )) as { sourceId: string; mangaId: string }

        expect(result.mangaId).toBe(newId)
        expect(await db.manga.get(oldId)).toBeUndefined()

        const stored = await db.manga.get(newId)
        expect(stored?.rating).toBe(5)
        expect(stored?.categories).toEqual(["action", "fav"])
        expect(stored?.lastReadChapterId).toBe("mangadex:chapter:3")
        expect(stored?.addedAt).toBe(12345)
        // Existing cover is preferred over the newly resolved one.
        expect(stored?.coverUrl).toBe("https://existing-cdn.example/cover.jpg")
    })
})

describe("library:covers:backfill", () => {
    it("skips seed- ids and already-inlined data: covers, and doesn't retry a failed id twice", async () => {
        const { libraryHandlers } = await import("./library")

        const seedManga: LibraryManga = {
            ...manga,
            id: "seed-1",
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/1",
            coverUrl: undefined
        }
        const alreadyInlined: LibraryManga = {
            ...manga,
            id: "mangadex:manga:inlined",
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/2",
            coverUrl: "data:image/png;base64,AAAA"
        }
        const needsBackfill: LibraryManga = {
            ...manga,
            id: "mangadex:manga:needs-backfill",
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/3",
            coverUrl: "https://cdn.example/cover.jpg"
        }
        // Pad past the 20-item batch size with extra targets so `remaining` stays > 0 after
        // the first pass - otherwise the handler clears its dedup Set at the end of the pass
        // and the "don't retry" behavior below wouldn't actually be exercised.
        const padding: LibraryManga[] = Array.from({ length: 25 }, (_, i) => ({
            ...manga,
            id: `mangadex:manga:pad-${i}`,
            sourceId: "mangadex",
            sourceUrl: `https://mangadex.org/chapter/pad-${i}`,
            coverUrl: `https://cdn.example/pad-${i}.jpg`
        }))
        await db.manga.bulkPut([seedManga, alreadyInlined, needsBackfill, ...padding])

        vi.mocked(inlineCover).mockResolvedValue(undefined)
        // Prevent the raw fetch() call inside the handler from throwing in the test env.
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

        const handler = libraryHandlers["library:covers:backfill"]!
        const first = (await handler({ type: "library:covers:backfill" } as never, ctx)) as {
            updated: number
            remaining: number
        }

        // needsBackfill was within the first batch and got attempted; seed- and data: ids
        // were filtered out regardless of batch position.
        expect(inlineCover).toHaveBeenCalledWith("https://cdn.example/cover.jpg")
        expect(inlineCover).not.toHaveBeenCalledWith("data:image/png;base64,AAAA")
        expect(first.updated).toBe(0)
        expect(first.remaining).toBeGreaterThan(0)

        vi.mocked(inlineCover).mockClear()

        // Second call in the same run must not retry needsBackfill again - it's already
        // tracked in coverBackfillAttempted from the first pass.
        await handler({ type: "library:covers:backfill" } as never, ctx)
        expect(inlineCover).not.toHaveBeenCalledWith("https://cdn.example/cover.jpg")

        vi.unstubAllGlobals()
    })

    it("re-resolves a fresh cover when the stored remote URL is stale and the adapter supports resolveCover", async () => {
        const { libraryHandlers } = await import("./library")

        const staleCover: LibraryManga = {
            ...manga,
            id: "webtoons:manga:8579",
            sourceId: "webtoons",
            sourceMangaId: "8579",
            mangaUrl: "https://www.webtoons.com/en/romance/daisy-how-to-become-the-dukes-fiancee/list?title_no=8579",
            sourceUrl:
                "https://www.webtoons.com/en/romance/daisy-how-to-become-the-dukes-fiancee/episode-1/viewer?title_no=8579&episode_no=1",
            coverUrl: "https://stale-cdn.example/old-cover.jpg"
        }
        await db.manga.put(staleCover)

        // The stale stored URL fails to inline; a freshly resolved URL succeeds.
        vi.mocked(inlineCover).mockImplementation(async url =>
            url === "https://fresh-cdn.example/new-cover.jpg" ? "data:image/png;base64,ZZZZ" : undefined
        )
        vi.mocked(resolveCoverFor).mockResolvedValue("https://fresh-cdn.example/new-cover.jpg")
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

        const handler = libraryHandlers["library:covers:backfill"]!
        const result = (await handler({ type: "library:covers:backfill" } as never, ctx)) as {
            updated: number
            remaining: number
        }

        expect(inlineCover).toHaveBeenCalledWith("https://stale-cdn.example/old-cover.jpg")
        expect(inlineCover).toHaveBeenCalledWith("https://fresh-cdn.example/new-cover.jpg")
        expect(resolveCoverFor).toHaveBeenCalledWith(expect.objectContaining({ id: "webtoons:manga:8579" }))
        expect(result.updated).toBe(1)

        const stored = await db.manga.get("webtoons:manga:8579")
        expect(stored?.coverUrl).toBe("data:image/png;base64,ZZZZ")

        vi.unstubAllGlobals()
    })
})

describe("library:dismiss", () => {
    it("rewrites sourceId to manual only when the current sourceId looks hostname-style", async () => {
        const { libraryHandlers } = await import("./library")
        const handler = libraryHandlers["library:dismiss"]!

        const broken: LibraryManga = {
            ...manga,
            id: "broken-1",
            sourceId: "some.broken.host",
            sourceUrl: "https://some.broken.host/x"
        }
        await db.manga.put(broken)
        await handler({ type: "library:dismiss", mangaId: broken.id } as never, ctx)
        const storedBroken = await db.manga.get(broken.id)
        expect(storedBroken?.sourceId).toBe("manual")
        expect(storedBroken?.manualTracking).toBe(true)

        const normal: LibraryManga = {
            ...manga,
            id: "normal-1",
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/1"
        }
        await db.manga.put(normal)
        await handler({ type: "library:dismiss", mangaId: normal.id } as never, ctx)
        const storedNormal = await db.manga.get(normal.id)
        expect(storedNormal?.sourceId).toBe("mangadex")
        expect(storedNormal?.manualTracking).toBeUndefined()
    })
})

describe("library:numbers", () => {
    it("clears latestChapterNumber when null but leaves an omitted lastReadChapterNumber untouched", async () => {
        const { libraryHandlers } = await import("./library")
        const handler = libraryHandlers["library:numbers"]!

        const existing: LibraryManga = {
            ...manga,
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/1",
            latestChapterNumber: 10,
            lastReadChapterNumber: 5
        }
        await db.manga.put(existing)

        await handler(
            {
                type: "library:numbers",
                mangaId: manga.id,
                latestChapterNumber: null
                // lastReadChapterNumber intentionally omitted
            } as never,
            ctx
        )

        const stored = await db.manga.get(manga.id)
        expect(stored?.latestChapterNumber).toBeUndefined()
        expect(stored?.lastReadChapterNumber).toBe(5)
    })
})

describe("library:reading-prefs", () => {
    it("sets an explicit per-series noGapContinuous override", async () => {
        const { libraryHandlers } = await import("./library")
        const handler = libraryHandlers["library:reading-prefs"]!

        const existing: LibraryManga = {
            ...manga,
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/1"
        }
        await db.manga.put(existing)

        await handler({ type: "library:reading-prefs", mangaId: manga.id, noGapContinuous: true } as never, ctx)

        const stored = await db.manga.get(manga.id)
        expect(stored?.noGapContinuous).toBe(true)
    })

    it("clears noGapContinuous back to undefined when set to null, leaving readingDirection untouched", async () => {
        const { libraryHandlers } = await import("./library")
        const handler = libraryHandlers["library:reading-prefs"]!

        const existing: LibraryManga = {
            ...manga,
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/1",
            readingDirection: "rtl",
            noGapContinuous: true
        }
        await db.manga.put(existing)

        await handler(
            {
                type: "library:reading-prefs",
                mangaId: manga.id,
                noGapContinuous: null
                // readingDirection intentionally omitted
            } as never,
            ctx
        )

        const stored = await db.manga.get(manga.id)
        expect(stored?.noGapContinuous).toBeUndefined()
        expect(stored?.readingDirection).toBe("rtl")
    })
})
