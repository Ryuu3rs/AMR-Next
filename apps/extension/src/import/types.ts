// Shared shape every reader parser produces. Each parser normalizes its own status enum to
// ReaderStatus so the import handler never has to know which app a row came from.

export type ReaderStatus = "ongoing" | "completed" | "hiatus" | "cancelled" | "unknown"

export type ImportedManga = {
    title: string
    // Source-relative url + numeric/string source id from the origin app. Kept for a future
    // source-map; by default an import is tracking-only.
    url?: string
    sourceId?: string
    coverUrl?: string
    genres: string[]
    status: ReaderStatus
    // Category names this title belonged to in the origin app.
    categories: string[]
    // Highest chapter number marked read (Mihon), or a best-effort read count (Mangayomi, whose
    // chapters carry no number) - maps to lastReadChapterNumber. undefined when nothing is read.
    maxReadChapter?: number
    anilistId?: number
    malId?: number
    notes?: string
}
