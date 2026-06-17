import { describe, expect, it, vi } from "vitest"
import {
    CHAPTER_ID,
    CHAPTER_URL,
    ORIGIN,
    SERIES_ID,
    SERIES_URL,
    chapterPageHtml,
    imagesHtml,
    searchHtml,
    seriesHtml
} from "./__fixtures__/weebcentral"
import { weebCentralAdapter as adapter } from "./weebcentral"

function makeContext(responses: Record<string, string>) {
    return {
        request: {
            getText: vi.fn(async (url: URL) => {
                const key = url.toString().split("?")[0]
                const html = responses[key]
                if (html === undefined) throw new Error(`No fixture for ${key}`)
                return html
            })
        },
        now: () => 1_000_000,
        logger: { debug: vi.fn(), warn: vi.fn() }
    }
}

describe("weebCentralAdapter.match", () => {
    it("identifies series URLs as manga", () => {
        expect(adapter.match(new URL(SERIES_URL))).toBe("manga")
    })

    it("identifies bare series URL (no slug) as manga", () => {
        expect(adapter.match(new URL(`${ORIGIN}/series/${SERIES_ID}`))).toBe("manga")
    })

    it("identifies chapter URLs as chapter", () => {
        expect(adapter.match(new URL(CHAPTER_URL))).toBe("chapter")
    })

    it("returns none for unrelated URLs", () => {
        expect(adapter.match(new URL("https://mangadex.org/title/abc"))).toBe("none")
        expect(adapter.match(new URL("https://weebcentral.com/search"))).toBe("none")
    })
})

describe("weebCentralAdapter.resolveManga", () => {
    it("parses title and cover from series page", async () => {
        const ctx = makeContext({ [`${ORIGIN}/series/${SERIES_ID}`]: seriesHtml })
        const result = await adapter.resolveManga({ url: new URL(SERIES_URL) }, ctx as never)
        expect(result.manga.title).toBe("Solo Leveling")
        expect(result.manga.coverUrl).toContain("cover.jpg")
        expect(result.sourceMangaId).toBe(SERIES_ID)
        expect(result.sourceId).toBe("weebcentral")
    })
})

describe("weebCentralAdapter.listChapters", () => {
    it("extracts and sorts chapters ascending by number", async () => {
        const ctx = makeContext({ [`${ORIGIN}/series/${SERIES_ID}`]: seriesHtml })
        const stubManga = {
            manga: {
                id: `weebcentral:manga:${SERIES_ID}`,
                title: "Solo Leveling",
                normalizedTitle: "solo leveling",
                authors: [] as string[],
                status: "unknown" as const,
                addedAt: 0,
                updatedAt: 0
            },
            sourceId: "weebcentral",
            sourceMangaId: SERIES_ID,
            url: SERIES_URL
        }
        const chapters = await adapter.listChapters({ manga: stubManga }, ctx as never)
        expect(chapters.length).toBe(3)
        expect(chapters[0].sortKey).toBeLessThanOrEqual(chapters[1].sortKey)
        expect(chapters[1].sortKey).toBeLessThanOrEqual(chapters[2].sortKey)
        expect(chapters[0].sourceChapterId).toBe(CHAPTER_ID)
    })
})

describe("weebCentralAdapter.resolveChapter", () => {
    it("returns pages from the images endpoint", async () => {
        const ctx = makeContext({
            [`${ORIGIN}/chapters/${CHAPTER_ID}/`]: chapterPageHtml,
            [`${ORIGIN}/chapters/${CHAPTER_ID}/images`]: imagesHtml,
            [`${ORIGIN}/series/${SERIES_ID}`]: seriesHtml
        })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, ctx as never)
        expect(result.pages.length).toBe(3)
        expect(result.pages[0].url).toContain("001.jpg")
        expect(result.chapter.sourceChapterId).toBe(CHAPTER_ID)
        expect(result.manga.manga.title).toBe("Solo Leveling")
    })

    it("throws when no images found", async () => {
        const ctx = makeContext({
            [`${ORIGIN}/chapters/${CHAPTER_ID}/`]: chapterPageHtml,
            [`${ORIGIN}/chapters/${CHAPTER_ID}/images`]: "<html><body>Loading…</body></html>",
            [`${ORIGIN}/series/${SERIES_ID}`]: seriesHtml
        })
        await expect(adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, ctx as never)).rejects.toThrow("No images")
    })
})

describe("weebCentralAdapter.search", () => {
    it("returns results from the search page", async () => {
        const ctx = makeContext({ [`${ORIGIN}/search`]: searchHtml })
        const results = await adapter.search("solo leveling", ctx as never)
        expect(results.length).toBeGreaterThanOrEqual(1)
        expect(results[0].title).toBe("Solo Leveling")
        expect(results[0].sourceId).toBe("weebcentral")
    })
})
