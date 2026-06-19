import { describe, expect, it } from "vitest"

import { mangaRecordSchema, readingProgressSchema } from "./domain"

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
})
