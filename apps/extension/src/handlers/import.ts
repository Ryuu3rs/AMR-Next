import { normalizeTitle } from "@amr/normalize"
import type { HandlerMap } from "../background/handler-types"
import { addImportedManga, type LibraryManga } from "../database"
import { getImportFormat, type ImportedManga } from "../import"

// Origin app status enum (Tachiyomi/Mihon SManga) -> our library status. Unlisted (0 unknown,
// 3 licensed) fall through to "unknown".
const STATUS_MAP: Record<number, LibraryManga["status"]> = {
    1: "ongoing",
    2: "completed",
    4: "completed", // publishing finished
    5: "cancelled",
    6: "hiatus"
}

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

// Map a normalized imported entry to a library row. Tracking-first: we can't resolve another app's
// numeric source ids, so an entry with an AniList id is keyed as an AniList tracking row (same shape
// as library:quick-add) and one without is keyed by title. addImportedManga then dedups by anilistId
// and by normalized title, so nothing already in the library is duplicated.
function toCandidate(m: ImportedManga): LibraryManga {
    const now = Date.now()
    const normalizedTitle = normalizeTitle(m.title)
    const hasAniList = typeof m.anilistId === "number"
    const maxRead = m.maxReadChapter
    return {
        id: hasAniList ? `anilist:manga:${m.anilistId}` : `import:manga:${normalizedTitle}`,
        title: m.title,
        normalizedTitle,
        authors: [],
        status: STATUS_MAP[m.status] ?? "unknown",
        sourceId: hasAniList ? "anilist.co" : "import",
        sourceUrl: hasAniList
            ? `https://anilist.co/manga/${m.anilistId}`
            : `amr:import:${encodeURIComponent(normalizedTitle)}`,
        manualTracking: true,
        addedAt: now,
        updatedAt: now,
        ...(hasAniList ? { anilistId: m.anilistId } : {}),
        ...(m.coverUrl ? { coverUrl: m.coverUrl } : {}),
        ...(m.genres.length > 0 ? { genres: m.genres } : {}),
        ...(m.categories.length > 0 ? { categories: m.categories } : {}),
        ...(m.notes ? { notes: m.notes } : {}),
        ...(typeof maxRead === "number" && maxRead > 0
            ? { lastReadChapterNumber: maxRead, latestChapterNumber: maxRead, lastReadAt: now }
            : {})
    }
}

export const importHandlers: HandlerMap = {
    // Import a library/list from another reader (Mihon/Tachiyomi etc). `format` selects the parser
    // from the registry (the UI dropdown); `dataB64` is the raw file. `preview` parses + counts
    // without writing, so the UI can confirm before merging. Additive/merge only - never wipes.
    "import:reader": async request => {
        const format = getImportFormat(request.format)
        if (!format) throw new Error(`Unknown import format: ${request.format}`)

        const parsed = await format.parse(base64ToBytes(request.dataB64))
        const withAniList = parsed.filter(m => typeof m.anilistId === "number").length
        const withProgress = parsed.filter(m => typeof m.maxReadChapter === "number").length

        if (request.preview) {
            return {
                preview: true,
                total: parsed.length,
                withAniList,
                trackingOnly: parsed.length - withAniList,
                withProgress
            }
        }

        const { imported, skipped } = await addImportedManga(parsed.map(toCandidate))
        return { preview: false, total: parsed.length, imported, skipped, withAniList, withProgress }
    }
}
