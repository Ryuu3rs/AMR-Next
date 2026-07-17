import { describe, expect, it } from "vitest"
import { cleanQuery, formatReconcileLog, rankCandidates, type TitleLogEntry } from "./reconcile-match"

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

describe("formatReconcileLog", () => {
    function baseEntry(overrides: Partial<TitleLogEntry> = {}): TitleLogEntry {
        return {
            mangaId: "m1",
            title: "One Piece",
            deadSource: "mangahub.io",
            lastReadChapterNumber: 100,
            latestChapterNumber: 105,
            cleanedQuery: "One Piece",
            officialMarkerStripped: false,
            rawTitleFallbackUsed: false,
            searchErrors: [],
            rawResultCount: 3,
            closeMatchCount: 1,
            displayedResultCount: 1,
            autoLink: null,
            finalOutcome: "no-results",
            finalMessage: "No live source found for this title.",
            ...overrides
        }
    }

    it("keeps section structure intact when a title has an embedded newline", () => {
        const entry = baseEntry({ title: "Uncle from\nAnother World", finalOutcome: "no-results" })
        const out = formatReconcileLog([entry], null, "1.0.0")
        // The section-heading markers must appear exactly once each - a raw
        // newline in the title can't fool the format into producing extras.
        expect(out.match(/=== Failures \/ exhausted/g)).toHaveLength(1)
        expect(out.match(/=== Manual candidates pending/g)).toHaveLength(1)
        expect(out.match(/=== Successes/g)).toHaveLength(1)
        expect(out).toContain("Uncle from Another World")
        expect(out).not.toContain("Uncle from\nAnother World")
    })

    it("renders a raw error message containing an em dash without corrupting delimiters", () => {
        // Unicode escapes (never a literal dash glyph in this source file) so the
        // runtime string contains a real em dash, matching what the codebase's
        // failure() wrapper actually embeds in raw error text - the formatter
        // must pass it through untouched without corrupting its own delimiters.
        const emDash = String.fromCharCode(0x2014)
        const rawError = `Request failed with status 403 ${emDash} kagane.to timeout`
        const entry = baseEntry({
            finalOutcome: "search-failed",
            searchErrors: [rawError]
        })
        const out = formatReconcileLog([entry], null, "1.0.0")
        expect(out).toContain(rawError)
        // The formatter's own generated structure never uses an em/en dash - only
        // interpolated content (the search error line, stripped here) is allowed to.
        const withoutInterpolatedErrors = out.replace(/search errors:.*$/gm, "")
        // Built from code points, not literal dash glyphs, for the same reason
        // emDash above is - avoids this source file containing an em/en dash.
        const enOrEmDash = new RegExp(`[\\u${"2013"}\\u${"2014"}]`)
        expect(withoutInterpolatedErrors).not.toMatch(enOrEmDash)
    })

    it("groups titles into failures-first, then manual-candidates, then successes-last", () => {
        const failed = baseEntry({ mangaId: "f1", title: "Failed Title", finalOutcome: "search-failed" })
        const exhausted = baseEntry({ mangaId: "f2", title: "Exhausted Title", finalOutcome: "auto-link-exhausted" })
        const manual = baseEntry({ mangaId: "m2", title: "Manual Title", finalOutcome: "manual-candidates" })
        const autoLinked = baseEntry({ mangaId: "s1", title: "Auto Linked Title", finalOutcome: "auto-linked" })
        const manuallyLinked = baseEntry({
            mangaId: "s2",
            title: "Manually Linked Title",
            finalOutcome: "manually-linked"
        })

        const out = formatReconcileLog([manuallyLinked, autoLinked, manual, exhausted, failed], null, "1.0.0")

        const failedIdx = out.indexOf("Failed Title")
        const exhaustedIdx = out.indexOf("Exhausted Title")
        const manualIdx = out.indexOf("Manual Title")
        const autoLinkedIdx = out.indexOf("Auto Linked Title")
        const manuallyLinkedIdx = out.indexOf("Manually Linked Title")

        expect(failedIdx).toBeGreaterThan(-1)
        expect(exhaustedIdx).toBeGreaterThan(-1)
        expect(manualIdx).toBeGreaterThan(-1)
        expect(autoLinkedIdx).toBeGreaterThan(-1)
        expect(manuallyLinkedIdx).toBeGreaterThan(-1)

        expect(failedIdx).toBeLessThan(manualIdx)
        expect(exhaustedIdx).toBeLessThan(manualIdx)
        expect(manualIdx).toBeLessThan(autoLinkedIdx)
        expect(manualIdx).toBeLessThan(manuallyLinkedIdx)
    })

    it("renders a valid block for a title with no autoLink, without crashing", () => {
        const entry = baseEntry({ autoLink: null, finalOutcome: "no-results" })
        expect(() => formatReconcileLog([entry], null, "1.0.0")).not.toThrow()
        const out = formatReconcileLog([entry], null, "1.0.0")
        expect(out).toContain("One Piece")
        expect(out).not.toContain("ranked order")
    })

    it("renders sensibly with an in-progress sweep (finishedAt: null)", () => {
        const entry = baseEntry({ finalOutcome: "manual-candidates" })
        const out = formatReconcileLog(
            [entry],
            {
                startedAt: Date.now(),
                finishedAt: null,
                stopped: false,
                autoLinkEnabled: true,
                isLibraryScan: false,
                total: 10
            },
            "1.0.0"
        )
        expect(out).toContain("finished: in progress")
        expect(() => formatReconcileLog([entry], null, "1.0.0")).not.toThrow()
    })

    it("includes an autoLink block with ranked/benched source ids and attempts when present", () => {
        const entry = baseEntry({
            finalOutcome: "auto-link-exhausted",
            autoLink: {
                exactMatchCount: 2,
                overlapFallbackUsed: false,
                eligibleCount: 2,
                filteredCount: 2,
                rankedSourceIds: ["mangadex", "asura"],
                benchedSourceIds: ["kagane"],
                attempts: [
                    {
                        sourceId: "mangadex",
                        resultTitle: "One Piece",
                        latestChapter: "105",
                        outcome: "failed",
                        failureReason: "Request failed with status 403",
                        trigger: "auto"
                    }
                ]
            }
        })
        const out = formatReconcileLog([entry], null, "1.0.0")
        expect(out).toContain("ranked order (actually attempted): mangadex, asura")
        expect(out).toContain("benched (dropped by repeat-failure threshold): kagane")
        expect(out).toContain("[auto] mangadex")
    })
})
