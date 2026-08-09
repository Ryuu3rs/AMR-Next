import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
    getAniListConfig,
    setAniListConfig,
    getAniListStatus,
    getViewerProgress,
    saveViewerProgress,
    getViewerName,
    getViewerMangaList,
    mapMediaListEntry
} from "./anilist"

function stubStorage() {
    const store = new Map<string, unknown>()
    // @ts-expect-error test-only shim
    globalThis.browser = {
        storage: {
            local: {
                get: vi.fn(async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {})),
                set: vi.fn(async (items: Record<string, unknown>) => {
                    for (const [k, v] of Object.entries(items)) store.set(k, v)
                })
            }
        }
    }
    return store
}

beforeEach(() => stubStorage())
afterEach(() => vi.unstubAllGlobals())

describe("AniList config store", () => {
    it("defaults to autoSync off and no token", async () => {
        expect(await getAniListConfig()).toEqual({ autoSync: false, syncMembership: false })
    })

    it("merges patches and round-trips", async () => {
        await setAniListConfig({ token: "abc", autoSync: true })
        const c = await getAniListConfig()
        expect(c.token).toBe("abc")
        expect(c.autoSync).toBe(true)
    })

    it("never exposes the token in the status view", async () => {
        await setAniListConfig({ token: "secret", autoSync: true, lastSyncAt: 123 })
        const status = await getAniListStatus()
        expect(status).toEqual({ hasToken: true, autoSync: true, syncMembership: false, lastSyncAt: 123 })
        expect(JSON.stringify(status)).not.toContain("secret")
    })
})

describe("AniList authed API", () => {
    it("reads viewer progress, undefined when no list entry", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { Media: { mediaListEntry: null } } }) })
        )
        expect(await getViewerProgress("t", 1)).toBeUndefined()

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ data: { Media: { mediaListEntry: { progress: 42 } } } })
            })
        )
        expect(await getViewerProgress("t", 1)).toBe(42)
    })

    it("saves progress and returns the stored value", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue({ ok: true, json: async () => ({ data: { SaveMediaListEntry: { progress: 50 } } }) })
        )
        expect(await saveViewerProgress("t", 1, 50)).toBe(50)
    })

    it("throws on a GraphQL error (e.g. invalid token)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ errors: [{ message: "Invalid token" }] }) })
        )
        await expect(getViewerName("bad")).rejects.toThrow(/Invalid token/)
    })

    it("throws on a non-ok response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))
        await expect(getViewerName("bad")).rejects.toThrow(/401/)
    })
})

describe("mapMediaListEntry", () => {
    it("maps media status to our publication-status enum", () => {
        const cases: Array<[string, string]> = [
            ["RELEASING", "ongoing"],
            ["FINISHED", "completed"],
            ["HIATUS", "hiatus"],
            ["CANCELLED", "cancelled"],
            ["NOT_YET_RELEASED", "unknown"]
        ]
        for (const [raw, expected] of cases) {
            expect(mapMediaListEntry({ media: { id: 1, status: raw } }).status).toBe(expected)
        }
    })

    it("prefers romaji, falls back to english then native", () => {
        expect(mapMediaListEntry({ media: { id: 1, title: { english: "E", romaji: "R", native: "N" } } }).title).toBe(
            "R"
        )
        expect(mapMediaListEntry({ media: { id: 1, title: { english: "E", native: "N" } } }).title).toBe("E")
        expect(mapMediaListEntry({ media: { id: 1, title: { native: "N" } } }).title).toBe("N")
    })

    it("prefers extraLarge cover, falls back to large, else undefined", () => {
        expect(mapMediaListEntry({ media: { id: 1, coverImage: { extraLarge: "xl", large: "l" } } }).coverUrl).toBe(
            "xl"
        )
        expect(mapMediaListEntry({ media: { id: 1, coverImage: { large: "l" } } }).coverUrl).toBe("l")
        expect(mapMediaListEntry({ media: { id: 1 } }).coverUrl).toBeUndefined()
    })

    it("maps the entry list status to our reading-status override (paused/dropped/planning only)", () => {
        expect(mapMediaListEntry({ status: "PAUSED", media: { id: 1 } }).listStatus).toBe("paused")
        expect(mapMediaListEntry({ status: "DROPPED", media: { id: 1 } }).listStatus).toBe("dropped")
        expect(mapMediaListEntry({ status: "PLANNING", media: { id: 1 } }).listStatus).toBe("planning")
        // Derived states carry no override.
        expect(mapMediaListEntry({ status: "CURRENT", media: { id: 1 } }).listStatus).toBeUndefined()
        expect(mapMediaListEntry({ status: "COMPLETED", media: { id: 1 } }).listStatus).toBeUndefined()
        expect(mapMediaListEntry({ status: "REPEATING", media: { id: 1 } }).listStatus).toBeUndefined()
        expect(mapMediaListEntry({ media: { id: 1 } }).listStatus).toBeUndefined()
    })

    it("preserves the raw list status and a positive chapter total", () => {
        const mapped = mapMediaListEntry({ status: "COMPLETED", media: { id: 1, chapters: 120 } })
        expect(mapped.rawListStatus).toBe("COMPLETED")
        expect(mapped.totalChapters).toBe(120)
        // null / zero / missing totals do not produce a total.
        expect(mapMediaListEntry({ media: { id: 1, chapters: null } }).totalChapters).toBeUndefined()
        expect(mapMediaListEntry({ media: { id: 1, chapters: 0 } }).totalChapters).toBeUndefined()
        expect(mapMediaListEntry({ media: { id: 1 } }).totalChapters).toBeUndefined()
        expect(mapMediaListEntry({ media: { id: 1 } }).rawListStatus).toBeUndefined()
    })

    it("carries anilistId, genres, and progress; defaults a missing progress to 0", () => {
        const mapped = mapMediaListEntry({
            progress: 12,
            media: { id: 99, genres: ["Action", null, ""], title: { romaji: "R" } }
        })
        expect(mapped.anilistId).toBe(99)
        expect(mapped.genres).toEqual(["Action"])
        expect(mapped.progress).toBe(12)
        expect(mapMediaListEntry({ media: { id: 1 } }).progress).toBe(0)
    })
})

describe("getViewerMangaList", () => {
    it("resolves the viewer id then flattens every list's entries", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { Viewer: { id: 7 } } }) })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        MediaListCollection: {
                            lists: [
                                {
                                    entries: [
                                        { progress: 3, media: { id: 1, title: { romaji: "A" }, status: "RELEASING" } }
                                    ]
                                },
                                {
                                    entries: [
                                        { progress: 0, media: { id: 2, title: { english: "B" }, status: "FINISHED" } }
                                    ]
                                },
                                null
                            ]
                        }
                    }
                })
            })
        vi.stubGlobal("fetch", fetchMock)

        const list = await getViewerMangaList("t")

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(list).toHaveLength(2)
        expect(list[0]).toMatchObject({ anilistId: 1, title: "A", status: "ongoing", progress: 3 })
        expect(list[1]).toMatchObject({ anilistId: 2, title: "B", status: "completed", progress: 0 })
    })

    it("rejects and never fires the collection query when the viewer id is null", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { Viewer: { id: null } } }) })
        vi.stubGlobal("fetch", fetchMock)

        await expect(getViewerMangaList("t")).rejects.toThrow(/viewer id/)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
