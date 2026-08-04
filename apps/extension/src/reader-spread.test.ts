import { describe, it, expect } from "vitest"
import { spreadView } from "./reader-spread"

describe("spreadView", () => {
    it("single page mode steps one page at a time", () => {
        expect(spreadView(3, 1, false, 10)).toEqual({ indices: [3], nextStart: 4, prevStart: 2 })
    })

    it("single mode clamps at both ends", () => {
        expect(spreadView(0, 1, false, 10)).toEqual({ indices: [0], nextStart: 1, prevStart: 0 })
        expect(spreadView(9, 1, false, 10)).toEqual({ indices: [9], nextStart: 9, prevStart: 8 })
    })

    describe("2-up, offset off", () => {
        it("pairs from page 0 and steps by two", () => {
            expect(spreadView(0, 2, false, 10)).toEqual({ indices: [0, 1], nextStart: 2, prevStart: 0 })
            expect(spreadView(2, 2, false, 10)).toEqual({ indices: [2, 3], nextStart: 4, prevStart: 0 })
        })

        it("aligns a resumed odd page back onto the even pairing", () => {
            expect(spreadView(3, 2, false, 10)).toEqual({ indices: [2, 3], nextStart: 4, prevStart: 0 })
        })

        it("shows the final page alone for an odd page count and does not advance past it", () => {
            const view = spreadView(6, 2, false, 7)
            expect(view.indices).toEqual([6])
            expect(view.nextStart).toBe(6)
            expect(view.prevStart).toBe(4)
        })

        it("does not re-show the last page for an even page count", () => {
            const view = spreadView(8, 2, false, 10)
            expect(view.indices).toEqual([8, 9])
            expect(view.nextStart).toBe(8)
            expect(view.prevStart).toBe(6)
        })
    })

    describe("2-up, offset on", () => {
        it("shows the cover alone, then next opens the first pair", () => {
            expect(spreadView(0, 2, true, 10)).toEqual({ indices: [0], nextStart: 1, prevStart: 0 })
        })

        it("pairs the rest as (1,2),(3,4) and steps back to the lone cover", () => {
            expect(spreadView(1, 2, true, 10)).toEqual({ indices: [1, 2], nextStart: 3, prevStart: 0 })
            expect(spreadView(3, 2, true, 10)).toEqual({ indices: [3, 4], nextStart: 5, prevStart: 1 })
        })

        it("aligns a resumed even page onto the offset pairing", () => {
            expect(spreadView(4, 2, true, 10)).toEqual({ indices: [3, 4], nextStart: 5, prevStart: 1 })
        })

        it("shows the final page alone for an even page count and does not advance past it", () => {
            const view = spreadView(9, 2, true, 10)
            expect(view.indices).toEqual([9])
            expect(view.nextStart).toBe(9)
            expect(view.prevStart).toBe(7)
        })

        it("keeps the last pair intact for an odd page count", () => {
            const view = spreadView(5, 2, true, 7)
            expect(view.indices).toEqual([5, 6])
            expect(view.nextStart).toBe(5)
            expect(view.prevStart).toBe(3)
        })
    })

    it("handles a single-page chapter without pairing", () => {
        expect(spreadView(0, 2, false, 1)).toEqual({ indices: [0], nextStart: 0, prevStart: 0 })
        expect(spreadView(0, 2, true, 1)).toEqual({ indices: [0], nextStart: 0, prevStart: 0 })
    })

    it("clamps an out-of-range current page", () => {
        expect(spreadView(99, 2, false, 10).indices).toEqual([8, 9])
    })
})
