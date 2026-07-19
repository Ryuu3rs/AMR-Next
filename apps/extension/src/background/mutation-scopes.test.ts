import { describe, expect, it } from "vitest"
import { runtimeRequestSchema } from "../runtime"
import { MUTATION_SCOPES, READ_ONLY_TYPES } from "./mutation-scopes"

// Mirrors dispatch.test.ts's exhaustiveness pattern: every RuntimeRequest type
// must be classified as either mutating (MUTATION_SCOPES, with at least one
// LiveScope) or read-only (READ_ONLY_TYPES) - no gaps, no type claimed by both.
describe("mutation-scopes exhaustiveness", () => {
    const allRequestTypes = runtimeRequestSchema.options.map(option => option.shape.type.value)

    it("classifies every RuntimeRequest type as mutating or read-only", () => {
        const missing = allRequestTypes.filter(
            type => !(type in MUTATION_SCOPES) && !READ_ONLY_TYPES.has(type as never)
        )
        expect(missing).toEqual([])
    })

    it("has no type claimed by both MUTATION_SCOPES and READ_ONLY_TYPES", () => {
        const duplicates = Object.keys(MUTATION_SCOPES).filter(type => READ_ONLY_TYPES.has(type as never))
        expect(duplicates).toEqual([])
    })

    it("has no MUTATION_SCOPES entry for a type that isn't in RuntimeRequest", () => {
        const extra = Object.keys(MUTATION_SCOPES).filter(type => !allRequestTypes.includes(type as never))
        expect(extra).toEqual([])
    })

    it("has no READ_ONLY_TYPES entry for a type that isn't in RuntimeRequest", () => {
        const extra = [...READ_ONLY_TYPES].filter(type => !allRequestTypes.includes(type as never))
        expect(extra).toEqual([])
    })

    it("every MUTATION_SCOPES entry lists at least one scope", () => {
        for (const [type, scopes] of Object.entries(MUTATION_SCOPES)) {
            expect(scopes && scopes.length > 0, `${type} should list at least one LiveScope`).toBe(true)
        }
    })

    it("matches the total count of MUTATION_SCOPES + READ_ONLY_TYPES with no overlap", () => {
        expect(Object.keys(MUTATION_SCOPES).length + READ_ONLY_TYPES.size).toBe(allRequestTypes.length)
    })

    it("classifies reader:resolve as mutating with the chapters + library scopes", () => {
        // reader:resolve persists the resolved chapter and backfills the library
        // entry's coverUrl (saveReaderResolvedChapter) - it must publish, and the
        // "library" scope is what covers the coverUrl backfill a chapters-only
        // publish would miss. It must not be classified read-only.
        expect(MUTATION_SCOPES["reader:resolve"]).toEqual(["chapters", "library"])
        expect(READ_ONLY_TYPES.has("reader:resolve")).toBe(false)
    })

    it("does not add a 'settings' scope or an entry for settings:update", () => {
        // Settings live under a single storage.local "settings" key already -
        // pages watch storage.onChanged for that key directly instead of going
        // through the live bus (see live.ts's module comment).
        expect(MUTATION_SCOPES["settings:update"]).toBeUndefined()
        expect(READ_ONLY_TYPES.has("settings:update")).toBe(true)
        for (const scopes of Object.values(MUTATION_SCOPES)) {
            expect(scopes as string[]).not.toContain("settings")
        }
    })
})
