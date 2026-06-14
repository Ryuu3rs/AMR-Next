import { describe, expect, it } from "vitest"
import { runtimeRequestSchema } from "./runtime"

describe("settings:update schema", () => {
    it("accepts the reading-preference fields", () => {
        const msg = {
            type: "settings:update",
            settings: {
                readingDirection: "rtl",
                pageFit: "contain",
                showPageNumber: false,
                preloadPages: 5
            }
        }
        expect(runtimeRequestSchema.safeParse(msg).success).toBe(true)
    })

    it("rejects an out-of-range preload count", () => {
        const msg = { type: "settings:update", settings: { preloadPages: 99 } }
        expect(runtimeRequestSchema.safeParse(msg).success).toBe(false)
    })

    it("rejects an unknown reading direction", () => {
        const msg = { type: "settings:update", settings: { readingDirection: "diagonal" } }
        expect(runtimeRequestSchema.safeParse(msg).success).toBe(false)
    })

    it("rejects an unknown page fit", () => {
        const msg = { type: "settings:update", settings: { pageFit: "stretch" } }
        expect(runtimeRequestSchema.safeParse(msg).success).toBe(false)
    })

    it("accepts openChapterIn and rejects unknown values", () => {
        expect(
            runtimeRequestSchema.safeParse({ type: "settings:update", settings: { openChapterIn: "browser" } }).success
        ).toBe(true)
        expect(
            runtimeRequestSchema.safeParse({ type: "settings:update", settings: { openChapterIn: "telepathy" } })
                .success
        ).toBe(false)
    })
})

describe("library:rate schema", () => {
    it("accepts a 1–5 rating and 0 to clear", () => {
        expect(runtimeRequestSchema.safeParse({ type: "library:rate", mangaId: "m1", rating: 4 }).success).toBe(true)
        expect(runtimeRequestSchema.safeParse({ type: "library:rate", mangaId: "m1", rating: 0 }).success).toBe(true)
    })

    it("rejects out-of-range and non-integer ratings", () => {
        expect(runtimeRequestSchema.safeParse({ type: "library:rate", mangaId: "m1", rating: 6 }).success).toBe(false)
        expect(runtimeRequestSchema.safeParse({ type: "library:rate", mangaId: "m1", rating: 2.5 }).success).toBe(false)
    })
})
