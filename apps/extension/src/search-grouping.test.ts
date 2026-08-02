import { describe, it, expect } from "vitest"
import { groupSearchResultsIntoWorks, type GroupableResult } from "./search-grouping"

function res(partial: Partial<GroupableResult> & { sourceId: string; title: string }): GroupableResult {
    return {
        sourceMangaId: `${partial.sourceId}:${partial.title}`,
        url: `https://${partial.sourceId}.test/${partial.title}`,
        ...partial
    }
}

describe("groupSearchResultsIntoWorks", () => {
    it("collapses the same title across 3 mirrors into 1 card with 3 members", () => {
        const results = [
            res({ sourceId: "a", title: "One Piece", latestChapter: "1100" }),
            res({ sourceId: "b", title: "One Piece", latestChapter: "1099" }),
            res({ sourceId: "c", title: "One Piece" })
        ]

        const works = groupSearchResultsIntoWorks(results)

        expect(works).toHaveLength(1)
        expect(works[0]?.members).toHaveLength(3)
        expect(works[0]?.members.map(m => m.sourceId)).toEqual(["a", "b", "c"])
    })

    it("keeps distinct titles in separate cards", () => {
        const results = [
            res({ sourceId: "a", title: "Naruto" }),
            res({ sourceId: "a", title: "Bleach" }),
            res({ sourceId: "b", title: "Naruto" })
        ]

        const works = groupSearchResultsIntoWorks(results)

        expect(works).toHaveLength(2)
        expect(works.map(w => w.title).sort()).toEqual(["Bleach", "Naruto"])
    })

    it("groups by anilistId even when the titles differ", () => {
        const results = [
            res({ sourceId: "a", title: "Attack on Titan", anilistId: 53390 }),
            res({ sourceId: "b", title: "Shingeki no Kyojin", anilistId: 53390 }),
            res({ sourceId: "c", title: "Attack on Titan" })
        ]

        const works = groupSearchResultsIntoWorks(results)

        const byId = works.find(w => w.anilistId === 53390)
        expect(byId?.members).toHaveLength(2)
        // The id-less "Attack on Titan" stays a separate card - string key never merges
        // into an anilistId key.
        expect(works).toHaveLength(2)
    })

    it("collapses titles differing only in punctuation or case", () => {
        const results = [
            res({ sourceId: "a", title: "Re:Zero" }),
            res({ sourceId: "b", title: "Re Zero" }),
            res({ sourceId: "c", title: "RE ZERO" })
        ]

        const works = groupSearchResultsIntoWorks(results)

        expect(works).toHaveLength(1)
        expect(works[0]?.members).toHaveLength(3)
    })

    it("does not merge on substring overlap (conservative, unlike dedupeMirrors)", () => {
        const results = [res({ sourceId: "a", title: "Naruto" }), res({ sourceId: "b", title: "Naruto Gaiden" })]

        expect(groupSearchResultsIntoWorks(results)).toHaveLength(2)
    })

    it("uses metadata for the canonical title/cover when available, else the best member", () => {
        const results = [
            res({ sourceId: "a", title: "One Piece", anilistId: 30013, latestChapter: "1000", coverUrl: "a.jpg" }),
            res({ sourceId: "b", title: "One Piece", anilistId: 30013, latestChapter: "1100", coverUrl: "b.jpg" })
        ]
        const metadataByAnilistId = new Map([[30013, { title: "ONE PIECE", coverUrl: "canonical.jpg" }]])

        const withMeta = groupSearchResultsIntoWorks(results, { metadataByAnilistId })
        expect(withMeta[0]?.title).toBe("ONE PIECE")
        expect(withMeta[0]?.coverUrl).toBe("canonical.jpg")

        const withoutMeta = groupSearchResultsIntoWorks(results)
        expect(withoutMeta[0]?.coverUrl).toBe("b.jpg")
    })
})

describe("groupSearchResultsIntoWorks - bughunt regressions", () => {
    it("does not crash on a result missing a title", () => {
        const results = [
            { sourceId: "a", sourceMangaId: "1", url: "u" } as unknown as GroupableResult,
            res({ sourceId: "b", title: "One Piece" })
        ]
        expect(() => groupSearchResultsIntoWorks(results)).not.toThrow()
        expect(groupSearchResultsIntoWorks(results)).toHaveLength(2)
    })

    it("keeps punctuation/symbol-only titles as distinct works", () => {
        const works = groupSearchResultsIntoWorks([
            res({ sourceId: "a", title: "!!!" }),
            res({ sourceId: "b", title: "???" })
        ])
        expect(works).toHaveLength(2)
    })

    it("groups the same accented title regardless of unicode normalization form", () => {
        const works = groupSearchResultsIntoWorks([
            res({ sourceId: "a", title: "Café" }),
            res({ sourceId: "b", title: "Café" })
        ])
        expect(works).toHaveLength(1)
    })
})
