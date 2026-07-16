import { describe, expect, it, vi } from "vitest"
import type { SourceManifest, SourceSearchResult } from "@amr/source-sdk"

const manifest = (id: string): SourceManifest => ({
    id,
    name: id,
    domains: [`${id}.example`],
    languages: ["en"],
    capabilities: ["manga", "chapters"],
    requestRateLimit: { requests: 3, intervalMs: 1000 },
    fixtureVersion: 1
})

function makeAdapter(id: string, results: SourceSearchResult[]) {
    return {
        manifest: manifest(id),
        match: () => "none" as const,
        resolveManga: vi.fn(),
        resolveChapter: vi.fn(),
        listChapters: vi.fn(),
        search: vi.fn().mockResolvedValue(results)
    }
}

const result = (title: string, sourceId = "test-source", altTitles?: string[]): SourceSearchResult => ({
    sourceId,
    sourceMangaId: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    url: `https://example.com/${title}`,
    ...(altTitles ? { altTitles } : {})
})

vi.mock("@amr/sources", async importOriginal => {
    const actual = await importOriginal<typeof import("@amr/sources")>()
    return {
        ...actual,
        sourceRegistry: {
            list: () => listMock(),
            match: vi.fn(),
            get: vi.fn()
        }
    }
})

let listMock: () => ReturnType<typeof makeAdapter>[]

describe("matchesQuery", () => {
    it("requires every whitespace-separated query token to appear in the normalized title", async () => {
        const { matchesQuery } = await import("./sources")
        expect(matchesQuery("The Best Manga Ever", "best")).toBe(true)
        expect(matchesQuery("One Piece", "best")).toBe(false)
        expect(matchesQuery("Attack on Titan", "attack titan")).toBe(true)
        expect(matchesQuery("Attack on Titan", "titan attack")).toBe(true)
        expect(matchesQuery("Attack on Titan", "attack zzz")).toBe(false)
    })

    it("normalizes case and punctuation like entrypoints/app/App.svelte's normTitle", async () => {
        const { matchesQuery } = await import("./sources")
        expect(matchesQuery("Jujutsu Kaisen: Part 2", "jujutsu-kaisen part 2")).toBe(true)
        expect(matchesQuery("Re:Zero", "re zero")).toBe(true)
    })

    it("treats an empty/whitespace query as matching everything", async () => {
        const { matchesQuery } = await import("./sources")
        expect(matchesQuery("Anything", "   ")).toBe(true)
    })
})

describe("searchManga result filtering", () => {
    it("drops results whose title doesn't contain every query token", async () => {
        listMock = () => [
            makeAdapter("fuzzy-source", [result("The Best Manga"), result("One Piece"), result("Best Friends")])
        ]
        const { searchManga } = await import("./sources")

        const results = await searchManga("best")

        expect(results.map(r => r.title).sort()).toEqual(["Best Friends", "The Best Manga"])
    })

    it("filters uniformly across multiple adapters", async () => {
        listMock = () => [
            makeAdapter("source-a", [result("Best Manga", "source-a"), result("Unrelated Title", "source-a")]),
            makeAdapter("source-b", [result("The Best Story", "source-b")])
        ]
        const { searchManga } = await import("./sources")

        const results = await searchManga("best")

        expect(results.map(r => r.title).sort()).toEqual(["Best Manga", "The Best Story"])
    })

    it("passes a result whose main title doesn't match but an altTitle does", async () => {
        listMock = () => [
            makeAdapter("mangadex", [
                result("Attack on Titan", "mangadex", ["Shingeki no Kyojin"]),
                result("One Piece", "mangadex", ["Wan Pisu"])
            ])
        ]
        const { searchManga } = await import("./sources")

        const results = await searchManga("shingeki")

        expect(results.map(r => r.title)).toEqual(["Attack on Titan"])
    })

    it("still filters out results with no title or altTitle match", async () => {
        listMock = () => [makeAdapter("mangadex", [result("One Piece", "mangadex", ["Wan Pisu"])])]
        const { searchManga } = await import("./sources")

        const results = await searchManga("naruto")

        expect(results).toEqual([])
    })

    it("keeps title-only matching behavior unchanged for results without altTitles", async () => {
        listMock = () => [
            makeAdapter("test-source", [result("The Best Manga"), result("One Piece"), result("Best Friends")])
        ]
        const { searchManga } = await import("./sources")

        const results = await searchManga("best")

        expect(results.map(r => r.title).sort()).toEqual(["Best Friends", "The Best Manga"])
    })
})

describe("createSourceContext response cache reuse", () => {
    it("shares the response cache across two separately-created contexts for the same sourceId", async () => {
        // Mirrors the real-world scenario this fix targets: resolveCover and
        // resolveGenres each call createSourceContext independently (one context
        // per operation, so their requestCount budgets stay separate - see
        // request.ts), but both fetch the identical manga-page URL for the same
        // sourceId seconds apart. The response cache should be shared so the
        // second operation is served from cache instead of hitting the network again.
        const mangaPageUrl = "https://mangadex.org/title/shared-cache-test"
        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            url: mangaPageUrl,
            text: async () => "<html>manga page</html>"
        }))
        vi.stubGlobal("fetch", fetchMock)

        const adapter = {
            manifest: manifest("mangadex"),
            match: () => "none" as const,
            resolveManga: vi.fn(),
            resolveChapter: vi.fn(),
            listChapters: vi.fn(),
            resolveCover: vi.fn(async (_input: unknown, ctx: { request: { getText: (u: URL) => Promise<string> } }) => {
                const body = await ctx.request.getText(new URL(mangaPageUrl))
                return `cover-from:${body}`
            }),
            resolveGenres: vi.fn(
                async (_input: unknown, ctx: { request: { getText: (u: URL) => Promise<string> } }) => {
                    const body = await ctx.request.getText(new URL(mangaPageUrl))
                    return [body]
                }
            )
        }
        const getMock = vi.fn(() => adapter)
        const { sourceRegistry } = await import("@amr/sources")
        vi.mocked(sourceRegistry.get).mockImplementation(getMock as never)

        const { resolveCoverFor, resolveGenresFor } = await import("./sources")

        const cover = await resolveCoverFor({ sourceId: "mangadex", sourceMangaId: "shared-cache-test" })
        const genres = await resolveGenresFor({ sourceId: "mangadex", sourceMangaId: "shared-cache-test" })

        expect(cover).toBe("cover-from:<html>manga page</html>")
        expect(genres).toEqual(["<html>manga page</html>"])
        // Two operations, two independently-constructed contexts/clients - but only
        // one underlying network fetch because the response cache Map is shared per
        // sourceId across createSourceContext calls.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        vi.unstubAllGlobals()
    })
})

describe("searchMangaStreaming result filtering", () => {
    it("only emits onPartial for adapters with matches after filtering", async () => {
        listMock = () => [
            makeAdapter("source-a", [result("Best Manga", "source-a")]),
            makeAdapter("source-b", [result("Unrelated Title", "source-b")])
        ]
        const { searchMangaStreaming } = await import("./sources")

        const partials: Array<{ sourceId: string; titles: string[] }> = []
        await new Promise<void>(resolveDone => {
            searchMangaStreaming(
                "best",
                (results, sourceId) => {
                    partials.push({ sourceId, titles: results.map(r => r.title) })
                },
                () => resolveDone()
            )
        })

        expect(partials).toEqual([{ sourceId: "source-a", titles: ["Best Manga"] }])
    })

    it("emits results matched only via altTitles", async () => {
        listMock = () => [
            makeAdapter("mangadex", [result("Attack on Titan", "mangadex", ["Shingeki no Kyojin"])]),
            makeAdapter("source-b", [result("Unrelated Title", "source-b")])
        ]
        const { searchMangaStreaming } = await import("./sources")

        const partials: Array<{ sourceId: string; titles: string[] }> = []
        await new Promise<void>(resolveDone => {
            searchMangaStreaming(
                "shingeki",
                (results, sourceId) => {
                    partials.push({ sourceId, titles: results.map(r => r.title) })
                },
                () => resolveDone()
            )
        })

        expect(partials).toEqual([{ sourceId: "mangadex", titles: ["Attack on Titan"] }])
    })
})
