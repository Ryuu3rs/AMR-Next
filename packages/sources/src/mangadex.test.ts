import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import {
    atHomeFixture,
    CHAPTER_ID,
    chapterFeedFixture,
    chapterFixture,
    MANGA_ID,
    mangaFixture
} from "./__fixtures__/mangadex"
import { mangadexAdapter } from "./mangadex"

function createContext(fixtures: Readonly<Record<string, unknown>>, requests: string[]): SourceContext {
    const fetch: FetchFunction = async url => {
        requests.push(url)
        const parsed = new URL(url)
        const fixture = fixtures[parsed.pathname]
        return {
            ok: fixture !== undefined,
            status: fixture === undefined ? 404 : 200,
            text: async () => JSON.stringify(fixture ?? { result: "error" })
        }
    }

    return {
        request: createBoundedRequestClient({
            fetch,
            allowedOrigins: ["https://api.mangadex.org"],
            maxRequests: 10,
            maxResponseBytes: 100_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: {
            debug: () => undefined,
            warn: () => undefined
        }
    }
}

describe("mangadexAdapter.match", () => {
    it("matches manga and chapter URLs without accepting lookalikes", () => {
        expect(mangadexAdapter.match(new URL(`https://mangadex.org/title/${MANGA_ID}/test-manga`))).toBe("manga")
        expect(mangadexAdapter.match(new URL(`https://www.mangadex.org/chapter/${CHAPTER_ID}`))).toBe("chapter")
        expect(mangadexAdapter.match(new URL(`https://fake-mangadex.org/title/${MANGA_ID}`))).toBe("none")
        expect(mangadexAdapter.match(new URL("https://mangadex.org/title/not-a-uuid"))).toBe("none")
    })
})

describe("mangadexAdapter", () => {
    it("resolves manga metadata with deterministic IDs", async () => {
        const requests: string[] = []
        const context = createContext({ [`/manga/${MANGA_ID}`]: mangaFixture }, requests)

        const result = await mangadexAdapter.resolveManga(
            { url: new URL(`https://mangadex.org/title/${MANGA_ID}/test-manga`) },
            context
        )

        expect(result).toEqual({
            manga: {
                id: `mangadex:manga:${MANGA_ID}`,
                title: "Test Manga",
                normalizedTitle: "test manga",
                coverUrl: `https://uploads.mangadex.org/covers/${MANGA_ID}/cover.jpg.256.jpg`,
                authors: [],
                status: "ongoing",
                addedAt: Date.parse("2024-01-02T03:04:05+00:00"),
                updatedAt: Date.parse("2025-02-03T04:05:06+00:00")
            },
            sourceId: "mangadex",
            sourceMangaId: MANGA_ID,
            url: `https://mangadex.org/title/${MANGA_ID}`
        })
        expect(requests[0]).toContain("includes%5B%5D=cover_art")
    })

    it("lists validated chapters with language filters", async () => {
        const requests: string[] = []
        const context = createContext({ [`/manga/${MANGA_ID}/feed`]: chapterFeedFixture }, requests)
        const manga = {
            manga: {
                id: `mangadex:manga:${MANGA_ID}`,
                title: "Test Manga",
                normalizedTitle: "test manga",
                authors: [],
                status: "unknown" as const,
                addedAt: 0,
                updatedAt: 0
            },
            sourceId: "mangadex",
            sourceMangaId: MANGA_ID,
            url: `https://mangadex.org/title/${MANGA_ID}`
        }

        const chapters = await mangadexAdapter.listChapters({ manga, languages: ["en"] }, context)

        expect(chapters).toHaveLength(2)
        expect(chapters[0]).toMatchObject({
            id: `mangadex:chapter:${CHAPTER_ID}`,
            mangaId: `mangadex:manga:${MANGA_ID}`,
            title: "Chapter 1: Arrival",
            sortKey: 1,
            language: "en"
        })
        expect(chapters[1]?.sortKey).toBe(2.5)
        expect(requests[0]).toContain("translatedLanguage%5B%5D=en")
    })

    it("resolves chapter pages from the at-home manifest", async () => {
        const requests: string[] = []
        const context = createContext(
            {
                [`/chapter/${CHAPTER_ID}`]: chapterFixture,
                [`/manga/${MANGA_ID}`]: mangaFixture,
                [`/at-home/server/${CHAPTER_ID}`]: atHomeFixture
            },
            requests
        )

        const result = await mangadexAdapter.resolveChapter({ sourceChapterId: CHAPTER_ID }, context)

        expect(result.chapter.id).toBe(`mangadex:chapter:${CHAPTER_ID}`)
        expect(result.manga.sourceMangaId).toBe(MANGA_ID)
        expect(result.pages).toEqual([
            {
                id: `mangadex:chapter:${CHAPTER_ID}:page:1`,
                url: "https://uploads.example.test/data/chapter-hash/001.jpg"
            },
            {
                id: `mangadex:chapter:${CHAPTER_ID}:page:2`,
                url: "https://uploads.example.test/data/chapter-hash/002%20image.jpg"
            }
        ])
        expect(requests).toHaveLength(3)
    })

    it("rejects malformed API responses", async () => {
        const context = createContext(
            {
                [`/manga/${MANGA_ID}`]: {
                    ...mangaFixture,
                    data: { ...mangaFixture.data, attributes: { title: {} } }
                }
            },
            []
        )

        await expect(mangadexAdapter.resolveManga({ sourceMangaId: MANGA_ID }, context)).rejects.toMatchObject({
            code: "invalid-response"
        })
    })
})
