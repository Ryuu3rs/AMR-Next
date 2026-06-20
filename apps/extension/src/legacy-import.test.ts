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
// migrateLegacyImport — general behaviour
// ---------------------------------------------------------------------------
describe("migrateLegacyImport – passthrough for non-legacy input", () => {
    it("returns migrated: false when given new-format envelope", () => {
        const newFmt = { format: "all-mangas-reader", version: 1, exportedAt: 0, data: {} }
        const result = migrateLegacyImport(newFmt)
        expect(result.migrated).toBe(false)
        expect(result.envelope).toBe(newFmt)
    })
})

describe("migrateLegacyImport – skips invalid entries", () => {
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
// migrateLegacyImport — known sources resolve correctly
// ---------------------------------------------------------------------------
describe("migrateLegacyImport – known source URLs resolve to adapter ID", () => {
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

    it("resolves chapmanganato.to URLs to manganato adapter", () => {
        const raw = {
            mangas: [{ n: "My Hero Academia", u: "https://chapmanganato.to/manga-az963656" }]
        }
        const result = migrateLegacyImport(raw)
        const manga = (result.envelope as any).data.manga[0]
        expect(manga.sourceId).toBe("manganato")
        expect(manga.manualTracking).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// migrateLegacyImport — LEGACY DOMAIN ALIAS MAP (the U1 bug fix)
// ---------------------------------------------------------------------------
describe("migrateLegacyImport – legacy domain aliases (U1 bug)", () => {
    it("maps chap.manganato.com (old AMR Manganelo domain) → manganato", () => {
        const raw = {
            mangas: [
                {
                    n: "One Piece",
                    u: "https://chap.manganato.com/manga-aa951409",
                    l: "https://chap.manganato.com/manga-aa951409/chapter-1100"
                }
            ]
        }
        const result = migrateLegacyImport(raw)
        expect(result.needsAttention).toHaveLength(0)
        const manga = (result.envelope as any).data.manga[0]
        expect(manga.sourceId).toBe("manganato")
        expect(manga.manualTracking).toBeUndefined()
    })

    it("maps m.manganato.com → manganato", () => {
        const raw = {
            mangas: [{ n: "Naruto", u: "https://m.manganato.com/manga-ng952689" }]
        }
        const result = migrateLegacyImport(raw)
        expect(result.needsAttention).toHaveLength(0)
        expect((result.envelope as any).data.manga[0].sourceId).toBe("manganato")
    })

    it("maps readmanganato.com → manganato", () => {
        const raw = {
            mangas: [{ n: "Bleach", u: "https://readmanganato.com/manga-bm961108" }]
        }
        const result = migrateLegacyImport(raw)
        expect((result.envelope as any).data.manga[0].sourceId).toBe("manganato")
        expect(result.needsAttention).toHaveLength(0)
    })

    it("maps m.manganelo.com → manganato", () => {
        const raw = {
            mangas: [{ n: "Fairy Tail", u: "https://m.manganelo.com/manga-ng952689" }]
        }
        const result = migrateLegacyImport(raw)
        expect((result.envelope as any).data.manga[0].sourceId).toBe("manganato")
        expect(result.needsAttention).toHaveLength(0)
    })

    it("maps chap.manganelo.com → manganato", () => {
        const raw = {
            mangas: [{ n: "Dragon Ball", u: "https://chap.manganelo.com/manga-cd953939" }]
        }
        const result = migrateLegacyImport(raw)
        expect((result.envelope as any).data.manga[0].sourceId).toBe("manganato")
        expect(result.needsAttention).toHaveLength(0)
    })

    it("maps mangapark.com → mangapark", () => {
        const raw = {
            mangas: [{ n: "Berserk", u: "https://mangapark.com/title/17-en-berserk" }]
        }
        const result = migrateLegacyImport(raw)
        expect(result.needsAttention).toHaveLength(0)
        expect((result.envelope as any).data.manga[0].sourceId).toBe("mangapark")
    })

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

    it("maps manhuaplus.com → manhuaplus", () => {
        const raw = {
            mangas: [{ n: "Spirit Sword Sovereign", u: "https://manhuaplus.com/manga/spirit-sword-sovereign/" }]
        }
        const result = migrateLegacyImport(raw)
        expect(result.needsAttention).toHaveLength(0)
        expect((result.envelope as any).data.manga[0].sourceId).toBe("manhuaplus")
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
// migrateLegacyImport — truly unknown sources still get manualTracking: true
// ---------------------------------------------------------------------------
describe("migrateLegacyImport – truly unknown source falls back to manualTracking", () => {
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
// migrateLegacyImport — output shape
// ---------------------------------------------------------------------------
describe("migrateLegacyImport – output shape", () => {
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
            mangas: [{ n: "Berserk", u: "https://chapmanganato.to/manga-az963656" }]
        }
        const result = migrateLegacyImport(raw)
        expect((result.envelope as any).data.sourceLinks).toHaveLength(1)
    })

    it("synthesises a chapter record when last-chapter URL + chapter number are present", () => {
        const raw = {
            mangas: [
                {
                    n: "My Hero Academia",
                    u: "https://chapmanganato.to/manga-az963656",
                    l: "https://chapmanganato.to/manga-az963656/chapter-428"
                }
            ]
        }
        const result = migrateLegacyImport(raw)
        const chapters = (result.envelope as any).data.chapters
        expect(chapters).toHaveLength(1)
        expect(chapters[0].sortKey).toBe(428)
    })
})
