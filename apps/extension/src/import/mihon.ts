// Parse a Mihon / Tachiyomi `.tachibk` backup (already gunzipped to bytes) into a normalized,
// reader-agnostic ImportedManga[]. Field numbers are from Mihon's own @ProtoNumber models
// (Backup / BackupManga / BackupChapter / BackupTracking / BackupCategory) and are shared by the
// Mihon-family forks (TachiyomiSY, J2K, Aniyomi, Neko, Komikku). We extract only what tracking
// needs; unknown fields are ignored so a newer backup still parses.

import {
    decodeMessage,
    fieldBool,
    fieldFloat,
    fieldInt,
    fieldMessage,
    fieldString,
    repeatedStrings,
    repeatedVarints,
    type Fields
} from "./protobuf"
import type { ImportedManga, ReaderStatus } from "./types"

// Tachiyomi/Mihon tracker sync ids (TrackerManager). We only care about the two that map to our
// metadata: AniList (its remote id IS our anilistId) and MyAnimeList.
const TRACKER_ANILIST = 2
const TRACKER_MYANIMELIST = 1

// Tachiyomi/Mihon SManga status enum -> our status. 0 unknown, 3 licensed fall through.
function mihonStatus(n: number): ReaderStatus {
    return n === 1
        ? "ongoing"
        : n === 2 || n === 4
          ? "completed"
          : n === 5
            ? "cancelled"
            : n === 6
              ? "hiatus"
              : "unknown"
}

function readTracking(fields: Fields): { anilistId?: number; malId?: number } {
    const out: { anilistId?: number; malId?: number } = {}
    for (const e of fields.get(18) ?? []) {
        const t = fieldMessage(e)
        if (!t) continue
        const syncId = fieldInt(t.get(1))
        // mediaId (100) is the modern field; mediaIdInt (3) is the legacy 1.x fallback.
        const remoteId = fieldInt(t.get(100)) || fieldInt(t.get(3))
        if (!remoteId) continue
        if (syncId === TRACKER_ANILIST && out.anilistId === undefined) out.anilistId = remoteId
        else if (syncId === TRACKER_MYANIMELIST && out.malId === undefined) out.malId = remoteId
    }
    return out
}

function readMaxReadChapter(fields: Fields): number | undefined {
    let max: number | undefined
    for (const e of fields.get(16) ?? []) {
        const c = fieldMessage(e)
        if (!c) continue
        if (!fieldBool(c.get(4))) continue // read flag
        const n = fieldFloat(c.get(9)) // chapterNumber
        if (typeof n === "number" && n >= 0 && (max === undefined || n > max)) max = n
    }
    return max
}

export function parseMihonBackup(bytes: Uint8Array): ImportedManga[] {
    const root = decodeMessage(bytes)

    // backupCategories (2): map the value stored on a manga's categories list to a name. Tachiyomi
    // 0.x stored the category ORDER on the manga; Mihon also carries an id. Index by both so either
    // convention resolves.
    const categoryByRef = new Map<number, string>()
    for (const e of root.get(2) ?? []) {
        const c = fieldMessage(e)
        if (!c) continue
        const name = fieldString(c.get(1))
        if (!name) continue
        const order = fieldInt(c.get(2))
        const id = fieldInt(c.get(3))
        if (order !== undefined) categoryByRef.set(order, name)
        if (id !== undefined && id !== 0) categoryByRef.set(id, name)
    }

    const out: ImportedManga[] = []
    for (const e of root.get(1) ?? []) {
        const m = fieldMessage(e)
        if (!m) continue
        const title = fieldString(m.get(3))?.trim()
        if (!title) continue // a title is the minimum we need to track something

        const { anilistId, malId } = readTracking(m)
        const categoryNames = repeatedVarints(m.get(17))
            .map(ref => categoryByRef.get(ref))
            .filter((n): n is string => Boolean(n))
        const source = m.get(1)?.[0]?.num
        const url = fieldString(m.get(2))
        const coverUrl = fieldString(m.get(9))
        const notes = fieldString(m.get(110))
        const maxReadChapter = readMaxReadChapter(m)

        out.push({
            title,
            ...(url ? { url } : {}),
            ...(source !== undefined ? { sourceId: source.toString() } : {}),
            ...(coverUrl ? { coverUrl } : {}),
            genres: repeatedStrings(m.get(7)),
            status: mihonStatus(fieldInt(m.get(8)) ?? 0),
            categories: categoryNames,
            ...(maxReadChapter !== undefined ? { maxReadChapter } : {}),
            ...(anilistId ? { anilistId } : {}),
            ...(malId ? { malId } : {}),
            ...(notes ? { notes } : {})
        })
    }
    return out
}
