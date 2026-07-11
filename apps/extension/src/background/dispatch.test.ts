import { describe, expect, it } from "vitest"
import { runtimeRequestSchema } from "../runtime"
import { handlers, handlerGroups } from "./dispatch"

describe("dispatch table exhaustiveness", () => {
    const allRequestTypes = runtimeRequestSchema.options.map(option => option.shape.type.value)

    it("has a handler for every RuntimeRequest type", () => {
        const missing = allRequestTypes.filter(type => !(type in handlers))
        expect(missing).toEqual([])
    })

    it("has no handler for a type that isn't in RuntimeRequest", () => {
        const extra = Object.keys(handlers).filter(type => !allRequestTypes.includes(type as never))
        expect(extra).toEqual([])
    })

    it("has no type claimed by more than one handler group", () => {
        const seen = new Map<string, string[]>()
        for (const [groupName, group] of Object.entries(handlerGroups)) {
            for (const type of Object.keys(group)) {
                seen.set(type, [...(seen.get(type) ?? []), groupName])
            }
        }
        const duplicates = [...seen.entries()].filter(([, groups]) => groups.length > 1)
        expect(duplicates).toEqual([])
    })

    it("matches the total count of every group's keys with no overlap", () => {
        const totalKeysAcrossGroups = Object.values(handlerGroups).reduce(
            (sum, group) => sum + Object.keys(group).length,
            0
        )
        expect(totalKeysAcrossGroups).toBe(Object.keys(handlers).length)
        expect(Object.keys(handlers).length).toBe(allRequestTypes.length)
    })
})
