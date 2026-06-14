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
})
