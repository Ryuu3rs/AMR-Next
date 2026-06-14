import { describe, expect, it } from "vitest"
import { exportEnvelopeSchema } from "./schema"

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
})
