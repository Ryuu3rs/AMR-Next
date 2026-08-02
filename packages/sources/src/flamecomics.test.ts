import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import {
    BROWSE_PATH,
    browsePageHtml,
    CHAPTER_PATH,
    CHAPTER_TOKEN,
    chapterPageHtml,
    SERIES_ID,
    SERIES_PATH,
    SERIES_TITLE,
    seriesPageHtml
} from "./__fixtures__/flamecomics"
import { flameComicsAdapter } from "./flamecomics"

function createContext(fixtures: Readonly<Record<string, string>>, requests: string[] = []): SourceContext {
    const fetch: FetchFunction = async (url, init) => {
        requests.push(`${init.method} ${url}`)
        const parsed = new URL(url)
        const body = fixtures[parsed.pathname]
        return {
            ok: body !== undefined,
            status: body === undefined ? 404 : 200,
            text: async () => body ?? ""
        }
    }
    return {
        request: createBoundedRequestClient({
            fetch,
            allowedOrigins: ["https://flamecomics.xyz", "https://cdn.flamecomics.xyz"],
            maxRequests: 10,
            maxResponseBytes: 5_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("flameComicsAdapter.match", () => {
    it("classifies series and chapter URLs", () => {
        expect(flameComicsAdapter.match(new URL(`https://flamecomics.xyz/series/${SERIES_ID}`))).toBe("manga")
        expect(flameComicsAdapter.match(new URL(`https://flamecomics.xyz/series/${SERIES_ID}/${CHAPTER_TOKEN}`))).toBe(
            "chapter"
        )
        expect(flameComicsAdapter.match(new URL("https://flamecomics.xyz/browse"))).toBe("none")
        expect(flameComicsAdapter.match(new URL("https://unrelated.example/series/1"))).toBe("none")
    })
})

describe("flameComicsAdapter.listChapters", () => {
    it("parses the full chapter list from __NEXT_DATA__ sorted ascending", async () => {
        const context = createContext({ [SERIES_PATH]: seriesPageHtml })

        const chapters = await flameComicsAdapter.listChapters(
            {
                manga: {
                    manga: {
                        id: `flamecomics:manga:${SERIES_ID}`,
                        title: SERIES_TITLE,
                        normalizedTitle: SERIES_TITLE.toLowerCase(),
                        authors: [],
                        status: "unknown",
                        addedAt: 0,
                        updatedAt: 0
                    },
                    sourceId: "flamecomics",
                    sourceMangaId: SERIES_ID,
                    url: `https://flamecomics.xyz/series/${SERIES_ID}`
                }
            },
            context
        )

        expect(chapters.map(c => c.sortKey)).toEqual([0, 62, 62.5, 63])
        expect(chapters.map(c => c.url)).toEqual([
            `https://flamecomics.xyz/series/${SERIES_ID}/57f72548744332f9`,
            `https://flamecomics.xyz/series/${SERIES_ID}/d06b686b43872c7d`,
            `https://flamecomics.xyz/series/${SERIES_ID}/${CHAPTER_TOKEN}`,
            `https://flamecomics.xyz/series/${SERIES_ID}/a7ff0fb655fc81e2`
        ])
    })

    it("preserves the decimal chapter number and folds its subtitle into the title", async () => {
        const context = createContext({ [SERIES_PATH]: seriesPageHtml })

        const chapters = await flameComicsAdapter.listChapters(
            {
                manga: {
                    manga: {
                        id: `flamecomics:manga:${SERIES_ID}`,
                        title: SERIES_TITLE,
                        normalizedTitle: SERIES_TITLE.toLowerCase(),
                        authors: [],
                        status: "unknown",
                        addedAt: 0,
                        updatedAt: 0
                    },
                    sourceId: "flamecomics",
                    sourceMangaId: SERIES_ID,
                    url: `https://flamecomics.xyz/series/${SERIES_ID}`
                }
            },
            context
        )

        const decimal = chapters.find(c => c.sortKey === 62.5)
        expect(decimal?.title).toBe('Chapter 62.5: "Season 2 Prologue"')
        expect(decimal?.sourceChapterId).toBe(`${SERIES_ID}/${CHAPTER_TOKEN}`)
    })

    it("keeps a genuine Chapter 0 as sortKey 0, never dropping or defaulting it", async () => {
        const context = createContext({ [SERIES_PATH]: seriesPageHtml })

        const chapters = await flameComicsAdapter.listChapters(
            {
                manga: {
                    manga: {
                        id: `flamecomics:manga:${SERIES_ID}`,
                        title: SERIES_TITLE,
                        normalizedTitle: SERIES_TITLE.toLowerCase(),
                        authors: [],
                        status: "unknown",
                        addedAt: 0,
                        updatedAt: 0
                    },
                    sourceId: "flamecomics",
                    sourceMangaId: SERIES_ID,
                    url: `https://flamecomics.xyz/series/${SERIES_ID}`
                }
            },
            context
        )

        const zero = chapters[0]
        expect(zero?.sortKey).toBe(0)
        expect(zero?.title).toBe("Chapter 0")
    })
})

describe("flameComicsAdapter.resolveManga", () => {
    it("reads title, cover, authors and status from the series data", async () => {
        const context = createContext({ [SERIES_PATH]: seriesPageHtml })

        const result = await flameComicsAdapter.resolveManga({ sourceMangaId: SERIES_ID }, context)

        expect(result.sourceMangaId).toBe(SERIES_ID)
        expect(result.manga.title).toBe(SERIES_TITLE)
        expect(result.manga.status).toBe("ongoing")
        expect(result.manga.authors).toEqual(["Cup Ramen", "West"])
        expect(result.manga.coverUrl).toBe(
            `https://cdn.flamecomics.xyz/uploads/images/series/${SERIES_ID}/thumbnail.jpg`
        )
    })
})

describe("flameComicsAdapter.resolveChapter", () => {
    it("builds page image URLs from the images metadata against the cdn host", async () => {
        const context = createContext({ [CHAPTER_PATH]: chapterPageHtml })

        const resolved = await flameComicsAdapter.resolveChapter(
            { url: new URL(`https://flamecomics.xyz${CHAPTER_PATH}`) },
            context
        )

        expect(resolved.chapter.sortKey).toBe(62.5)
        expect(resolved.pages.map(p => p.url)).toEqual([
            `https://cdn.flamecomics.xyz/uploads/images/series/${SERIES_ID}/${CHAPTER_TOKEN}/WWM_62.5_00.jpg?1740520330`,
            `https://cdn.flamecomics.xyz/uploads/images/series/${SERIES_ID}/${CHAPTER_TOKEN}/WWM_62.5_01.jpg?1740520330`,
            `https://cdn.flamecomics.xyz/uploads/images/series/${SERIES_ID}/${CHAPTER_TOKEN}/WWM_62.5_02.jpg?1740520330`
        ])
    })

    it("rejects a chapter URL that is not on the source", async () => {
        const context = createContext({})
        await expect(
            flameComicsAdapter.resolveChapter({ url: new URL("https://example.com/series/1/deadbeef0000") }, context)
        ).rejects.toThrow()
    })
})

describe("flameComicsAdapter.search", () => {
    it("filters the browse catalogue by title and maps cover URLs", async () => {
        const requests: string[] = []
        const context = createContext({ [BROWSE_PATH]: browsePageHtml }, requests)

        const results = await flameComicsAdapter.search!("wild west", context)

        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({
            sourceId: "flamecomics",
            sourceMangaId: SERIES_ID,
            title: SERIES_TITLE,
            url: `https://flamecomics.xyz/series/${SERIES_ID}`,
            coverUrl: `https://cdn.flamecomics.xyz/uploads/images/series/${SERIES_ID}/thumbnail.jpg`
        })
    })

    it("returns an empty array for a blank query without making a request", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)

        const results = await flameComicsAdapter.search!("   ", context)

        expect(results).toHaveLength(0)
        expect(requests).toHaveLength(0)
    })
})
