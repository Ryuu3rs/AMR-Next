import "fake-indexeddb/auto"
import type { ChapterRecord } from "@amr/contracts"
import { SourceRequestError } from "@amr/source-sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { HandlerContext } from "../background/handler-types"
import type { LibraryManga } from "../database"

const resolveChapterUrlMock = vi.fn()
const resolveChapterFromHtmlMock = vi.fn()
const listChaptersBySourceMock = vi.fn()
const findSourceMock = vi.fn()
const getSourceByIdMock = vi.fn()

vi.mock("../sources", () => ({
    findSource: (...args: unknown[]) => findSourceMock(...args),
    getSourceById: (...args: unknown[]) => getSourceByIdMock(...args),
    resolveChapterUrl: (...args: unknown[]) => resolveChapterUrlMock(...args),
    resolveChapterFromHtml: (...args: unknown[]) => resolveChapterFromHtmlMock(...args),
    listChaptersBySource: (...args: unknown[]) => listChaptersBySourceMock(...args)
}))

const fetchChapterHtmlViaTabMock = vi.fn()
vi.mock("../background/tab-fetch", () => ({
    fetchChapterHtmlViaTab: (...args: unknown[]) => fetchChapterHtmlViaTabMock(...args)
}))

const getSettingsMock = vi.fn()
vi.mock("../settings", () => ({
    getSettings: (...args: unknown[]) => getSettingsMock(...args)
}))

const { db } = await import("../database")
const { readerHandlers } = await import("./reader")
const { captureChapter } = await import("../background/capture")

vi.spyOn(await import("../background/chapter-cache"), "scheduleChapterListRefresh").mockImplementation(() => {})

// captureChapter's success/external paths call flashAddedBadge(), which touches the
// WebExtension `browser` global - not present under vitest's node environment (WXT
// normally injects it). Stub just enough of the surface for these tests.
vi.stubGlobal("browser", {
    action: {
        setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
        setBadgeText: vi.fn().mockResolvedValue(undefined)
    }
})

const mkCtx = (): HandlerContext => ({ sender: {} as HandlerContext["sender"] })

const manga: LibraryManga = {
    id: "mangadex:manga:abc",
    title: "Test Manga",
    normalizedTitle: "test manga",
    authors: [],
    status: "ongoing",
    addedAt: 1,
    updatedAt: 1,
    sourceId: "mangadex",
    sourceUrl: "https://mangadex.org/title/abc"
}

function chapter(id: string, sortKey: number, url: string): ChapterRecord {
    return {
        id,
        mangaId: manga.id,
        sourceId: "mangadex",
        title: `Chapter ${sortKey}`,
        url,
        sortKey
    }
}

beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all([db.manga.clear(), db.chapters.clear(), db.progress.clear(), db.historyEvents.clear()])
})

describe("chapter:siblings", () => {
    it("returns prev/next for a chapter in the middle of a sorted list", async () => {
        await db.manga.put(manga)
        await db.chapters.bulkPut([
            chapter("c1", 1, "https://mangadex.org/chapter/1"),
            chapter("c2", 2, "https://mangadex.org/chapter/2"),
            chapter("c3", 3, "https://mangadex.org/chapter/3")
        ])

        const result = (await readerHandlers["chapter:siblings"]!(
            { type: "chapter:siblings", url: "https://mangadex.org/chapter/2" },
            mkCtx()
        )) as { prevUrl: string | null; nextUrl: string | null }

        expect(result.prevUrl).toBe("https://mangadex.org/chapter/1")
        expect(result.nextUrl).toBe("https://mangadex.org/chapter/3")
    })

    it("returns null at both ends of the list", async () => {
        await db.manga.put(manga)
        await db.chapters.bulkPut([
            chapter("c1", 1, "https://mangadex.org/chapter/1"),
            chapter("c2", 2, "https://mangadex.org/chapter/2"),
            chapter("c3", 3, "https://mangadex.org/chapter/3")
        ])

        const first = (await readerHandlers["chapter:siblings"]!(
            { type: "chapter:siblings", url: "https://mangadex.org/chapter/1" },
            mkCtx()
        )) as { prevUrl: string | null; nextUrl: string | null }
        expect(first.prevUrl).toBeNull()
        expect(first.nextUrl).toBe("https://mangadex.org/chapter/2")

        const last = (await readerHandlers["chapter:siblings"]!(
            { type: "chapter:siblings", url: "https://mangadex.org/chapter/3" },
            mkCtx()
        )) as { prevUrl: string | null; nextUrl: string | null }
        expect(last.prevUrl).toBe("https://mangadex.org/chapter/2")
        expect(last.nextUrl).toBeNull()
    })

    it("returns null for a URL that is not in the DB at all", async () => {
        const result = (await readerHandlers["chapter:siblings"]!(
            { type: "chapter:siblings", url: "https://mangadex.org/chapter/unknown" },
            mkCtx()
        )) as { prevUrl: string | null; nextUrl: string | null; mangaTitle: string | null; chapterTitle: string | null }

        expect(result).toEqual({ prevUrl: null, nextUrl: null, mangaTitle: null, chapterTitle: null })
    })
})

describe("captureChapter dedup", () => {
    it("only runs the underlying capture logic once for concurrent calls with the same URL", async () => {
        const source = {
            manifest: { id: "mangadex" },
            match: vi.fn().mockReturnValue("chapter"),
            parseMangaUrl: vi.fn().mockReturnValue(null)
        }
        findSourceMock.mockReturnValue(source)
        getSettingsMock.mockResolvedValue({ autoAdd: true })

        let resolveCalls = 0
        resolveChapterUrlMock.mockImplementation(async () => {
            resolveCalls += 1
            // Simulate network latency so both calls are truly concurrent.
            await new Promise(r => setTimeout(r, 10))
            return {
                manga: {
                    manga: { ...manga, id: "mangadex:manga:dedup" },
                    sourceId: "mangadex",
                    sourceMangaId: "dedup",
                    url: "https://mangadex.org/title/dedup"
                },
                chapter: chapter("mangadex:chapter:dedup:1", 1, "https://mangadex.org/chapter/dedup-1")
            }
        })

        const url = "https://mangadex.org/chapter/dedup-1"
        const [first, second] = await Promise.all([captureChapter(url), captureChapter(url)])

        expect(resolveCalls).toBe(1)
        // One call does the real capture, the other observes the in-flight dedup guard.
        const outcomes = [first, second]
        expect(outcomes.some(o => "added" in o && o.added === true)).toBe(true)
        expect(outcomes.some(o => "added" in o && o.added === false)).toBe(true)
    })
})

describe("doCaptureChapter scrape-failure fallback", () => {
    it("still tracks the chapter externally and reports supported/added/external", async () => {
        const source = {
            manifest: { id: "mangadex" },
            match: vi.fn().mockReturnValue("chapter"),
            parseMangaUrl: vi.fn().mockReturnValue(null)
        }
        findSourceMock.mockReturnValue(source)
        getSettingsMock.mockResolvedValue({ autoAdd: true })
        resolveChapterUrlMock.mockRejectedValue(new Error("scrape failed"))

        const url = "https://mangadex.org/chapter/fallback-1"
        const result = (await captureChapter(url)) as {
            supported: boolean
            added: boolean
            external?: boolean
            title?: string
        }

        expect(result.supported).toBe(true)
        expect(result.added).toBe(true)
        expect(result.external).toBe(true)

        const tracked = await db.progress.toArray()
        expect(tracked.length).toBeGreaterThan(0)
    })
})

describe("reader:resolve bot-block path", () => {
    it("falls back to fetchChapterHtmlViaTab when resolveChapterUrl throws a bot-block SourceRequestError", async () => {
        const source = { manifest: { id: "mangadex" }, match: vi.fn().mockReturnValue("chapter") }
        findSourceMock.mockReturnValue(source)
        resolveChapterUrlMock.mockRejectedValue(new SourceRequestError("blocked", 403))
        fetchChapterHtmlViaTabMock.mockResolvedValue("<html>fallback</html>")
        resolveChapterFromHtmlMock.mockResolvedValue({
            manga: {
                manga: { ...manga, id: "mangadex:manga:botblock" },
                sourceId: "mangadex",
                sourceMangaId: "botblock",
                url: "https://mangadex.org/title/botblock"
            },
            chapter: chapter("mangadex:chapter:botblock:1", 1, "https://mangadex.org/chapter/botblock-1")
        })

        const result = await readerHandlers["reader:resolve"]!(
            { type: "reader:resolve", url: "https://mangadex.org/chapter/botblock-1" },
            mkCtx()
        )

        expect(fetchChapterHtmlViaTabMock).toHaveBeenCalledWith("https://mangadex.org/chapter/botblock-1")
        expect(resolveChapterFromHtmlMock).toHaveBeenCalled()
        expect(result).toBeDefined()
    })

    it("rethrows a plain non-bot-block error without calling the tab fallback", async () => {
        const source = { manifest: { id: "mangadex" }, match: vi.fn().mockReturnValue("chapter") }
        findSourceMock.mockReturnValue(source)
        resolveChapterUrlMock.mockRejectedValue(new Error("totally unrelated failure"))

        await expect(
            readerHandlers["reader:resolve"]!(
                { type: "reader:resolve", url: "https://mangadex.org/chapter/plain-error-1" },
                mkCtx()
            )
        ).rejects.toThrow("totally unrelated failure")

        expect(fetchChapterHtmlViaTabMock).not.toHaveBeenCalled()
    })
})

describe("reader:chapters (Webtoons-style getChapterListUrl sources)", () => {
    const SOURCE_ID = "webtoons"
    const SOURCE_MANGA_ID = "42"
    const WT_MANGA_ID = `${SOURCE_ID}:manga:${SOURCE_MANGA_ID}`
    const MANGA_URL = "https://www.webtoons.com/en/fantasy/slug/"
    const LIST_URL = `https://www.webtoons.com/en/fantasy/slug/list?title_no=${SOURCE_MANGA_ID}`

    function episodeLink(epNo: number): string {
        return `href="/en/fantasy/slug/ep-${epNo}/viewer?title_no=${SOURCE_MANGA_ID}&episode_no=${epNo}"`
    }

    beforeEach(() => {
        getSourceByIdMock.mockReturnValue({
            manifest: { id: SOURCE_ID },
            getChapterListUrl: () => LIST_URL
        })
    })

    it("on a cache-miss (title's first-ever open), awaits the tab-rendered list refresh instead of racing it", async () => {
        // Nothing cached yet - this is the race from the live-tested bug: the earlier
        // fire-and-forget scheduleChapterListRefresh() call would return an empty list
        // here, before the background tab-fetch had a chance to populate the cache.
        fetchChapterHtmlViaTabMock.mockResolvedValue(`<div>${episodeLink(3)}${episodeLink(2)}${episodeLink(1)}</div>`)

        const result = (await readerHandlers["reader:chapters"]!(
            {
                type: "reader:chapters",
                sourceId: SOURCE_ID,
                sourceMangaId: SOURCE_MANGA_ID,
                mangaUrl: MANGA_URL,
                mangaId: WT_MANGA_ID
            },
            mkCtx()
        )) as Array<{ url: string; sortKey: number; title: string }>

        expect(fetchChapterHtmlViaTabMock).toHaveBeenCalled()
        expect(result.length).toBe(3)
        expect(result.map(c => c.sortKey).sort((a, b) => a - b)).toEqual([1, 2, 3])
    })

    it("returns already-cached chapters immediately without waiting on a refresh", async () => {
        await db.manga.put({ ...manga, id: WT_MANGA_ID, sourceId: SOURCE_ID })
        await db.chapters.bulkPut([
            {
                id: `${SOURCE_ID}:chapter:${SOURCE_MANGA_ID}:1`,
                mangaId: WT_MANGA_ID,
                sourceId: SOURCE_ID,
                title: "Episode 1",
                url: "https://www.webtoons.com/ep-1",
                sortKey: 1
            },
            {
                id: `${SOURCE_ID}:chapter:${SOURCE_MANGA_ID}:2`,
                mangaId: WT_MANGA_ID,
                sourceId: SOURCE_ID,
                title: "Episode 2",
                url: "https://www.webtoons.com/ep-2",
                sortKey: 2
            }
        ])
        // If the handler awaited a refresh here instead of returning cached data
        // immediately, this never-resolving mock would hang the test.
        fetchChapterHtmlViaTabMock.mockImplementation(() => new Promise(() => {}))

        const result = (await readerHandlers["reader:chapters"]!(
            {
                type: "reader:chapters",
                sourceId: SOURCE_ID,
                sourceMangaId: SOURCE_MANGA_ID,
                mangaUrl: MANGA_URL,
                mangaId: WT_MANGA_ID
            },
            mkCtx()
        )) as Array<{ url: string; sortKey: number; title: string }>

        expect(result.map(c => c.sortKey).sort((a, b) => a - b)).toEqual([1, 2])
    })
})
