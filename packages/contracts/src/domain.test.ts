import { describe, expect, it } from "vitest"

import { importExportEnvelopeSchema, mangaRecordSchema, preferencesSchema, readingProgressSchema } from "./domain"

const manga = {
    id: "manga-1",
    title: "Example Manga",
    normalizedTitle: "example manga",
    authors: [],
    status: "ongoing" as const,
    addedAt: 100,
    updatedAt: 200
}

describe("domain contracts", () => {
    it("parses a manga record and rejects unknown fields", () => {
        expect(mangaRecordSchema.parse(manga)).toEqual(manga)
        expect(() => mangaRecordSchema.parse({ ...manga, unexpected: true })).toThrow()
    })

    it("applies preference defaults", () => {
        expect(preferencesSchema.parse({})).toEqual({
            theme: "system",
            readingDirection: "left-to-right",
            pageFit: "width",
            preloadPages: 2,
            showPageNumber: true,
            autoMarkCompleted: true
        })
    })

    it("rejects progress outside the chapter page range", () => {
        expect(
            readingProgressSchema.safeParse({
                mangaId: "manga-1",
                chapterId: "chapter-1",
                pageIndex: 10,
                pageCount: 10,
                completed: false,
                updatedAt: 200
            }).success
        ).toBe(false)
    })

    it("validates a versioned import/export envelope", () => {
        const result = importExportEnvelopeSchema.parse({
            format: "all-mangas-reader",
            version: 1,
            exportedAt: 300,
            data: {
                manga: [manga],
                sourceLinks: [],
                chapters: [],
                pages: [],
                progress: [],
                preferences: {},
                sourceHealth: []
            }
        })

        expect(result.data.preferences.theme).toBe("system")
        expect(() => importExportEnvelopeSchema.parse({ ...result, version: 2 })).toThrow()
    })
})
