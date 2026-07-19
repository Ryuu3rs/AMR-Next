import { describe, expect, it } from "vitest"
import { UNNUMBERED_SORT_KEY, assignListSortKeys, parseChapterNumber } from "./chapter-numbering"

describe("UNNUMBERED_SORT_KEY", () => {
    it("is +Infinity so an unnumbered chapter sorts last, never before Chapter 1", () => {
        expect(UNNUMBERED_SORT_KEY).toBe(Number.POSITIVE_INFINITY)
    })
})

describe("parseChapterNumber", () => {
    it("returns undefined (never 0) for unparseable input", () => {
        expect(parseChapterNumber("Extra")).toBeUndefined()
        expect(parseChapterNumber("Oneshot")).toBeUndefined()
        expect(parseChapterNumber("")).toBeUndefined()
        expect(parseChapterNumber(null)).toBeUndefined()
        expect(parseChapterNumber(undefined)).toBeUndefined()
        expect(parseChapterNumber("abc")).toBeUndefined()
    })

    it("returns 0 only for a literal 0 (a genuine Chapter 0)", () => {
        expect(parseChapterNumber("0")).toBe(0)
        expect(parseChapterNumber("0.0")).toBe(0)
    })

    it("parses integers and decimals", () => {
        expect(parseChapterNumber("1")).toBe(1)
        expect(parseChapterNumber("12")).toBe(12)
        expect(parseChapterNumber("1.5")).toBe(1.5)
    })

    it("parses a leading number out of trailing junk (parseFloat semantics)", () => {
        expect(parseChapterNumber("3 extra")).toBe(3)
    })
})

describe("assignListSortKeys", () => {
    const num = (x: number | undefined) => x

    it("maps a parseable oldest-first ascending list to its numbers", () => {
        const items = [1, 2, 3]
        expect(assignListSortKeys(items, num, "oldest-first")).toEqual([1, 2, 3])
    })

    it("maps a parseable newest-first descending list back to its numbers in document order", () => {
        const items = [3, 2, 1]
        expect(assignListSortKeys(items, num, "newest-first")).toEqual([3, 2, 1])
    })

    it("interpolates a single unnumbered entry between its neighbours (oldest-first)", () => {
        // document order: 1, 2, <extra>, 3
        const items: (number | undefined)[] = [1, 2, undefined, 3]
        const keys = assignListSortKeys(items, num, "oldest-first")
        expect(keys[0]).toBe(1)
        expect(keys[1]).toBe(2)
        expect(keys[2]).toBeGreaterThan(2)
        expect(keys[2]).toBeLessThan(3)
        expect(keys[3]).toBe(3)
    })

    it("interpolates in a newest-first document, keeping the entry between its real neighbours", () => {
        // document order (newest first): 3, <extra>, 2, 1
        const items: (number | undefined)[] = [3, undefined, 2, 1]
        const keys = assignListSortKeys(items, num, "newest-first")
        expect(keys[0]).toBe(3)
        expect(keys[3]).toBe(1)
        expect(keys[2]).toBe(2)
        // the extra sits (chronologically) between Chapter 2 and Chapter 3
        expect(keys[1]).toBeGreaterThan(2)
        expect(keys[1]).toBeLessThan(3)
    })

    it("keeps multiple unnumbered entries in a run ordered and distinct", () => {
        // document order (oldest-first): 3, <a>, <b>, 4
        const items: (number | undefined)[] = [3, undefined, undefined, 4]
        const keys = assignListSortKeys(items, num, "oldest-first")
        expect(keys[0]).toBe(3)
        expect(keys[3]).toBe(4)
        expect(keys[1]).toBeCloseTo(3.001)
        expect(keys[2]).toBeCloseTo(3.002)
        expect(keys[1]).toBeLessThan(keys[2]!)
        expect(keys[2]).toBeLessThan(4)
    })

    it("handles an all-unparseable list without any 0 collapse", () => {
        const items: (number | undefined)[] = [undefined, undefined, undefined]
        const keys = assignListSortKeys(items, num, "oldest-first")
        // no real chapter seen yet, so they walk 0.001, 0.002, 0.003 - strictly
        // increasing and never a bare 0.
        expect(keys).toEqual([0.001, 0.002, 0.003])
        expect(keys.every(k => k > 0)).toBe(true)
    })

    it("handles a single numbered item", () => {
        expect(assignListSortKeys([7], num, "oldest-first")).toEqual([7])
    })

    it("handles a single unnumbered item", () => {
        expect(assignListSortKeys([undefined], num, "oldest-first")).toEqual([0.001])
    })

    it("interpolates each of several unnumbered runs at their own real position", () => {
        // oldest-first: 1, 2, 3, <extraA>, <extraB>, 4, <extraC>, 5
        const items: (number | undefined)[] = [1, 2, 3, undefined, undefined, 4, undefined, 5]
        const keys = assignListSortKeys(items, num, "oldest-first")
        expect(keys[3]).toBeGreaterThan(3)
        expect(keys[3]).toBeLessThan(4)
        expect(keys[4]).toBeGreaterThan(keys[3]!)
        expect(keys[4]).toBeLessThan(4)
        expect(keys[6]).toBeGreaterThan(4)
        expect(keys[6]).toBeLessThan(5)
        expect(keys.map(Math.floor)).toEqual([1, 2, 3, 3, 3, 4, 4, 5])
    })
})
