import { describe, expect, it } from "vitest"
import { normalizeTitle } from "./index"

describe("normalizeTitle", () => {
    it("lowercases, collapses whitespace, and trims", () => {
        expect(normalizeTitle("  One   Piece  ")).toBe("one piece")
        expect(normalizeTitle("NARUTO")).toBe("naruto")
    })

    it("strips a zero-width space so an injected U+200B can't evade dedup", () => {
        const withZeroWidth = `naruto${String.fromCharCode(0x200b)}`
        expect(normalizeTitle(withZeroWidth)).toBe("naruto")
        expect(normalizeTitle(withZeroWidth)).toBe(normalizeTitle("naruto"))
    })

    it("normalizes NFD to NFC so decomposed and composed accents agree", () => {
        const nfd = "Café" // e + combining acute
        const nfc = "Café" // precomposed é
        expect(nfd.normalize("NFC")).toBe(nfc)
        expect(normalizeTitle(nfd)).toBe(normalizeTitle(nfc))
        expect(normalizeTitle(nfd)).toBe("café")
    })

    it("strips a bidi-override wrapper so it normalizes equal to the clean title", () => {
        // U+202E (RLO) ... U+202C (PDF) wrapping the title - both are \p{Cf}. Built
        // from code points so the source file carries no invisible control chars.
        const rlo = String.fromCharCode(0x202e)
        const pdf = String.fromCharCode(0x202c)
        const bidi = `${rlo}Naruto${pdf}`
        expect(normalizeTitle(bidi)).toBe("naruto")
        expect(normalizeTitle(bidi)).toBe(normalizeTitle("Naruto"))
    })

    it("is a pure function that leaves already-clean titles unchanged", () => {
        expect(normalizeTitle("one piece")).toBe("one piece")
    })
})
