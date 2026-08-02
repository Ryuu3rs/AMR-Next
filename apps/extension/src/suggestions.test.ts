import { describe, it, expect } from "vitest"
import { scoreSuggestions, type CommunityRec } from "./suggestions"
import type { LibraryManga } from "./database"
import type { RecCandidate } from "./metadata/recommendations"

function lib(partial: Partial<LibraryManga> & { title: string }): LibraryManga {
    return {
        id: `id:${partial.title}`,
        normalizedTitle: partial.title.toLocaleLowerCase("en"),
        authors: [],
        status: "unknown",
        addedAt: 0,
        updatedAt: 0,
        sourceId: "src",
        sourceUrl: "https://example.test",
        ...partial
    } as LibraryManga
}

function rec(anilistId: number, title: string, genres?: string[]): RecCandidate {
    return { anilistId, title, ...(genres ? { genres } : {}) }
}

describe("scoreSuggestions", () => {
    it("ranks a candidate recommended by many owned titles above one recommended by few", () => {
        const library = [lib({ title: "Owned One", anilistId: 1 }), lib({ title: "Owned Two", anilistId: 2 })]
        const anilistRecs = new Map<number, RecCandidate[]>([
            [1, [rec(100, "Popular"), rec(200, "Niche")]],
            [2, [rec(100, "Popular")]]
        ])

        const result = scoreSuggestions({ library, anilistRecs })

        expect(result[0]?.anilistId).toBe(100)
        expect(result[0]?.frequency).toBe(2)
        expect(result[0]?.reasons).toEqual(["Owned One", "Owned Two"])
        expect(result[1]?.anilistId).toBe(200)
        expect(result[1]?.frequency).toBe(1)
    })

    it("boosts a candidate whose genres overlap the library profile", () => {
        const library = [lib({ title: "Owned", anilistId: 1, genres: ["Action", "Horror"] })]
        const anilistRecs = new Map<number, RecCandidate[]>([
            [1, [rec(100, "No Overlap"), rec(200, "Genre Match", ["Action", "Horror"])]]
        ])

        const result = scoreSuggestions({ library, anilistRecs })

        expect(result[0]?.anilistId).toBe(200)
        expect(result[0]?.overlapScore).toBeGreaterThan(0)
        expect(result[1]?.anilistId).toBe(100)
        expect(result[1]?.overlapScore).toBe(0)
    })

    it("excludes candidates already in the library by anilistId", () => {
        const library = [lib({ title: "Owned", anilistId: 100 })]
        const anilistRecs = new Map<number, RecCandidate[]>([[999, [rec(100, "Owned Again"), rec(101, "New")]]])

        const result = scoreSuggestions({ library, anilistRecs })

        expect(result.map(s => s.anilistId)).toEqual([101])
    })

    it("excludes candidates already in the library by normalizedTitle", () => {
        const library = [lib({ title: "Chainsaw Man", normalizedTitle: "chainsaw man" })]
        const anilistRecs = new Map<number, RecCandidate[]>([
            [999, [rec(500, "Chainsaw Man"), rec(501, "Spy x Family")]]
        ])

        const result = scoreSuggestions({ library, anilistRecs })

        expect(result.map(s => s.anilistId)).toEqual([501])
    })

    it("returns an empty list for an empty library and no recs", () => {
        expect(scoreSuggestions({ library: [], anilistRecs: new Map() })).toEqual([])
    })

    it("handles owned titles with no anilistId (profile + title exclusion still apply)", () => {
        const library = [
            lib({ title: "No Id Title", genres: ["Action"] }),
            lib({ title: "Also Owned", normalizedTitle: "also owned" })
        ]
        const anilistRecs = new Map<number, RecCandidate[]>([
            [42, [rec(100, "Action Pick", ["Action"]), rec(200, "Also Owned")]]
        ])

        const result = scoreSuggestions({ library, anilistRecs })

        expect(result.map(s => s.anilistId)).toEqual([100])
        expect(result[0]?.overlapScore).toBeGreaterThan(0)
        expect(result[0]?.reasons).toEqual([])
    })

    it("boosts and badges a candidate that is also a community pick", () => {
        const library = [lib({ title: "Owned", anilistId: 1 })]
        const anilistRecs = new Map<number, RecCandidate[]>([[1, [rec(100, "Plain"), rec(200, "Community Fav")]]])
        const communityRecs: CommunityRec[] = [{ title: "Community Fav", sourceId: "src" }]

        const result = scoreSuggestions({ library, anilistRecs, communityRecs })

        expect(result[0]?.anilistId).toBe(200)
        expect(result[0]?.community).toBe(true)
        expect(result[1]?.community).toBe(false)
        expect(result[0]!.score).toBeGreaterThan(result[1]!.score)
    })

    it("breaks score ties deterministically by anilistId", () => {
        const library = [lib({ title: "Owned", anilistId: 1 })]
        const anilistRecs = new Map<number, RecCandidate[]>([[1, [rec(300, "C"), rec(100, "A"), rec(200, "B")]]])

        const result = scoreSuggestions({ library, anilistRecs })

        expect(result.map(s => s.anilistId)).toEqual([100, 200, 300])
    })
})

describe("scoreSuggestions - bughunt regressions", () => {
    it("excludes an owned title stored with a weaker (non-collapsed) normalizedTitle", () => {
        const owned = lib({ title: "Solo  Leveling", normalizedTitle: "solo  leveling", sourceId: "s" })
        const seed = lib({ title: "Attack on Titan", anilistId: 1 })
        const anilistRecs = new Map([[1, [rec(99, "Solo Leveling")]]])
        const out = scoreSuggestions({ library: [seed, owned], anilistRecs })
        expect(out.find(s => s.anilistId === 99)).toBeUndefined()
    })
})
