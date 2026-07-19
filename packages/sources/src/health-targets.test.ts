import { describe, expect, it } from "vitest"
import targets from "../health-targets.json"
import { sourceAdapters } from "./index"

// health-targets.json lives OUTSIDE src/ so it never bundles into the extension
// (index.ts does not import it; only this test and the source-health tool read it).
// This guard asserts every currently-active adapter has a probe target, so a new
// adapter cannot ship without one for the source-health tool.
const table = targets as Record<string, { seriesUrl?: string; expectTitle?: string; note?: string }>

describe("health-targets.json", () => {
    it("has an entry for every active source adapter", () => {
        const missing = sourceAdapters.map(a => a.manifest.id).filter(id => table[id] === undefined)
        expect(missing, `missing health-targets.json entries for: ${missing.join(", ")}`).toEqual([])
    })

    it("gives every entry a non-empty seriesUrl", () => {
        for (const [id, entry] of Object.entries(table)) {
            expect(typeof entry.seriesUrl, `${id} seriesUrl`).toBe("string")
            expect((entry.seriesUrl ?? "").length, `${id} seriesUrl`).toBeGreaterThan(0)
        }
    })

    it("has no orphaned entries for adapters that no longer exist", () => {
        const activeIds = new Set(sourceAdapters.map(a => a.manifest.id))
        const orphaned = Object.keys(table).filter(id => !activeIds.has(id))
        expect(orphaned, `orphaned health-targets.json entries: ${orphaned.join(", ")}`).toEqual([])
    })
})
