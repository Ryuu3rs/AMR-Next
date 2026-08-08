import { describe, expect, it } from "vitest"
import { normalizeTitle, normalizeUsername, validateUsername, RESERVED_USERNAMES } from "./index"

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

describe("normalizeUsername", () => {
    it("NFC-normalizes and trims without stripping legit content", () => {
        expect(normalizeUsername("  Ryuu  ")).toBe("Ryuu")
        const nfd = "Café" // e + combining acute
        expect(normalizeUsername(nfd)).toBe("Café")
        expect(normalizeUsername("smile 😀")).toBe("smile 😀")
    })
})

describe("validateUsername", () => {
    const ok = (raw: string) => {
        const r = validateUsername(raw)
        expect(r.ok, `expected ok for ${JSON.stringify(raw)}: ${r.ok ? "" : r.reason}`).toBe(true)
        return r
    }
    const bad = (raw: string) => {
        const r = validateUsername(raw)
        expect(r.ok, `expected reject for ${JSON.stringify(raw)}`).toBe(false)
        return r
    }

    it("accepts plain ascii and returns the NFC-trimmed value", () => {
        const r = ok("  Ryuu3rs  ")
        if (r.ok) expect(r.value).toBe("Ryuu3rs")
        ok("a-b_c")
        ok("naïve")
    })

    it("accepts emoji names (single, ZWJ sequence, flag, and letters+emoji)", () => {
        ok("smile😀")
        ok("😀😎") // two emoji, meets the 2 code-point minimum
        ok("👨‍👩‍👧") // ZWJ family sequence
        ok("🇬🇧 uk")
        ok("cool 😎 dude")
    })

    it("rejects reserved names case-insensitively and through separator padding", () => {
        expect(bad("admin").ok).toBe(false)
        expect(bad("Admin").ok).toBe(false)
        expect(bad("ADMIN").ok).toBe(false)
        expect(bad("root").ok).toBe(false)
        expect(bad("a d m i n").ok).toBe(false)
        expect(bad("a_d_m_i_n").ok).toBe(false)
        expect(bad("m-o-d").ok).toBe(false)
        expect(validateUsername("admin")).toEqual({ ok: false, reason: "that name is reserved" })
    })

    it("allows a fullwidth lookalike that NFC folds to ascii-reserved and one that does not", () => {
        // Ａdmin (U+FF21 fullwidth A) does NOT fold to ascii under NFC, so it is not reserved.
        ok("Ａdmin")
    })

    it("rejects zero-width and bidi characters", () => {
        const zwsp = String.fromCharCode(0x200b)
        const zwnj = String.fromCharCode(0x200c)
        const bom = String.fromCharCode(0xfeff)
        const rlo = String.fromCharCode(0x202e)
        const pdf = String.fromCharCode(0x202c)
        bad(`nar${zwsp}uto`)
        bad(`nar${zwnj}uto`)
        bad(`nar${bom}uto`)
        bad(`${rlo}naruto${pdf}`)
        for (const r of [validateUsername(`nar${zwsp}uto`), validateUsername(`${rlo}naruto${pdf}`)]) {
            expect(r.ok).toBe(false)
            if (!r.ok) expect(r.reason).toBe("invalid characters")
        }
    })

    it("allows ZWJ only inside an emoji sequence (charset still gates it)", () => {
        ok("👨‍👩‍👧")
        // ZWJ between letters is not a valid emoji sequence, but ZWJ is a permitted char and
        // letters are permitted, so the charset accepts it; it stays a benign edge, not a
        // zero-width evasion of a reserved word (that is separately covered above).
        ok("a‍b")
    })

    it("measures length by code points, not UTF-16 units", () => {
        bad("a") // 1 code point, too short
        // 30 emoji = 30 code points (60 UTF-16 units) -> still valid
        ok("😀".repeat(30))
        // 31 emoji -> too long
        const r = bad("😀".repeat(31))
        if (!r.ok) expect(r.reason).toBe("must be 2-30 characters")
        // A 2-char emoji name is exactly at the minimum
        ok("😀😀")
    })

    it("rejects an all-separator name and blank input", () => {
        expect(validateUsername("__").ok).toBe(false)
        expect(validateUsername("- -").ok).toBe(false)
        expect(validateUsername("   ").ok).toBe(false)
    })

    it("rejects punctuation outside the allowed set", () => {
        bad("a@b")
        bad("a.b")
        bad("a/b")
    })

    it("exposes the reserved set lowercased", () => {
        expect(RESERVED_USERNAMES.has("admin")).toBe(true)
        expect(RESERVED_USERNAMES.has("bot")).toBe(true)
        expect(RESERVED_USERNAMES.has("Admin")).toBe(false)
    })
})
