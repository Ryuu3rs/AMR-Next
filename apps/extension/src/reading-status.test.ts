import { describe, it, expect } from "vitest"
import type { LibraryManga } from "./database"
import { neverRead, hasNewerChapters, statusOf, readChapterLabel } from "./reading-status"

function manga(fields: Partial<LibraryManga>): LibraryManga {
    return fields as LibraryManga
}

describe("reading-status", () => {
    it("treats a fully unread title as unread", () => {
        const m = manga({})
        expect(neverRead(m)).toBe(true)
        expect(statusOf(m)).toBe("unread")
        expect(readChapterLabel(m)).toBe("Unread")
    })

    it("labels a numbered read position", () => {
        const m = manga({ lastReadChapterId: "c12", lastReadChapterNumber: 12 })
        expect(readChapterLabel(m)).toBe("Ch 12")
        expect(readChapterLabel(m, "Read ch")).toBe("Read ch 12")
    })

    // A MangaDex oneshot: single chapter has sortKey Infinity, so only the *Id
    // fields are stored. The old number-only renderers wrongly printed "Unread".
    it("labels a read but unnumbered oneshot as Read, not Unread", () => {
        const m = manga({ lastReadChapterId: "one", latestChapterId: "one" })
        expect(neverRead(m)).toBe(false)
        expect(hasNewerChapters(m)).toBe(false)
        expect(statusOf(m)).toBe("completed")
        expect(readChapterLabel(m)).toBe("Read")
        expect(readChapterLabel(m, "Read ch")).toBe("Read")
    })

    it("marks a caught-up numbered title completed", () => {
        const m = manga({
            lastReadChapterId: "c15",
            lastReadChapterNumber: 15,
            latestChapterId: "c15",
            latestChapterNumber: 15
        })
        expect(statusOf(m)).toBe("completed")
        expect(hasNewerChapters(m)).toBe(false)
    })

    it("marks a title with newer chapters reading", () => {
        const m = manga({
            lastReadChapterId: "c12",
            lastReadChapterNumber: 12,
            latestChapterId: "c15",
            latestChapterNumber: 15
        })
        expect(statusOf(m)).toBe("reading")
        expect(hasNewerChapters(m)).toBe(true)
    })

    // After an import/migration the ids legitimately differ while numbers match;
    // the number comparison must win so a caught-up title is not flagged unread.
    it("prefers the number comparison over differing ids", () => {
        const m = manga({
            lastReadChapterId: "old-source-c15",
            lastReadChapterNumber: 15,
            latestChapterId: "new-source-c15",
            latestChapterNumber: 15
        })
        expect(hasNewerChapters(m)).toBe(false)
        expect(statusOf(m)).toBe("completed")
    })
})
