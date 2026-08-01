import { describe, it, expect, vi, afterEach } from "vitest"
import { anilistProvider, mapAniListMedia } from "./anilist"

describe("mapAniListMedia", () => {
    it("maps a full media object", () => {
        const result = mapAniListMedia({
            id: 30002,
            title: { romaji: "Berserk", english: "Berserk", native: "ベルセルク" },
            status: "RELEASING",
            format: "MANGA",
            genres: ["Action", "Horror", null],
            tags: [{ name: "Dark Fantasy" }, { name: null }, null],
            coverImage: { extraLarge: "https://img/xl.jpg", large: "https://img/l.jpg" }
        })
        expect(result).toEqual({
            anilistId: 30002,
            title: "Berserk",
            status: "ongoing",
            coverUrl: "https://img/xl.jpg",
            genres: ["Action", "Horror"],
            tags: ["Dark Fantasy"],
            isOneshot: false
        })
    })

    it("maps each AniList status to the publication enum", () => {
        const s = (status: string) => mapAniListMedia({ id: 1, status }).status
        expect(s("RELEASING")).toBe("ongoing")
        expect(s("FINISHED")).toBe("completed")
        expect(s("HIATUS")).toBe("hiatus")
        expect(s("CANCELLED")).toBe("cancelled")
        expect(s("NOT_YET_RELEASED")).toBe("unknown")
    })

    it("flags a ONE_SHOT format", () => {
        expect(mapAniListMedia({ id: 1, format: "ONE_SHOT" }).isOneshot).toBe(true)
    })

    it("falls back romaji -> native for the title and large -> nothing for cover", () => {
        const r = mapAniListMedia({
            id: 1,
            title: { romaji: "Solo Leveling" },
            coverImage: { large: "https://img/l.jpg" }
        })
        expect(r.title).toBe("Solo Leveling")
        expect(r.coverUrl).toBe("https://img/l.jpg")
    })
})

describe("anilistProvider.resolve", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("returns mapped metadata for a search hit", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: { Media: { id: 105398, title: { english: "Chainsaw Man" }, status: "FINISHED" } }
                })
            })
        )
        const result = await anilistProvider.resolve({ title: "Chainsaw Man" })
        expect(result?.anilistId).toBe(105398)
        expect(result?.status).toBe("completed")
    })

    it("returns null on no match", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { Media: null } }) }))
        expect(await anilistProvider.resolve({ title: "nonexistent" })).toBeNull()
    })

    it("returns null on a network error", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
        expect(await anilistProvider.resolve({ title: "x" })).toBeNull()
    })

    it("returns null on a non-ok response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
        expect(await anilistProvider.resolve({ title: "x" })).toBeNull()
    })

    it("returns null for an empty title without calling fetch", async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        expect(await anilistProvider.resolve({ title: "   " })).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
