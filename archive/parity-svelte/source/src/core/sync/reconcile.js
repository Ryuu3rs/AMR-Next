/**
 * @typedef {{ key: string, updatedAt: number, data: Record<string, unknown>|null, deletedAt?: number|null }} SyncMangaRecord
 */

const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * @param {unknown} value
 * @returns {SyncMangaRecord | null}
 */
export function normalizeMangaRecord(value) {
    if (!value || typeof value !== "object") {
        return null
    }

    const raw = /** @type {Record<string, unknown>} */ (value)
    if (typeof raw.key !== "string") {
        return null
    }

    const updatedAt =
        typeof raw.updatedAt === "number" ? raw.updatedAt : typeof raw.ts === "number" ? raw.ts : Date.now()

    const deletedAt =
        typeof raw.deletedAt === "number" ? raw.deletedAt : typeof raw.deleted === "number" ? raw.deleted : null

    return {
        key: raw.key,
        updatedAt,
        deletedAt,
        data: deletedAt ? null : raw.data && typeof raw.data === "object" ? raw.data : raw
    }
}

/**
 * @param {SyncMangaRecord} incoming
 * @param {SyncMangaRecord | undefined} existing
 * @returns {boolean}
 */
function shouldReplace(incoming, existing) {
    if (!existing) return true
    if (incoming.updatedAt > existing.updatedAt) return true

    // If timestamps tie, prefer tombstone to avoid resurrecting deleted data.
    if (incoming.updatedAt === existing.updatedAt && incoming.deletedAt && !existing.deletedAt) {
        return true
    }

    return false
}

/**
 * @param {SyncMangaRecord[]} local
 * @param {SyncMangaRecord[]} remote
 * @returns {SyncMangaRecord[]}
 */
export function mergeMangaPayload(local, remote) {
    return mergeMangaPayloadWithStats(local, remote).records
}

/**
 * @param {SyncMangaRecord[]} local
 * @param {SyncMangaRecord[]} remote
 * @returns {{records: SyncMangaRecord[], tieConflicts: number, tombstoneTieBreaks: number, duplicateKeyConflicts: number}}
 */
export function mergeMangaPayloadWithStats(local, remote) {
    const merged = new Map()
    let tieConflicts = 0
    let tombstoneTieBreaks = 0
    let duplicateKeyConflicts = 0

    for (const item of [...local, ...remote]) {
        const existing = merged.get(item.key)
        if (existing) {
            duplicateKeyConflicts++
            if (item.updatedAt === existing.updatedAt) {
                tieConflicts++
                if (item.deletedAt && !existing.deletedAt) {
                    tombstoneTieBreaks++
                }
            }
        }

        if (shouldReplace(item, existing)) {
            merged.set(item.key, item)
        }
    }

    return {
        records: Array.from(merged.values()),
        tieConflicts,
        tombstoneTieBreaks,
        duplicateKeyConflicts
    }
}

/**
 * @param {SyncMangaRecord[]} records
 * @returns {{records: SyncMangaRecord[], keptTombstones: number, prunedTombstones: number, propagatedDeletes: number}}
 */
export function applyDeletionSemantics(records) {
    const now = Date.now()
    let keptTombstones = 0
    let prunedTombstones = 0
    let propagatedDeletes = 0

    const normalized = records
        .filter(record => {
            if (!record.deletedAt) return true
            const keep = now - record.deletedAt < TOMBSTONE_RETENTION_MS
            if (keep) {
                keptTombstones++
            } else {
                prunedTombstones++
            }
            return keep
        })
        .map(record => {
            if (!record.deletedAt) return record
            propagatedDeletes++
            return {
                ...record,
                data: null
            }
        })

    return {
        records: normalized,
        keptTombstones,
        prunedTombstones,
        propagatedDeletes
    }
}
