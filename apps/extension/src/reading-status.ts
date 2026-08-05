import type { LibraryManga } from "./database"

export type LibraryStatus = "unread" | "reading" | "completed"

// A title the user has never opened at all (no read id AND no read number).
export function neverRead(manga: LibraryManga): boolean {
    return manga.lastReadChapterId === undefined && manga.lastReadChapterNumber === undefined
}

// True when the title has chapters newer than the last-read position. Prefer a
// chapter-NUMBER comparison: after an import or migration latestChapterId and
// lastReadChapterId legitimately differ - the backup's read id points at the old
// source's chapter, the latest id at the re-fetched one - even when the numbers
// match, which left a stale "Unread" badge on a fully caught-up title. Only when a
// number is genuinely unavailable (an unnumbered-only title, or the last chapter
// read was an unnumbered special) fall back to id inequality - there are no numbers
// to have desynced there, so the id signal is the correct one.
export function hasNewerChapters(manga: LibraryManga): boolean {
    if (manga.latestChapterNumber !== undefined && manga.lastReadChapterNumber !== undefined) {
        return manga.latestChapterNumber > manga.lastReadChapterNumber
    }
    return !!(manga.latestChapterId && manga.lastReadChapterId && manga.latestChapterId !== manga.lastReadChapterId)
}

export function statusOf(m: LibraryManga): LibraryStatus {
    if (neverRead(m)) return "unread"
    return hasNewerChapters(m) ? "reading" : "completed"
}

// The effective status shown in the library: the derived reading/completed/unread of
// statusOf, plus the three explicit overrides that read progress alone can't express
// (paused/dropped/planning). One day in milliseconds, used for the auto-pause window.
const DAY_MS = 86_400_000

export type ReadingStatus = "unread" | "reading" | "paused" | "dropped" | "completed" | "planning"

// Effective status with LOCAL ACTIVITY WINS precedence: a title the user has caught up
// on reads as "completed" even if it still carries a stored paused/dropped override, and
// reading a chapter is what clears that override (see saveProgress). autoPauseDays === 0
// disables the inactivity-based auto-pause entirely; when > 0 a title whose last real
// read is older than the window pauses on its own without an explicit override.
export function effectiveReadingStatus(m: LibraryManga, opts: { autoPauseDays: number; now: number }): ReadingStatus {
    const hasRead = !neverRead(m)
    // 1. Local completion overrides everything, including a stored paused/dropped.
    if (hasRead && !hasNewerChapters(m)) return "completed"
    // 2. Explicit dropped.
    if (m.readingStatus === "dropped") return "dropped"
    // 3. Paused: explicit override, or inactive past the auto-pause window.
    const autoPaused =
        opts.autoPauseDays > 0 && m.lastReadAt !== undefined && opts.now - m.lastReadAt > opts.autoPauseDays * DAY_MS
    if (m.readingStatus === "paused" || autoPaused) return "paused"
    // 4. Planning only applies to a title not yet started.
    if (m.readingStatus === "planning" && !hasRead) return "planning"
    // 5. Started but not caught up.
    if (hasRead) return "reading"
    // 6. Never opened.
    return "unread"
}

// The default "Ongoing" library filter: everything the user is (or could be) actively
// working through - i.e. NOT paused, dropped, or completed.
export function isOngoing(status: ReadingStatus): boolean {
    return status === "unread" || status === "reading" || status === "planning"
}

// Human read-progress text for a title. When a chapter number is known it reads
// "Ch 12" (or "Read ch 12" in the detail panel via the prefix). When no number
// exists it falls back to the id signal - a read-but-unnumbered title, such as a
// MangaDex oneshot whose single chapter has no number, has a lastReadChapterId
// but no lastReadChapterNumber, so a number-only check wrongly printed "Unread".
// This mirrors neverRead so the label always agrees with the unread filter and
// the poster badge.
export function readChapterLabel(m: LibraryManga, prefix = "Ch"): string {
    if (m.lastReadChapterNumber !== undefined) return `${prefix} ${m.lastReadChapterNumber}`
    return neverRead(m) ? "Unread" : "Read"
}
