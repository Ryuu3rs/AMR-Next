import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./sources", () => ({
    searchManga: vi.fn(),
    getPagesCapableSourceIds: vi.fn(() => new Set<string>())
}))
vi.mock("./settings", () => ({
    getSettings: vi.fn()
}))
vi.mock("./metadata/anilist", () => ({
    anilistProvider: { resolveSearchTitles: vi.fn() }
}))

import { anilistProvider } from "./metadata/anilist"
import { getSettings } from "./settings"
import { resolveSource } from "./source-resolver"
import { getPagesCapableSourceIds, searchManga, type MangaSearchResult } from "./sources"

const search = vi.mocked(searchManga)
const pagesCapable = vi.mocked(getPagesCapableSourceIds)
const getSettingsMock = vi.mocked(getSettings)
const resolveSearchTitles = vi.mocked(anilistProvider.resolveSearchTitles!)

const makeSettings = (searchDisabledSourceIds: string[]) =>
    ({ searchDisabledSourceIds }) as unknown as Awaited<ReturnType<typeof getSettings>>

function result(title: string, sourceId: string, latestChapter?: string): MangaSearchResult {
    return {
        sourceId,
        sourceMangaId: `${sourceId}:${title}`,
        title,
        url: `https://${sourceId}.example/${encodeURIComponent(title)}`,
        ...(latestChapter !== undefined ? { latestChapter } : {})
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    getSettingsMock.mockResolvedValue(makeSettings([]))
    pagesCapable.mockReturnValue(new Set<string>())
})

describe("resolveSource", () => {
    it("returns high confidence for an exact normalized-title match that clears the eligibility floor", async () => {
        search.mockResolvedValue([
            result("Solo Leveling", "mangadex", "179"),
            result("Solo Leveling: Side Story", "asura", "12")
        ])
        const r = await resolveSource({ title: "Solo Leveling" })
        expect(r.matched).toBe(true)
        expect(r.confidence).toBe("high")
        expect(r.best?.sourceId).toBe("mangadex")
        expect(r.query).toBe("Solo Leveling")
    })

    it("returns low confidence when only an overlap-fallback candidate is found (no close/exact match)", async () => {
        // 0.5 word overlap against "alpha beta": below the 0.6 close-match bar, above 0.
        search.mockResolvedValue([result("alpha gamma delta", "s1", "5")])
        const r = await resolveSource({ title: "alpha beta" })
        expect(r.matched).toBe(true)
        expect(r.confidence).toBe("low")
        expect(r.candidates).toHaveLength(1)
        expect(r.best?.sourceId).toBe("s1")
    })

    it("returns matched:false with confidence none when the search yields nothing", async () => {
        search.mockResolvedValue([])
        const r = await resolveSource({ title: "Nonexistent Title" })
        expect(r).toEqual({ matched: false, candidates: [], confidence: "none" })
    })

    it("returns matched:false when results share no significant word with the title", async () => {
        search.mockResolvedValue([result("Totally Unrelated Series", "s1", "3")])
        const r = await resolveSource({ title: "One Piece" })
        expect(r.matched).toBe(false)
        expect(r.confidence).toBe("none")
    })

    it("tries explicit searchTitles best-first and does not derive from the tracker", async () => {
        search.mockImplementation(async query =>
            query === "Romaji Title" ? [result("Romaji Title", "mangadex", "10")] : []
        )
        const r = await resolveSource({ title: "Local Title", searchTitles: ["English Title", "Romaji Title"] })
        expect(search).toHaveBeenNthCalledWith(1, "English Title", expect.any(Set))
        expect(search).toHaveBeenNthCalledWith(2, "Romaji Title", expect.any(Set))
        expect(resolveSearchTitles).not.toHaveBeenCalled()
        expect(r.confidence).toBe("high")
        expect(r.best?.sourceId).toBe("mangadex")
    })

    it("lazily derives search-title variants from the AniList id when none are supplied", async () => {
        resolveSearchTitles.mockResolvedValue(["Derived Title"])
        search.mockResolvedValue([result("Derived Title", "mangadex", "3")])
        const r = await resolveSource({ title: "Local Fallback", anilistId: 123 })
        expect(resolveSearchTitles).toHaveBeenCalledWith(123)
        expect(search).toHaveBeenCalledWith("Derived Title", expect.any(Set))
        expect(r.confidence).toBe("high")
    })

    it("passes the settings-disabled source ids to searchManga as the exclusion set", async () => {
        getSettingsMock.mockResolvedValue(makeSettings(["kagane", "mangahub"]))
        search.mockResolvedValue([])
        await resolveSource({ title: "X" })
        const excluded = search.mock.calls[0]![1] as ReadonlySet<string>
        expect([...excluded].sort()).toEqual(["kagane", "mangahub"])
    })

    it("skips a variant whose search rejects and continues to the next", async () => {
        search
            .mockRejectedValueOnce(new Error("timeout"))
            .mockResolvedValueOnce([result("Second Try", "mangadex", "40")])
        const r = await resolveSource({ title: "First", searchTitles: ["First", "Second Try"] })
        expect(r.matched).toBe(true)
        expect(r.best?.sourceId).toBe("mangadex")
    })

    it("ranks pages-capable sources ahead of chapters-only ones among close matches", async () => {
        pagesCapable.mockReturnValue(new Set(["mangadex"]))
        search.mockResolvedValue([result("Berserk", "kagane", "374"), result("Berserk", "mangadex", "374")])
        const r = await resolveSource({ title: "Berserk" })
        expect(r.confidence).toBe("high")
        expect(r.candidates.map(c => c.sourceId)).toEqual(["mangadex", "kagane"])
        expect(r.best?.sourceId).toBe("mangadex")
    })
})
