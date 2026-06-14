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

describe("sync schema (G5)", () => {
    it("accepts sync:config patches and action messages", () => {
        expect(
            runtimeRequestSchema.safeParse({ type: "sync:config", config: { token: "ghp_x", autoSync: true } }).success
        ).toBe(true)
        expect(runtimeRequestSchema.safeParse({ type: "sync:push" }).success).toBe(true)
        expect(runtimeRequestSchema.safeParse({ type: "sync:pull" }).success).toBe(true)
        expect(runtimeRequestSchema.safeParse({ type: "sync:status" }).success).toBe(true)
    })

    it("rejects a non-boolean autoSync", () => {
        expect(runtimeRequestSchema.safeParse({ type: "sync:config", config: { autoSync: "yes" } }).success).toBe(false)
    })
})

describe("manual tracking schema (G2)", () => {
    it("accepts library:manual toggles", () => {
        expect(runtimeRequestSchema.safeParse({ type: "library:manual", mangaId: "m1", manual: true }).success).toBe(
            true
        )
    })

    it("accepts library:numbers with values or null to clear", () => {
        expect(
            runtimeRequestSchema.safeParse({ type: "library:numbers", mangaId: "m1", latestChapterNumber: 161 }).success
        ).toBe(true)
        expect(
            runtimeRequestSchema.safeParse({ type: "library:numbers", mangaId: "m1", lastReadChapterNumber: null })
                .success
        ).toBe(true)
    })

    it("rejects negative chapter numbers", () => {
        expect(
            runtimeRequestSchema.safeParse({ type: "library:numbers", mangaId: "m1", latestChapterNumber: -3 }).success
        ).toBe(false)
    })
})
