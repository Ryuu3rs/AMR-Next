import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { runSettled } from "./bulk"

describe("runSettled", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("returns every item as succeeded when the action never throws", async () => {
        const seen: number[] = []
        const { succeeded, failed } = await runSettled([1, 2, 3], async n => {
            seen.push(n)
        })
        expect(succeeded).toEqual([1, 2, 3])
        expect(failed).toEqual([])
        expect(seen).toEqual([1, 2, 3])
    })

    it("splits succeeded and failed on a mid-batch failure without aborting the rest", async () => {
        const { succeeded, failed } = await runSettled(["a", "b", "c"], async id => {
            if (id === "b") throw new Error("boom")
        })
        expect(succeeded).toEqual(["a", "c"])
        expect(failed).toEqual(["b"])
    })

    it("keeps every item that throws in the failed set", async () => {
        const { succeeded, failed } = await runSettled([1, 2, 3], async () => {
            throw new Error("always")
        })
        expect(succeeded).toEqual([])
        expect(failed).toEqual([1, 2, 3])
    })

    it("logs a warning for each failure", async () => {
        const warn = vi.spyOn(console, "warn")
        await runSettled(["x", "y"], async id => {
            if (id === "y") throw new Error("nope")
        })
        expect(warn).toHaveBeenCalledTimes(1)
    })

    it("runs items sequentially in order", async () => {
        const order: number[] = []
        await runSettled([1, 2, 3], async n => {
            await new Promise(r => setTimeout(r, n === 1 ? 5 : 0))
            order.push(n)
        })
        expect(order).toEqual([1, 2, 3])
    })

    it("handles an empty item list", async () => {
        const fn = vi.fn(async () => {})
        const { succeeded, failed } = await runSettled([], fn)
        expect(succeeded).toEqual([])
        expect(failed).toEqual([])
        expect(fn).not.toHaveBeenCalled()
    })
})
