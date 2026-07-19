import { describe, expect, it } from "vitest"
import { sanitizeScrapedText } from "./sanitize"

describe("sanitizeScrapedText", () => {
    it("strips plain tags and collapses whitespace", () => {
        expect(sanitizeScrapedText("<span>Chapter</span>   <b>12</b>")).toBe("Chapter 12")
    })

    it("decodes HTML entities", () => {
        expect(sanitizeScrapedText("Fianc&eacute;e &amp; Co")).toBe("Fiancée & Co")
        expect(sanitizeScrapedText("Tom&#39;s Diary")).toBe("Tom's Diary")
    })

    it("strips <style> blocks including their CSS content", () => {
        expect(sanitizeScrapedText("Chapter 5 <style>.st0{fill:#d3d629}</style>")).toBe("Chapter 5")
    })

    it("strips <script> blocks including their JS content", () => {
        expect(sanitizeScrapedText("Title <script>var x = 1; alert(x)</script> here")).toBe("Title here")
    })

    it("strips <time> blocks including their timestamp text", () => {
        expect(sanitizeScrapedText("Chapter 200 <time>2024-09-07T17:04:15Z</time>")).toBe("Chapter 200")
    })

    // The real weebcentral failure input: a chapter-row anchor wrapping an inline
    // SVG <style> block and a trailing <time> element. Plain tag-stripping leaked
    // both the raw CSS rule and the ISO timestamp into the title, e.g.
    // "Chapter 200 .st0 { fill: #d3d629; } 2024-09-07T17:04:15Z".
    it("does not leak inline SVG style or a trailing time timestamp (the weebcentral bug)", () => {
        const anchorInner =
            "Chapter 200 " +
            '<svg xmlns="http://www.w3.org/2000/svg"><style>.st0 { fill: #d3d629; }</style><path d="M0 0"/></svg>' +
            "<time>2024-09-07T17:04:15.717343Z</time>"
        const out = sanitizeScrapedText(anchorInner)
        expect(out).toBe("Chapter 200")
        expect(out).not.toContain("st0")
        expect(out).not.toContain("fill")
        expect(out).not.toContain("2024")
    })

    it("returns an empty string for markup with no text content", () => {
        expect(sanitizeScrapedText("<style>.a{}</style>")).toBe("")
        expect(sanitizeScrapedText("   ")).toBe("")
    })
})
