import { describe, it, expect } from "vitest"
import { decodeHtmlEntities } from "./html"

describe("decodeHtmlEntities", () => {
    it("decodes valid numeric + named entities", () => {
        expect(decodeHtmlEntities("Tom&#39;s &amp; Jerry &#x263A;")).toBe("Tom's & Jerry ☺")
    })

    // Regression: a site-controlled out-of-range / surrogate numeric reference must not
    // throw a RangeError (which crashed the whole chapter-list/search parse) - it's left
    // as literal text.
    it("does not throw on an out-of-range numeric entity", () => {
        expect(() => decodeHtmlEntities("Chapter &#x110000; One")).not.toThrow()
        expect(decodeHtmlEntities("Chapter &#x110000; One")).toBe("Chapter &#x110000; One")
        expect(decodeHtmlEntities("&#1114112;")).toBe("&#1114112;")
    })

    it("does not throw on a lone-surrogate numeric entity", () => {
        expect(() => decodeHtmlEntities("&#xD800;")).not.toThrow()
        expect(decodeHtmlEntities("&#xD800;")).toBe("&#xD800;")
    })
})
