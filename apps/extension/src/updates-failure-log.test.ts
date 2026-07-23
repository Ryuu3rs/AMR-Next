import { describe, it, expect } from "vitest"
import { formatUpdateFailureLog } from "./updates-failure-log"

const meta = { version: "0.13.0", checkedAt: Date.parse("2026-07-23T00:00:00Z"), checked: 10, updated: 7, failed: 2 }

describe("formatUpdateFailureLog", () => {
    it("renders a header and one line per failed title", () => {
        const log = formatUpdateFailureLog(
            [
                { mangaId: "mangadex:manga:a", title: "Title A", message: "Request failed with status 500" },
                { mangaId: "kagane:manga:b", title: "Title B", message: "blocked" }
            ],
            meta
        )
        expect(log).toContain("AMR update-failure log")
        expect(log).toContain("checked at: 2026-07-23T00:00:00.000Z")
        expect(log).toContain("extension version: 0.13.0")
        expect(log).toContain("checked: 10 | updated: 7 | failed: 2")
        expect(log).toContain("- Title A [mangadex:manga:a]: Request failed with status 500")
        expect(log).toContain("- Title B [kagane:manga:b]: blocked")
        expect(log.split("\n").filter(l => l.startsWith("- "))).toHaveLength(2)
    })

    it("flattens embedded newlines so a title or message can't forge a new log line", () => {
        const log = formatUpdateFailureLog(
            [{ mangaId: "s:manga:x", title: "Evil\n- Fake Title [forged]", message: "line1\nline2\n\nline3" }],
            meta
        )
        expect(log.split("\n").filter(l => l.startsWith("- "))).toHaveLength(1)
        expect(log).toContain("- Evil - Fake Title [forged] [s:manga:x]: line1 line2 line3")
    })

    it("never throws on an invalid checkedAt", () => {
        const log = formatUpdateFailureLog([], { ...meta, checkedAt: Number.NaN })
        expect(log).toContain("checked at: unknown")
        expect(log).toContain("(no per-title errors recorded)")
    })

    it("substitutes placeholders for empty title/message/id", () => {
        const log = formatUpdateFailureLog([{ mangaId: "", title: "  ", message: "" }], meta)
        expect(log).toContain("- (untitled): (no message)")
        expect(log).not.toContain("[]")
    })

    it("strips control, bidi, and zero-width characters (anti terminal-forge)", () => {
        const esc = String.fromCharCode(0x1b) // ESC - terminal escape
        const rlo = String.fromCharCode(0x202e) // right-to-left override
        const zwsp = String.fromCharCode(0x200b) // zero-width space
        const log = formatUpdateFailureLog([{ mangaId: "s:x", title: `A${esc}[2A${rlo}B${zwsp}`, message: "m" }], meta)
        for (const code of [0x1b, 0x202e, 0x200b]) {
            expect(log).not.toContain(String.fromCharCode(code))
        }
        expect(log).toContain("- A[2AB [s:x]: m")
    })

    it("tolerates a null entry or a non-array without throwing", () => {
        expect(() => formatUpdateFailureLog([null as never], meta)).not.toThrow()
        const log = formatUpdateFailureLog([null as never, { mangaId: "s:y", title: "Kept", message: "m" }], meta)
        expect(log).toContain("- Kept [s:y]: m")
        expect(() => formatUpdateFailureLog("nope" as never, meta)).not.toThrow()
    })

    it("prints ? for non-finite meta counts instead of 'undefined'", () => {
        const log = formatUpdateFailureLog([], {
            version: "1",
            checkedAt: 0,
            checked: undefined as never,
            updated: Number.NaN,
            failed: 2
        })
        expect(log).toContain("checked: ? | updated: ? | failed: 2")
    })
})
