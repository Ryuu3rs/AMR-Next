import { describe, expect, it } from "vitest"
import { isLegacyExport, migrateLegacyImport } from "./legacy-import"

// ---------------------------------------------------------------------------
// isLegacyExport
// ---------------------------------------------------------------------------
describe("isLegacyExport", () => {
    it("detects a well-formed legacy export", () => {
        expect(isLegacyExport({ mangas: [] })).toBe(true)
        expect(isLegacyExport({ mangas: [{ n: "X", u: "https://example.com/" }] })).toBe(true)
    })

    it("rejects new-format envelopes (have format field)", () => {
        expect(isLegacyExport({ format: "all-mangas-reader", version: 1, mangas: [] })).toBe(false)
    })

    it("rejects non-objects", () => {
        expect(isLegacyExport(null)).toBe(false)
        expect(isLegacyExport("string")).toBe(false)
        expect(isLegacyExport(42)).toBe(false)
    })

    it("rejects objects without mangas array", () => {
        expect(isLegacyExport({ bookmarks: [] })).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// migrateLegacyImport - general behaviour
// ---------------------------------------------------------------------------
describe("migrateLegacyImport - passthrough for non-legacy input", () => {
    it("returns migrated: false when given new-format envelope", () => {
        const newFmt = { format: "all-mangas-reader", version: 1, exportedAt: 0, data: {} }
        const result = migrateLegacyImport(newFmt)
        expect(result.migrated).toBe(false)
        expect(result.envelope).toBe(newFmt)
    })
})

describe("migrateLegacyImport - skips invalid entries", () => {
    it("skips entries with no title", () => {
        const raw = { mangas: [{ u: "https://mangadex.org/title/abc" }] }
        const result = migrateLegacyImport(raw)
        expect(result.migrated).toBe(true)
        expect(result.converted).toBe(0)
        expect(result.skipped).toBe(1)
    })

    it("skips entries with no URL at all", () => {
        const raw = { mangas: [{ n: "Some Manga" }] }
        const result = migrateLegacyImport(raw)
        expect(result.skipped).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// migrateLegacyImport - known sources resolve correctly
// ---------------------------------------------------------------------------
describe("migrateLegacyImport - known source URLs resolve to adapter ID", () => {
    it("resolves MangaDex URLs to mangadex adapter", () => {
        const raw = {
            mangas: [
                {
                    n: "Test Manga",
                    u: "https://mangadex.org/title/afa40bc8-34fa-4b03-a1e1-50f4eb79f9da"
                }
            ]
        }
        const result = migrateLegacyImport(raw)
        expect(result.converted).toBe(1)
        const manga = (result.envelope as any).data.manga[0]
        expect(manga.sourceId).toBe("mangadex")
        expect(manga.manualTracking).toBeUndefined()
        expect(result.needsAttention).toHaveLength(0)
    })

    it("extracts MangaDex UUID as sourceMangaId", () => {
        const uuid = "afa40bc8-34fa-4b03-a1e1-50f4eb79f9da"
        const raw = {
            mangas: [{ n: "Test", u: `https://mangadex.org/title/${uuid}` }]
        }
        const result = migrateLegacyImport(raw)
        const manga = (result.envelope as any).data.manga[0]
        expect(manga.sourceMangaId).toBe(uuid)
    })

    it("resolves asuratoon.com URLs to asurascans adapter via a legacy alias", () => {
        const raw = {
            mangas: [{ n: "My Hero Academia", u: "https://asuratoon.com/manga/my-hero-academia" }]
        }
        const result = migrateLegacyImport(raw)
        const manga = (result.envelope as any).data.manga[0]
        expect(manga.sourceId).toBe("asurascans")
        expect(manga.manualTracking).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// migrateLegacyImport - LEGACY DOMAIN ALIAS MAP (the U1 bug fix)
// ---------------------------------------------------------------------------
describe("migrateLegacyImport - legacy domain aliases (U1 bug)", () => {
    it("maps asura.gg → asurascans", () => {
        const raw = {
            mangas: [
                {
                    n: "The S-Classes That I Raised",
                    u: "https://asura.gg/manga/the-s-classes-that-i-raised/"
                }
            ]
        }
        const result = migrateLegacyImport(raw)
        expect(result.needsAttention).toHaveLength(0)
        expect((result.envelope as any).data.manga[0].sourceId).toBe("asurascans")
    })

    it("maps www.asurascans.com → asurascans", () => {
        const raw = {
            mangas: [
                {
                    n: "Return of the Disaster-Class Hero",
                    u: "https://www.asurascans.com/manga/8239705535-return-of-the-disaster-class-hero/"
                }
            ]
        }
        const result = migrateLegacyImport(raw)
        expect(result.needsAttention).toHaveLength(0)
        expect((result.envelope as any).data.manga[0].sourceId).toBe("asurascans")
    })

    it("maps mangasushi.net → mangasushi", () => {
        const raw = {
            mangas: [{ n: "Sousou no Frieren", u: "https://mangasushi.net/manga/sousou-no-frieren/" }]
        }
        const result = migrateLegacyImport(raw)
        expect(result.needsAttention).toHaveLength(0)
        expect((result.envelope as any).data.manga[0].sourceId).toBe("mangasushi")
    })
})

// ---------------------------------------------------------------------------
// migrateLegacyImport - aliases removed for retired adapters (Bug 3 fix)
// ---------------------------------------------------------------------------
// These domains used to alias to manganato/mangapark/manhuaplus/mangabuddy/flamecomics/
// aquascans/s2manga/manhwahentai, but every one of those adapter ids is retired from the
// current registry. Keeping the alias produced a real-looking sourceId with no dot, which
// App.svelte's reconcile-needed check (`m.sourceId.includes(".")`) never caught - a silently
// stuck import with no reconcile UI ever offered. Removing the alias lets these domains fall
// through to the hostname-based unknown-source path instead, which IS reconcile-flagged.
describe("migrateLegacyImport - retired adapter aliases fall through to manualTracking (Bug 3 fix)", () => {
    it.each([
        ["chapmanganato.to (manganato)", "https://chapmanganato.to/manga-az963656"],
        ["chap.manganato.com (manganato)", "https://chap.manganato.com/manga-aa951409"],
        ["mangapark.com (mangapark)", "https://mangapark.com/title/17-en-berserk"],
        ["manhuaplus.com (manhuaplus)", "https://manhuaplus.com/manga/spirit-sword-sovereign/"],
        ["mangabuddy.com (mangabuddy)", "https://mangabuddy.com/manga/some-title"],
        ["flamecomics.com (flamecomics)", "https://flamecomics.com/series/some-title"],
        ["aquascans.com (aquascans)", "https://aquascans.com/manga/some-title/"],
        ["s2manga.com (s2manga)", "https://s2manga.com/manga/some-title/"],
        ["manhwahentai.me (manhwahentai)", "https://manhwahentai.me/webtoon/some-title/"]
    ])("%s is no longer aliased and gets manualTracking + a reconcile-flagged hostname sourceId", (_label, url) => {
        const raw = { mangas: [{ n: "Some Manga", u: url }] }
        const result = migrateLegacyImport(raw)
        const manga = (result.envelope as any).data.manga[0]
        expect(manga.manualTracking).toBe(true)
        expect(manga.sourceId).toBe(new URL(url).hostname)
        expect(manga.sourceId.includes(".")).toBe(true)
        expect(result.needsAttention).toContain(manga.id)
    })
})

// ---------------------------------------------------------------------------
// migrateLegacyImport - truly unknown sources still get manualTracking: true
// ---------------------------------------------------------------------------
describe("migrateLegacyImport - truly unknown source falls back to manualTracking", () => {
    it("flags a completely unrecognised domain as needing attention", () => {
        const raw = {
            mangas: [{ n: "Some Manga", u: "https://totally-unknown-old-site.xyz/manga/some-manga/" }]
        }
        const result = migrateLegacyImport(raw)
        expect(result.needsAttention).toHaveLength(1)
        const manga = (result.envelope as any).data.manga[0]
        expect(manga.manualTracking).toBe(true)
        // sourceId should be the hostname, not a clean adapter id
        expect(manga.sourceId).toBe("totally-unknown-old-site.xyz")
    })
})

// ---------------------------------------------------------------------------
// migrateLegacyImport - output shape
// ---------------------------------------------------------------------------
describe("migrateLegacyImport - output shape", () => {
    it("produces a valid v1 envelope with all required tables", () => {
        const raw = {
            mangas: [{ n: "Test", u: "https://mangadex.org/title/afa40bc8-34fa-4b03-a1e1-50f4eb79f9da" }]
        }
        const result = migrateLegacyImport(raw)
        const env = result.envelope as any
        expect(env.format).toBe("all-mangas-reader")
        expect(env.version).toBe(1)
        expect(Array.isArray(env.data.manga)).toBe(true)
        expect(Array.isArray(env.data.sourceLinks)).toBe(true)
        expect(Array.isArray(env.data.chapters)).toBe(true)
        expect(Array.isArray(env.data.historyEvents)).toBe(true)
    })

    it("deduplicates entries with the same computed id", () => {
        const raw = {
            mangas: [
                { n: "Dupe", u: "https://mangadex.org/title/afa40bc8-34fa-4b03-a1e1-50f4eb79f9da" },
                { n: "Dupe", u: "https://mangadex.org/title/afa40bc8-34fa-4b03-a1e1-50f4eb79f9da" }
            ]
        }
        const result = migrateLegacyImport(raw)
        expect(result.converted).toBe(1)
    })

    it("creates a sourceLink for known sources with a manga URL", () => {
        const raw = {
            mangas: [{ n: "Sousou no Frieren", u: "https://mangasushi.net/manga/sousou-no-frieren/" }]
        }
        const result = migrateLegacyImport(raw)
        expect((result.envelope as any).data.sourceLinks).toHaveLength(1)
    })

    it("synthesises a chapter record when last-chapter URL + chapter number are present", () => {
        const raw = {
            mangas: [
                {
                    n: "Sousou no Frieren",
                    u: "https://mangasushi.net/manga/sousou-no-frieren/",
                    l: "https://mangasushi.net/manga/sousou-no-frieren/chapter-428"
                }
            ]
        }
        const result = migrateLegacyImport(raw)
        const chapters = (result.envelope as any).data.chapters
        expect(chapters).toHaveLength(1)
        expect(chapters[0].sortKey).toBe(428)
    })
})
