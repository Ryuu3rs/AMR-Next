import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { dynastyScansAdapter } from "./dynasty-scans"

const ORIGIN = "https://dynasty-scans.com"
const SERIES_URL = `${ORIGIN}/series/bloom_into_you`

// Realistic chapter-list markup, live-verified shape from dynasty-scans.com/series/bloom_into_you:
// numbered chapters mixed with non-numeric bonus entries (Extra/Interlude/Special) that appear
// interleaved in reading-order position, not grouped separately. The raw HTML lists chapters in
// ascending order (Chapter 1 first).
const seriesHtmlWithBonusChapters = `<!DOCTYPE html><html><head><title>Dynasty Reader &raquo; Bloom Into You</title></head><body>
<dl class="chapter-list">
  <dt><a class="name" href="/chapters/bloom_into_you_ch01">Chapter 1: I Can't Reach the Stars</a></dt>
  <dt><a class="name" href="/chapters/bloom_into_you_ch02">Chapter 2: Fever</a></dt>
  <dt><a class="name" href="/chapters/bloom_into_you_ch03">Chapter 3: First Love Application</a></dt>
  <dt><a class="name" href="/chapters/bloom_into_you_toranoana">Toranoana Extra</a></dt>
  <dt><a class="name" href="/chapters/bloom_into_you_vol1extras">Volume 1 Extras</a></dt>
  <dt><a class="name" href="/chapters/bloom_into_you_ch04">Chapter 4: Still Within the Atmosphere</a></dt>
  <dt><a class="name" href="/chapters/bloom_into_you_interlude">Interlude: Before Daybreak</a></dt>
  <dt><a class="name" href="/chapters/bloom_into_you_ch05">Chapter 5: The Girl Who Loves Me</a></dt>
</dl>
</body></html>`

function createContext(fixtures: Readonly<Record<string, string>>): SourceContext {
    const fetch: FetchFunction = async url => {
        const body = fixtures[new URL(url).pathname]
        return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? "" }
    }
    return {
        request: createBoundedRequestClient({
            fetch,
            allowedOrigins: [ORIGIN],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("dynastyScansAdapter listChapters - non-numeric bonus chapter sorting", () => {
    it("never sorts a non-numeric bonus chapter before Chapter 1", async () => {
        const context = createContext({ "/series/bloom_into_you": seriesHtmlWithBonusChapters })
        const manga = {
            manga: {
                id: "dynasty-scans:manga:bloom_into_you",
                title: "Bloom Into You",
                normalizedTitle: "bloom into you",
                authors: [],
                status: "unknown" as const,
                addedAt: 0,
                updatedAt: 0
            },
            sourceId: "dynasty-scans",
            sourceMangaId: "bloom_into_you",
            url: SERIES_URL
        }
        const chapters = await dynastyScansAdapter.listChapters({ manga }, context)

        // The old bug: every unparseable title collapsed to sortKey 0, so all three bonus
        // chapters would land at index 0/1/2, before "Chapter 1: I Can't Reach the Stars".
        expect(chapters[0]?.title).toBe("Chapter 1: I Can't Reach the Stars")

        // Bonus chapters must sort strictly after Chapter 1's sortKey - none of them collapsed
        // to the old fixed fallback of 0.
        const chapter1SortKey = chapters.find(c => c.title === "Chapter 1: I Can't Reach the Stars")?.sortKey
        expect(chapter1SortKey).toBe(1)
        for (const title of ["Toranoana Extra", "Volume 1 Extras", "Interlude: Before Daybreak"]) {
            const bonus = chapters.find(c => c.title === title)
            expect(bonus).toBeDefined()
            expect(bonus!.sortKey).toBeGreaterThan(chapter1SortKey!)
        }

        // Reading-order position is preserved: since the raw HTML lists chapters oldest-first,
        // sorting ascending by sortKey should reproduce the exact document order (bonus chapters
        // interpolated between the real chapters they sit next to, not moved to the front or back).
        expect(chapters.map(c => c.title)).toEqual([
            "Chapter 1: I Can't Reach the Stars",
            "Chapter 2: Fever",
            "Chapter 3: First Love Application",
            "Toranoana Extra",
            "Volume 1 Extras",
            "Chapter 4: Still Within the Atmosphere",
            "Interlude: Before Daybreak",
            "Chapter 5: The Girl Who Loves Me"
        ])

        // "Toranoana Extra" and "Volume 1 Extras" sit between Chapter 3 and Chapter 4.
        const chapter3 = chapters.find(c => c.title === "Chapter 3: First Love Application")!
        const chapter4 = chapters.find(c => c.title === "Chapter 4: Still Within the Atmosphere")!
        const toranoana = chapters.find(c => c.title === "Toranoana Extra")!
        expect(toranoana.sortKey).toBeGreaterThan(chapter3.sortKey)
        expect(toranoana.sortKey).toBeLessThan(chapter4.sortKey)

        // "Interlude: Before Daybreak" sits between Chapter 4 and Chapter 5.
        const chapter5 = chapters.find(c => c.title === "Chapter 5: The Girl Who Loves Me")!
        const interlude = chapters.find(c => c.title === "Interlude: Before Daybreak")!
        expect(interlude.sortKey).toBeGreaterThan(chapter4.sortKey)
        expect(interlude.sortKey).toBeLessThan(chapter5.sortKey)
    })
})
