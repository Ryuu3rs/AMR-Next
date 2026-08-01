import "fake-indexeddb/auto"
import { describe, it, expect, beforeEach } from "vitest"
import { db, recordLog, getLogs, LOG_MAX } from "./database"

beforeEach(async () => {
    await db.logs.clear()
})

describe("recordLog / getLogs", () => {
    it("returns entries newest-first", async () => {
        await recordLog({ ts: 1, level: "info", scope: "a", message: "first" })
        await recordLog({ ts: 2, level: "warn", scope: "b", message: "second" })
        const logs = await getLogs()
        expect(logs.map(l => l.message)).toEqual(["second", "first"])
    })

    it("count-trims to the newest LOG_MAX entries", async () => {
        for (let i = 0; i < LOG_MAX + 3; i++) {
            await recordLog({ ts: i, level: "info", scope: "s", message: `m${i}` })
        }
        expect(await db.logs.count()).toBe(LOG_MAX)
        const logs = await getLogs()
        // Newest kept, oldest three (m0..m2) dropped.
        expect(logs[0]!.message).toBe(`m${LOG_MAX + 2}`)
        expect(logs.some(l => l.message === "m0")).toBe(false)
        expect(logs.some(l => l.message === "m2")).toBe(false)
        expect(logs.some(l => l.message === "m3")).toBe(true)
    })
})
