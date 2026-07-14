import { describe, expect, it } from "vitest"
import { exportEnvelopeSchema, importChapterSchema, pageBookmarkSchema } from "./schema"

function validEnvelope() {
    return {
        format: "all-mangas-reader",
        version: 1,
        exportedAt: 1_700_000_000_000,
        data: {
            manga: [
                {
                    id: "mangadex:manga:abc",
                    title: "Test Manga",
                    normalizedTitle: "test manga",
                    authors: [],
                    status: "ongoing",
                    addedAt: 1,
                    updatedAt: 2,
                    sourceId: "mangadex",
                    sourceUrl: "https://mangadex.org/chapter/abc"
                }
            ],
            sourceLinks: [
                {
                    mangaId: "mangadex:manga:abc",
                    sourceId: "mangadex",
                    url: "https://mangadex.org/title/abc",
                    addedAt: 1,
                    updatedAt: 2
                }
            ],
            chapters: [
                {
                    id: "mangadex:chapter:1",
                    mangaId: "mangadex:manga:abc",
                    sourceId: "mangadex",
                    title: "Chapter 1",
                    url: "https://mangadex.org/chapter/1",
                    sortKey: 1
                }
            ],
            progress: [],
            historyEvents: []
        }
    }
}

describe("exportEnvelopeSchema", () => {
    it("accepts a well-formed envelope", () => {
        expect(exportEnvelopeSchema.safeParse(validEnvelope()).success).toBe(true)
    })

    it("rejects a wrong format marker", () => {
        const bad = { ...validEnvelope(), format: "some-other-tool" }
        expect(exportEnvelopeSchema.safeParse(bad).success).toBe(false)
    })

    it("rejects an unsupported version", () => {
        const bad = { ...validEnvelope(), version: 2 }
        expect(exportEnvelopeSchema.safeParse(bad).success).toBe(false)
    })

    it("rejects a manga record missing required fields", () => {
        const env = validEnvelope()
        // @ts-expect-error intentionally remove a required field
        delete env.data.manga[0].id
        expect(exportEnvelopeSchema.safeParse(env).success).toBe(false)
    })

    it("rejects non-object input", () => {
        expect(exportEnvelopeSchema.safeParse(null).success).toBe(false)
        expect(exportEnvelopeSchema.safeParse("not json").success).toBe(false)
    })

    it("round-trips domain-independent chapter numbers (G1)", () => {
        const env = validEnvelope()
        env.data.manga[0] = {
            ...env.data.manga[0],
            latestChapterNumber: 161,
            lastReadChapterNumber: 79
        } as (typeof env.data.manga)[0]
        const parsed = exportEnvelopeSchema.safeParse(env)
        expect(parsed.success).toBe(true)
        if (parsed.success) {
            expect(parsed.data.data.manga[0]?.lastReadChapterNumber).toBe(79)
            expect(parsed.data.data.manga[0]?.latestChapterNumber).toBe(161)
        }
    })

    it("round-trips onHold/readingDirection/pageFit (were previously missing from the strict schema)", () => {
        const env = validEnvelope()
        env.data.manga[0] = {
            ...env.data.manga[0],
            onHold: true,
            readingDirection: "rtl",
            pageFit: "height"
        } as (typeof env.data.manga)[0]
        const parsed = exportEnvelopeSchema.safeParse(env)
        expect(parsed.success).toBe(true)
        if (parsed.success) {
            expect(parsed.data.data.manga[0]?.onHold).toBe(true)
            expect(parsed.data.data.manga[0]?.readingDirection).toBe("rtl")
            expect(parsed.data.data.manga[0]?.pageFit).toBe("height")
        }
    })

    it("drops unknown extra tables but keeps known ones", () => {
        const env = validEnvelope() as Record<string, unknown> & { data: Record<string, unknown> }
        env.data["futureTable"] = [{ anything: true }]
        const parsed = exportEnvelopeSchema.safeParse(env)
        expect(parsed.success).toBe(true)
        if (parsed.success) {
            expect("futureTable" in parsed.data.data).toBe(false)
            expect(parsed.data.data.manga).toHaveLength(1)
        }
    })

    // Regression for the reported bug: "Import file is invalid at data.chapters.0:
    // Invalid input". Every real chapter-write path stores a SourceChapter
    // (ChapterRecord & { sourceChapterId, language }), never a bare ChapterRecord -
    // the previous schema here (built directly from the .strict() contract schema,
    // which has no sourceChapterId field) rejected virtually every real chapter. The
    // existing tests above only ever used contract-shaped fixtures, which is exactly
    // why this gap went uncaught; this test uses a DB-shaped record instead.
    it("accepts a DB-shaped chapter record with sourceChapterId (regression for the strict chapter-import failure)", () => {
        const env = validEnvelope()
        env.data.chapters[0] = {
            ...env.data.chapters[0],
            sourceChapterId: "abc123",
            language: "en"
        } as (typeof env.data.chapters)[0]
        const parsed = exportEnvelopeSchema.safeParse(env)
        expect(parsed.success).toBe(true)
        if (parsed.success) {
            expect(parsed.data.data.chapters[0]).toMatchObject({
                sourceChapterId: "abc123",
                language: "en"
            })
        }
    })

    it("round-trips pageBookmarks (previously silently dropped from export/import)", () => {
        const env = validEnvelope() as Record<string, unknown> & { data: Record<string, unknown> }
        env.data["pageBookmarks"] = [
            {
                id: "mangadex:chapter:1:0",
                mangaId: "mangadex:manga:abc",
                chapterId: "mangadex:chapter:1",
                pageIndex: 0,
                mangaTitle: "Test Manga",
                chapterTitle: "Chapter 1",
                chapterUrl: "https://mangadex.org/chapter/1",
                addedAt: 1_700_000_000_000
            }
        ]
        const parsed = exportEnvelopeSchema.safeParse(env)
        expect(parsed.success).toBe(true)
        if (parsed.success) {
            expect(parsed.data.data.pageBookmarks).toHaveLength(1)
            expect(parsed.data.data.pageBookmarks[0]?.id).toBe("mangadex:chapter:1:0")
        }
    })

    it("defaults pageBookmarks to [] when the table is absent (legacy export without it)", () => {
        const parsed = exportEnvelopeSchema.safeParse(validEnvelope())
        expect(parsed.success).toBe(true)
        if (parsed.success) {
            expect(parsed.data.data.pageBookmarks).toEqual([])
        }
    })
})

describe("importChapterSchema", () => {
    it("accepts sourceChapterId and language as optional extras beyond the bare contract schema", () => {
        const result = importChapterSchema.safeParse({
            id: "mangadex:chapter:1",
            mangaId: "mangadex:manga:abc",
            sourceId: "mangadex",
            title: "Chapter 1",
            url: "https://mangadex.org/chapter/1",
            sortKey: 1,
            sourceChapterId: "abc123",
            language: "en"
        })
        expect(result.success).toBe(true)
    })

    it("still rejects a chapter missing a required field", () => {
        const result = importChapterSchema.safeParse({
            mangaId: "mangadex:manga:abc",
            sourceId: "mangadex",
            title: "Chapter 1",
            url: "https://mangadex.org/chapter/1",
            sortKey: 1
        })
        expect(result.success).toBe(false)
    })
})

describe("pageBookmarkSchema", () => {
    it("accepts a well-formed bookmark", () => {
        const result = pageBookmarkSchema.safeParse({
            id: "mangadex:chapter:1:0",
            mangaId: "mangadex:manga:abc",
            chapterId: "mangadex:chapter:1",
            pageIndex: 0,
            mangaTitle: "Test Manga",
            chapterTitle: "Chapter 1",
            chapterUrl: "https://mangadex.org/chapter/1",
            addedAt: 1
        })
        expect(result.success).toBe(true)
    })

    it("rejects a bookmark missing required fields", () => {
        const result = pageBookmarkSchema.safeParse({ id: "x" })
        expect(result.success).toBe(false)
    })
})
