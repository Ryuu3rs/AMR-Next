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
