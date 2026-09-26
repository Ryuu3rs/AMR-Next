import { describe, expect, it } from "vitest"
import {
    candidateSortByChapter,
    cleanQuery,
    dedupeCandidates,
    filterEligibleCandidates,
    formatReconcileLog,
    matchReadChapterByUrl,
    matchReadChapterId,
    normTitle,
    rankCandidates,
    scoreOverlapFallback,
    selectCloseMatches,
    selectExactMatches,
    wordOverlap,
    type MatchableResult,
    type RankableCandidate,
    type TitleLogEntry
} from "./reconcile-match"

// A search-result-shaped fixture for the title-matching helpers. Only the three
// MatchableResult fields matter; the rest mirror a real SourceSearchResult so the
// helpers are exercised against a realistic object shape.
function res(title: string, sourceId = "src", latestChapter?: string): MatchableResult {
    return { title, sourceId, ...(latestChapter !== undefined ? { latestChapter } : {}) }
}

describe("matchReadChapterByUrl", () => {
    it("matches on exact URL", () => {
        const chapters = [
            { id: "a", url: "https://x.com/chapter/1", sortKey: 1 },
            { id: "b", url: "https://x.com/chapter/2", sortKey: 2 }
        ]
        expect(matchReadChapterByUrl(chapters, "https://x.com/chapter/2")?.id).toBe("b")
    })

    it("matches a Weeb Central ulid across a domain/path change via the id token", () => {
        const chapters = [
            { id: "wc-185", url: "https://weebcentral.com/chapters/01K4BM51JDZBYKK5QGDN7XF7WD", sortKey: 185 }
        ]
        // Stored URL had a trailing slash and www; still matches on the ulid token.
        const found = matchReadChapterByUrl(
            chapters,
            "https://www.weebcentral.com/chapters/01K4BM51JDZBYKK5QGDN7XF7WD/"
        )
        expect(found?.id).toBe("wc-185")
        expect(found?.sortKey).toBe(185)
    })

    it("matches a MangaDex uuid ignoring a query string", () => {
        const chapters = [
            { id: "md", url: "https://mangadex.org/chapter/d6b0f743-0993-43ff-82a3-f85b6bf0b470", sortKey: 85 }
        ]
        expect(
            matchReadChapterByUrl(chapters, "https://mangadex.org/chapter/d6b0f743-0993-43ff-82a3-f85b6bf0b470?lang=en")
                ?.id
        ).toBe("md")
    })

    it("returns undefined for no url or no match", () => {
        const chapters = [{ id: "a", url: "https://x.com/chapter/1", sortKey: 1 }]
        expect(matchReadChapterByUrl(chapters, undefined)).toBeUndefined()
        expect(matchReadChapterByUrl(chapters, "https://x.com/chapter/999")).toBeUndefined()
    })

    it("distinguishes Webtoons chapters by episode_no, not the shared 'viewer' segment", () => {
        // Every Webtoons chapter URL is .../viewer?title_no=..&episode_no=N, so the
        // path segment "viewer" is identical across chapters. Tokenizing on the path
        // used to make every chapter collapse to "viewer" and match the first one.
        const chapters = [
            { id: "ep1", url: "https://www.webtoons.com/en/.../ep-1/viewer?title_no=95&episode_no=1", sortKey: 1 },
            { id: "ep2", url: "https://www.webtoons.com/en/.../ep-2/viewer?title_no=95&episode_no=2", sortKey: 2 }
        ]
        // Stored ep-2 URL (param order differs) must resolve to ep-2, not ep-1.
        expect(
            matchReadChapterByUrl(chapters, "https://www.webtoons.com/en/.../viewer?episode_no=2&title_no=95")?.id
        ).toBe("ep2")
        // An episode not present returns undefined rather than a false first-chapter match.
        expect(
            matchReadChapterByUrl(chapters, "https://www.webtoons.com/en/.../viewer?episode_no=7&title_no=95")
        ).toBeUndefined()
    })
})

describe("matchReadChapterId", () => {
    const chapters = [
        { id: "c1", sortKey: 1 },
        { id: "c101", sortKey: 101 },
        { id: "c102", sortKey: 102 }
    ]

    it("returns the exact chapter for a matching read number", () => {
        expect(matchReadChapterId(chapters, 101)).toBe("c101")
    })

    it("returns the furthest chapter at or below a coarser read number", () => {
        // Read 101.5 but the new mirror only has whole chapters - never over-claim.
        expect(matchReadChapterId(chapters, 101.5)).toBe("c101")
    })

    it("returns undefined when no read number is known", () => {
        expect(matchReadChapterId(chapters, undefined)).toBeUndefined()
        expect(matchReadChapterId(chapters, null)).toBeUndefined()
    })

    it("returns undefined when every chapter is beyond the read position", () => {
        expect(matchReadChapterId([{ id: "c5", sortKey: 5 }], 1)).toBeUndefined()
    })

    it("ignores unnumbered (non-finite sortKey) chapters", () => {
        const withOneshot = [
            { id: "one", sortKey: Number.POSITIVE_INFINITY },
            { id: "c3", sortKey: 3 }
        ]
        expect(matchReadChapterId(withOneshot, 3)).toBe("c3")
    })
})

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

describe("filterEligibleCandidates", () => {
    const exact: RankableCandidate = { sourceId: "kagane", latestChapter: "?" }
    const known: RankableCandidate = { sourceId: "mangadex", latestChapter: "50" }
    const overlapOnly: RankableCandidate = { sourceId: "asura", latestChapter: "?" }

    it("admits an unknown-count exact match when there is no read position", () => {
        const { eligible } = filterEligibleCandidates(
            [exact],
            { lastReadChapterNumber: null, latestChapterNumber: null },
            false,
            new Set([exact])
        )
        expect(eligible).toEqual([exact])
    })

    it("rejects an unknown-count exact match when the title has a nonzero read position", () => {
        const { eligible } = filterEligibleCandidates(
            [exact],
            { lastReadChapterNumber: 12, latestChapterNumber: null },
            false,
            new Set([exact])
        )
        expect(eligible).toEqual([])
    })

    // Deliberate, conservative choice: `0 == null` is false in JS, so a title with
    // recorded progress at chapter/position 0 is treated as "has progress" and an
    // unknown-count candidate is rejected exactly as it would be for any other
    // non-null read position. Not an oversight - `0` is a real, meaningful read
    // position (e.g. a prologue/chapter 0), not "no progress recorded".
    it("rejects an unknown-count exact match when the read position is 0", () => {
        const { eligible } = filterEligibleCandidates(
            [exact],
            { lastReadChapterNumber: 0, latestChapterNumber: null },
            false,
            new Set([exact])
        )
        expect(eligible).toEqual([])
    })

    it("rejects an unknown-count exact match during a library scan even with no read position", () => {
        const { eligible } = filterEligibleCandidates(
            [exact],
            { lastReadChapterNumber: null, latestChapterNumber: null },
            true,
            new Set([exact])
        )
        expect(eligible).toEqual([])
    })

    it("rejects an unknown-count candidate from the overlap-fallback set (not in exactMatchSet)", () => {
        const { eligible } = filterEligibleCandidates(
            [overlapOnly],
            { lastReadChapterNumber: null, latestChapterNumber: null },
            false,
            new Set() // overlapOnly is deliberately not in the exact-match set
        )
        expect(eligible).toEqual([])
    })

    it("keeps a known-count exact match ranked first over an admitted unknown-count exact match", () => {
        const { eligible } = filterEligibleCandidates(
            [exact, known],
            { lastReadChapterNumber: null, latestChapterNumber: null },
            false,
            new Set([exact, known])
        )
        expect(eligible).toEqual([exact, known])
        // Unknown counts already sort last via NaN || 0 in rankCandidates' own
        // comparator - confirm the interaction still holds without changing
        // rankCandidates itself.
        const ranked = rankCandidates(eligible, new Set())
        expect(ranked.map(c => c.sourceId)).toEqual(["mangadex", "kagane"])
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

describe("normTitle", () => {
    it("lowercases and collapses punctuation/separators to single spaces", () => {
        expect(normTitle("  One-Piece: The_Movie!!  ")).toBe("one piece the movie")
    })

    it("returns an empty string for punctuation-only input", () => {
        expect(normTitle("---")).toBe("")
    })
})

describe("wordOverlap", () => {
    it("scores an identical significant-word set as 1", () => {
        expect(wordOverlap("vinland saga", "vinland saga")).toBe(1)
    })

    it("measures overlap against the shorter word set so a long form still matches its short form", () => {
        // "vinland" is the only word > 2 chars not a stop word in the shorter set,
        // and it appears in the longer set - full overlap.
        expect(wordOverlap("vinland", "the vinland saga official edition")).toBe(1)
    })

    it("ignores stop words and words of length <= 2", () => {
        // Only "cat" is significant on each side; "the"/"of"/"a"/"an" and 2-char
        // words drop out, leaving a perfect overlap of the one real word.
        expect(wordOverlap("the cat of an", "a cat")).toBe(1)
    })

    it("returns a partial ratio for a partial overlap", () => {
        // shorter set {alpha, beta}; longer {alpha, gamma, delta} - 1 of 2 shared.
        expect(wordOverlap("alpha beta", "alpha gamma delta")).toBe(0.5)
    })

    it("returns 0 when the shorter significant-word set is empty", () => {
        expect(wordOverlap("of to", "vinland saga")).toBe(0)
    })
})

describe("candidateSortByChapter", () => {
    it("orders higher chapter counts first and treats missing/'?' as 0", () => {
        const sorted = [res("a", "s", "10"), res("b", "s"), res("c", "s", "?"), res("d", "s", "55")].sort(
            candidateSortByChapter
        )
        expect(sorted.map(r => r.title)).toEqual(["d", "a", "b", "c"])
    })
})

describe("dedupeCandidates", () => {
    it("collapses near-duplicate titles within one source, keeping the higher chapter count", () => {
        const out = dedupeCandidates([res("One Piece", "mangadex", "1000"), res("One Piece!", "mangadex", "1050")])
        expect(out).toHaveLength(1)
        expect(out[0]!.latestChapter).toBe("1050")
    })

    it("prefers a real chapter number over a missing one when collapsing a duplicate", () => {
        const out = dedupeCandidates([res("One Piece", "mangadex"), res("One Piece", "mangadex", "1050")])
        expect(out).toHaveLength(1)
        expect(out[0]!.latestChapter).toBe("1050")
    })

    it("never merges the same title across different sources (legitimate mirrors)", () => {
        const out = dedupeCandidates([res("One Piece", "mangadex", "1000"), res("One Piece", "asura", "1000")])
        expect(out.map(r => r.sourceId)).toEqual(["mangadex", "asura"])
    })

    it("keeps genuinely different series from one source", () => {
        const out = dedupeCandidates([res("Naruto", "mangadex", "700"), res("Bleach", "mangadex", "686")])
        expect(out).toHaveLength(2)
    })
})

describe("selectExactMatches", () => {
    it("returns only results whose normalized title equals the wanted title", () => {
        const out = selectExactMatches(
            [res("One Piece", "a"), res("One Piece: Digital Colored", "b"), res("ONE  PIECE!", "c")],
            "one piece"
        )
        expect(out.map(r => r.sourceId)).toEqual(["a", "c"])
    })
})

describe("selectCloseMatches", () => {
    it("keeps exact, substring, and >= 0.6 overlap matches; drops unrelated titles", () => {
        const out = selectCloseMatches(
            [
                res("One Piece", "exact"),
                res("One Piece: Digital Colored Comics", "superstring"),
                res("Naruto", "unrelated")
            ],
            "one piece"
        )
        expect(out.map(r => r.sourceId).sort()).toEqual(["exact", "superstring"])
    })

    it("returns nothing when no result is close enough", () => {
        expect(selectCloseMatches([res("Bleach", "a"), res("Naruto", "b")], "one piece")).toEqual([])
    })
})

describe("scoreOverlapFallback", () => {
    it("drops zero-overlap results and orders by descending overlap score", () => {
        // want has three significant words; "two" shares 2/3, "three" shares 3/3, and
        // "zero" shares none (dropped). Distinct scores exercise the score ordering
        // itself rather than the chapter-count tiebreak.
        const out = scoreOverlapFallback(
            [res("alpha beta delta", "two"), res("zeta eta", "zero"), res("alpha beta gamma", "three")],
            "alpha beta gamma"
        )
        expect(out.map(r => r.sourceId)).toEqual(["three", "two"])
    })

    it("caps the fallback list at 10 results", () => {
        const many = Array.from({ length: 15 }, (_, i) => res(`Solo Leveling ${i}`, `s${i}`, String(i)))
        expect(scoreOverlapFallback(many, "solo leveling")).toHaveLength(10)
    })
})
