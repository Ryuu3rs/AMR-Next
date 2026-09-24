import { describe, expect, it } from "vitest"
import { buildUsageBatch, usageAnalyticsEnabled } from "./analytics-usage"

describe("buildUsageBatch", () => {
    it("aggregates allowlisted events by name with a count and the latest ts", () => {
        const out = buildUsageBatch([
            { event: "reader_opened", ts: 100 },
            { event: "reader_opened", ts: 300 },
            { event: "capture_ok", ts: 200 }
        ])
        const reader = out.find(e => e.name === "reader_opened")
        const capture = out.find(e => e.name === "capture_ok")
        expect(reader).toEqual({ name: "reader_opened", ts: 300, count: 2 })
        expect(capture).toEqual({ name: "capture_ok", ts: 200, count: 1 })
    })

    it("drops non-allowlisted event names so nothing new leaks by default", () => {
        // A name outside the allowlist must never be forwarded.
        const out = buildUsageBatch([
            { event: "secret_new_event" as never, ts: 1 },
            { event: "capture_ok", ts: 2 }
        ])
        expect(out.map(e => e.name)).toEqual(["capture_ok"])
    })

    it("forwards only name/ts/count - never sourceId or detail from the row", () => {
        const out = buildUsageBatch([
            { event: "capture_ok", ts: 5, sourceId: "asura", detail: '{"url":"secret"}' } as never
        ])
        expect(out).toEqual([{ name: "capture_ok", ts: 5, count: 1 }])
        expect(Object.keys(out[0]!)).toEqual(["name", "ts", "count"])
    })
})

describe("usageAnalyticsEnabled", () => {
    const on = { usageAnalytics: true, usageAnalyticsChoice: false }

    it("is on by default on Firefox", () => {
        expect(usageAnalyticsEnabled(on, "firefox", false)).toBe(true)
    })

    it("respects the local opt-out", () => {
        expect(usageAnalyticsEnabled({ usageAnalytics: false, usageAnalyticsChoice: true }, "firefox", false)).toBe(
            false
        )
    })

    it("respects the linked account opt-out on every surface", () => {
        expect(usageAnalyticsEnabled(on, "firefox", true)).toBe(false)
    })

    it("stays off on Chrome until an affirmative first-run choice is made", () => {
        expect(usageAnalyticsEnabled(on, "chrome", false)).toBe(false)
        expect(usageAnalyticsEnabled({ usageAnalytics: true, usageAnalyticsChoice: true }, "chrome", false)).toBe(true)
    })
})
