import { describe, expect, it } from "vitest"
import { cleanQuery, rankCandidates } from "./reconcile-match"

describe("cleanQuery", () => {
    it("strips a trailing (Official) marker", () => {
        expect(cleanQuery("Uncle from Another World (Official)")).toBe("Uncle from Another World")
    })

    it("strips a trailing [Official] marker", () => {
        expect(cleanQuery("Uncle from Another World [Official]")).toBe("Uncle from Another World")
    })

    it("strips a trailing «Official» marker", () => {
        expect(cleanQuery("Uncle from Another World «Official»")).toBe("Uncle from Another World")
    })

    it("does not strip a title containing Unofficial", () => {
        expect(cleanQuery("The Unofficial Guide (Unofficial)")).toBe("The Unofficial Guide (Unofficial)")
    })

    it("does not strip a title containing Officially", () => {
        expect(cleanQuery("Officially the Best (Officially Licensed)")).toBe(
            "Officially the Best (Officially Licensed)"
        )
    })

    it("leaves a title with no marker untouched", () => {
        expect(cleanQuery("One Piece")).toBe("One Piece")
    })
})

describe("rankCandidates", () => {
    const pagesCapable = new Set(["mangadex", "asura"])

    it("orders pages-capable sources before chapters-only sources", () => {
        const ranked = rankCandidates(
            [
                { sourceId: "kagane", latestChapter: "100" },
                { sourceId: "mangadex", latestChapter: "50" }
            ],
            pagesCapable
        )
        expect(ranked.map(c => c.sourceId)).toEqual(["mangadex", "kagane"])
    })

    it("pushes mangahub last among otherwise-equal candidates", () => {
        const ranked = rankCandidates(
            [
                { sourceId: "mangahub", latestChapter: "50" },
                { sourceId: "mangadex", latestChapter: "50" }
            ],
            pagesCapable
        )
        expect(ranked.map(c => c.sourceId)).toEqual(["mangadex", "mangahub"])
    })

    it("orders by chapter count descending when pages-capability and mangahub-ness are tied", () => {
        const ranked = rankCandidates(
            [
                { sourceId: "asura", latestChapter: "10" },
                { sourceId: "mangadex", latestChapter: "99" }
            ],
            pagesCapable
        )
        expect(ranked.map(c => c.sourceId)).toEqual(["mangadex", "asura"])
    })

    it("treats a '?' chapter as 0", () => {
        const ranked = rankCandidates(
            [
                { sourceId: "mangadex", latestChapter: "?" },
                { sourceId: "asura", latestChapter: "5" }
            ],
            pagesCapable
        )
        expect(ranked.map(c => c.sourceId)).toEqual(["asura", "mangadex"])
    })

    it("does not mutate the input array", () => {
        const input = [
            { sourceId: "kagane", latestChapter: "1" },
            { sourceId: "mangadex", latestChapter: "2" }
        ]
        const ranked = rankCandidates(input, pagesCapable)
        expect(input.map(c => c.sourceId)).toEqual(["kagane", "mangadex"])
        expect(ranked).not.toBe(input)
    })
})
