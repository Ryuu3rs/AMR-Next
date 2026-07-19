// Shared chapter-number / sortKey helpers for source adapters.
//
// Background - the "sortKey 0" bug class this module closes:
// An unparseable, oneshot, or missing chapter number used to default to
// `sortKey: 0` (via `parseFloat(x) || 0`, `?? 0`, or `: 0`). That is wrong two
// ways at once: 0 sorts BEFORE "Chapter 1", and downstream `Number.isFinite`
// progress guards treat 0 as a real number, so a bogus 0 clobbers stored reading
// progress. The codebase standardized on Number.POSITIVE_INFINITY as the "no
// number" sentinel; these helpers make that the only path.
//
// Contract:
//  - `parseChapterNumber` NEVER returns 0 for unparseable input (returns
//    undefined). A literal "0" input returns 0 - sortKey 0 may ONLY ever mean a
//    genuine "Chapter 0".
//  - In a LIST context an unnumbered chapter interpolates between its numbered
//    neighbours: `lastRealKey + unparsedRun / 1000`, walking the list in
//    chronological (oldest-first) order. `assignListSortKeys` does this; the
//    caller declares the document `order` so the walk is deterministic instead of
//    guessed per-page.
//  - In the SINGLE-chapter context (resolveChapter, with no surrounding list to
//    interpolate a position from) the caller uses `UNNUMBERED_SORT_KEY` so an
//    unnumbered chapter sorts to the END of the list rather than before every
//    real chapter.

// The "no parseable number" sentinel. An unnumbered single chapter sorts last,
// never before Chapter 1, and never collides with real reading progress.
export const UNNUMBERED_SORT_KEY = Number.POSITIVE_INFINITY

// Parse a chapter number out of an already-isolated numeric string (e.g. "12",
// "1.5", "0"). Returns undefined for null/undefined/empty/non-numeric input -
// crucially it NEVER coerces unparseable input to 0. A literal "0" returns 0.
export function parseChapterNumber(raw: string | null | undefined): number | undefined {
    if (raw === null || raw === undefined) return undefined
    const parsed = Number.parseFloat(raw)
    return Number.isFinite(parsed) ? parsed : undefined
}

// Assign a sortKey to every item in a scraped chapter list, interpolating a
// position for unnumbered entries (bonus/extra/oneshot) between their numbered
// neighbours instead of collapsing them to 0.
//
// `order` declares the document order the list is in:
//   - "newest-first"  the page lists the newest chapter first (descending number)
//   - "oldest-first"  the page lists Chapter 1 first (ascending number)
// The walk always proceeds chronologically (oldest -> newest) so an unnumbered
// run gets `lastRealKey + n/1000`, keeping it sandwiched between the real
// chapters it sits next to regardless of how the page happens to order rows.
//
// Returns an array of sortKeys parallel to `items` (result[i] belongs to
// items[i]), so the caller keeps its own document order untouched.
export function assignListSortKeys<T>(
    items: readonly T[],
    getNumber: (item: T) => number | undefined,
    order: "newest-first" | "oldest-first"
): number[] {
    const indices = [...items.keys()]
    const chronological = order === "newest-first" ? indices.reverse() : indices

    const sortKeys = new Array<number>(items.length)
    let lastRealKey = 0
    let unparsedRun = 0
    for (const index of chronological) {
        const number = getNumber(items[index] as T)
        if (number !== undefined) {
            sortKeys[index] = number
            lastRealKey = number
            unparsedRun = 0
        } else {
            unparsedRun += 1
            sortKeys[index] = lastRealKey + unparsedRun / 1000
        }
    }
    return sortKeys
}
