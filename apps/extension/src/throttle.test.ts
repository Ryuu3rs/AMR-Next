import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createProgressReporter } from "./throttle"

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe("createProgressReporter", () => {
    it("collapses a burst of report() calls within the 1s window into one send with the max pageIndex", () => {
        const send = vi.fn()
        const { report } = createProgressReporter(send)

        report(3, false)
        report(1, false)
        report(7, false)
        report(5, false)
        expect(send).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1000)

        expect(send).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledWith({ pageIndex: 7, completed: false })
    })

    it("sticky-ORs completed across the window instead of using the last call's value", () => {
        const send = vi.fn()
        const { report } = createProgressReporter(send)

        report(2, false)
        report(4, true)
        report(3, false)
        vi.advanceTimersByTime(1000)

        expect(send).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledWith({ pageIndex: 4, completed: true })
    })

    it("flushes immediately when completed is true, without waiting for the timer", () => {
        const send = vi.fn()
        const { report, flush } = createProgressReporter(send)

        report(2, false)
        expect(send).not.toHaveBeenCalled()

        report(9, true)
        flush()

        expect(send).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledWith({ pageIndex: 9, completed: true })
    })

    it("calling flush() with nothing pending is a safe no-op", () => {
        const send = vi.fn()
        const { flush } = createProgressReporter(send)

        flush()

        expect(send).not.toHaveBeenCalled()
    })

    it("resets internal state after a flush so a subsequent report() starts a fresh window", () => {
        const send = vi.fn()
        const { report, flush } = createProgressReporter(send)

        report(8, true)
        flush()
        expect(send).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenLastCalledWith({ pageIndex: 8, completed: true })

        report(1, false)
        vi.advanceTimersByTime(1000)

        expect(send).toHaveBeenCalledTimes(2)
        expect(send).toHaveBeenLastCalledWith({ pageIndex: 1, completed: false })
    })
})
