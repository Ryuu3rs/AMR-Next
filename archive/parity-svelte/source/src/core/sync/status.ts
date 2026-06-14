import { extensionApi } from "../extension/browser-api"
import { applyDeletionSemantics, mergeMangaPayloadWithStats, normalizeMangaRecord } from "./reconcile.js"
import { normalizeSyncPayloadEnvelope, serializeSyncPayloadEnvelope } from "./payload.js"

export type SyncProvider = "none" | "gist"

export type SyncRunStats = {
    localCount: number
    remoteCount: number
    mergedCount: number
    keptTombstones: number
    prunedTombstones: number
    propagatedDeletes: number
    tieConflicts: number
    tombstoneTieBreaks: number
    duplicateKeyConflicts: number
    malformedLocalRecords: number
    malformedRemoteRecords: number
    remoteSchemaVersion: number
    usedLegacyArrayFormat: boolean
    usedLegacyLocalFallback: boolean
}

export type SyncStatus = {
    enabled: boolean
    provider: SyncProvider
    lastSyncAt: string | null
    autoSync: boolean
    lastError: string | null
    gistId: string | null
    gistToken: string | null
    lastRunStats: SyncRunStats | null
}

export type SyncRecordsImportResult = {
    importedCount: number
    rejectedCount: number
    totalReceived: number
}

export type SyncMangaRecord = {
    key: string
    updatedAt: number
    data: Record<string, unknown> | null
    deletedAt?: number | null
}

type GistFile = {
    content: string
    truncated?: boolean
    raw_url?: string
}

type GistResponse = {
    files?: {
        "amr.json"?: GistFile
    }
}

export const SYNC_STATUS_STORAGE_KEY = "rewrite.sync.status"
const SYNC_MANGA_STORAGE_KEY = "rewrite.sync.manga.records"
const LEGACY_DB_NAME = "AllMangasReader"
const LEGACY_DB_VERSION = 4
const LEGACY_MANGAS_STORE = "mangas"

export const defaultSyncStatus: SyncStatus = {
    enabled: false,
    provider: "none",
    lastSyncAt: null,
    autoSync: false,
    lastError: null,
    gistId: null,
    gistToken: null,
    lastRunStats: null
}

function normalizeSyncStatus(value: unknown): SyncStatus {
    if (!value || typeof value !== "object") {
        return defaultSyncStatus
    }

    const raw = value as Record<string, unknown>
    const stats = raw.lastRunStats as Record<string, unknown> | null | undefined

    return {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaultSyncStatus.enabled,
        provider: raw.provider === "gist" || raw.provider === "none" ? raw.provider : defaultSyncStatus.provider,
        lastSyncAt: typeof raw.lastSyncAt === "string" ? raw.lastSyncAt : defaultSyncStatus.lastSyncAt,
        autoSync: typeof raw.autoSync === "boolean" ? raw.autoSync : defaultSyncStatus.autoSync,
        lastError: typeof raw.lastError === "string" ? raw.lastError : defaultSyncStatus.lastError,
        gistId: typeof raw.gistId === "string" && raw.gistId.trim().length > 0 ? raw.gistId.trim() : null,
        gistToken: typeof raw.gistToken === "string" && raw.gistToken.trim().length > 0 ? raw.gistToken.trim() : null,
        lastRunStats:
            stats && typeof stats === "object"
                ? {
                      localCount: typeof stats.localCount === "number" ? stats.localCount : 0,
                      remoteCount: typeof stats.remoteCount === "number" ? stats.remoteCount : 0,
                      mergedCount: typeof stats.mergedCount === "number" ? stats.mergedCount : 0,
                      keptTombstones: typeof stats.keptTombstones === "number" ? stats.keptTombstones : 0,
                      prunedTombstones: typeof stats.prunedTombstones === "number" ? stats.prunedTombstones : 0,
                      propagatedDeletes: typeof stats.propagatedDeletes === "number" ? stats.propagatedDeletes : 0,
                      tieConflicts: typeof stats.tieConflicts === "number" ? stats.tieConflicts : 0,
                      tombstoneTieBreaks: typeof stats.tombstoneTieBreaks === "number" ? stats.tombstoneTieBreaks : 0,
                      duplicateKeyConflicts:
                          typeof stats.duplicateKeyConflicts === "number" ? stats.duplicateKeyConflicts : 0,
                      malformedLocalRecords:
                          typeof stats.malformedLocalRecords === "number" ? stats.malformedLocalRecords : 0,
                      malformedRemoteRecords:
                          typeof stats.malformedRemoteRecords === "number" ? stats.malformedRemoteRecords : 0,
                      remoteSchemaVersion:
                          typeof stats.remoteSchemaVersion === "number" ? stats.remoteSchemaVersion : 1,
                      usedLegacyArrayFormat:
                          typeof stats.usedLegacyArrayFormat === "boolean" ? stats.usedLegacyArrayFormat : false,
                      usedLegacyLocalFallback:
                          typeof stats.usedLegacyLocalFallback === "boolean" ? stats.usedLegacyLocalFallback : false
                  }
                : null
    }
}

async function loadLegacyMangaRecordsFromIndexedDb(): Promise<SyncMangaRecord[]> {
    if (typeof indexedDB === "undefined") {
        return []
    }

    try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })

        const mangas = await new Promise<SyncMangaRecord[]>((resolve, reject) => {
            const tx = db.transaction([LEGACY_MANGAS_STORE], "readonly")
            const store = tx.objectStore(LEGACY_MANGAS_STORE)
            const request = store.getAll()

            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                const records = Array.isArray(request.result) ? request.result : []
                resolve(records.map(normalizeMangaRecord).filter((item): item is SyncMangaRecord => item !== null))
            }
        })

        db.close()
        return mangas
    } catch {
        return []
    }
}

async function getLocalSyncMangaRecords(): Promise<{
    records: SyncMangaRecord[]
    malformedCount: number
    usedLegacyLocalFallback: boolean
}> {
    const stored = await extensionApi.storage.local.get(SYNC_MANGA_STORAGE_KEY)
    const payload = stored?.[SYNC_MANGA_STORAGE_KEY]

    if (Array.isArray(payload) && payload.length > 0) {
        let malformedCount = 0
        const records = payload
            .map(item => {
                const normalized = normalizeMangaRecord(item)
                if (!normalized) malformedCount++
                return normalized
            })
            .filter((item): item is SyncMangaRecord => item !== null)

        return { records, malformedCount, usedLegacyLocalFallback: false }
    }

    const legacyRecords = await loadLegacyMangaRecordsFromIndexedDb()
    if (legacyRecords.length > 0) {
        return { records: legacyRecords, malformedCount: 0, usedLegacyLocalFallback: true }
    }

    return { records: [], malformedCount: 0, usedLegacyLocalFallback: false }
}

async function saveLocalSyncMangaRecords(payload: SyncMangaRecord[]): Promise<void> {
    await extensionApi.storage.local.set({
        [SYNC_MANGA_STORAGE_KEY]: payload
    })
}

export async function getLocalSyncRecordsSnapshot(): Promise<SyncMangaRecord[]> {
    const payload = await getLocalSyncMangaRecords()
    return payload.records
}

export async function replaceLocalSyncRecords(records: unknown[]): Promise<SyncRecordsImportResult> {
    let rejectedCount = 0

    const normalized = records
        .map(item => {
            const parsed = normalizeMangaRecord(item)
            if (!parsed) rejectedCount++
            return parsed
        })
        .filter((item): item is SyncMangaRecord => item !== null)

    await saveLocalSyncMangaRecords(normalized)

    return {
        importedCount: normalized.length,
        rejectedCount,
        totalReceived: records.length
    }
}

async function gistRequest<T>({
    path,
    token,
    method = "GET",
    body
}: {
    path: string
    token: string
    method?: "GET" | "PATCH"
    body?: unknown
}): Promise<T> {
    const response = await fetch(`https://api.github.com/${path}`, {
        method,
        headers: {
            accept: "application/vnd.github+json",
            "content-type": "application/json; charset=utf-8",
            authorization: `Bearer ${token}`
        },
        body: body ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
        throw new Error(`Gist request failed (${response.status} ${response.statusText})`)
    }

    return (await response.json()) as T
}

async function getRemoteGistPayload(
    syncStatus: SyncStatus
): Promise<{
    records: SyncMangaRecord[]
    malformedCount: number
    schemaVersion: number
    usedLegacyArrayFormat: boolean
}> {
    const gist = await gistRequest<GistResponse>({
        path: `gists/${syncStatus.gistId}`,
        token: syncStatus.gistToken!
    })

    const file = gist.files?.["amr.json"]

    if (!file) {
        return { records: [], malformedCount: 0, schemaVersion: 1, usedLegacyArrayFormat: false }
    }

    if (file.truncated && file.raw_url) {
        const response = await fetch(file.raw_url)
        const json = (await response.json()) as unknown
        const envelope = normalizeSyncPayloadEnvelope(json)

        let malformedCount = 0
        const records = envelope.records
            .map(item => {
                const normalized = normalizeMangaRecord(item)
                if (!normalized) malformedCount++
                return normalized
            })
            .filter((item): item is SyncMangaRecord => item !== null)

        return {
            records,
            malformedCount,
            schemaVersion: envelope.schemaVersion,
            usedLegacyArrayFormat: envelope.usedLegacyArrayFormat
        }
    }

    try {
        const parsed = JSON.parse(file.content) as unknown
        const envelope = normalizeSyncPayloadEnvelope(parsed)

        let malformedCount = 0
        const records = envelope.records
            .map(item => {
                const normalized = normalizeMangaRecord(item)
                if (!normalized) malformedCount++
                return normalized
            })
            .filter((item): item is SyncMangaRecord => item !== null)

        return {
            records,
            malformedCount,
            schemaVersion: envelope.schemaVersion,
            usedLegacyArrayFormat: envelope.usedLegacyArrayFormat
        }
    } catch {
        return { records: [], malformedCount: 1, schemaVersion: 1, usedLegacyArrayFormat: false }
    }
}

async function saveRemoteGistPayload(syncStatus: SyncStatus, payload: SyncMangaRecord[]): Promise<void> {
    await gistRequest({
        method: "PATCH",
        path: `gists/${syncStatus.gistId}`,
        token: syncStatus.gistToken!,
        body: {
            files: {
                "amr.json": {
                    content: JSON.stringify(serializeSyncPayloadEnvelope(payload))
                }
            }
        }
    })
}

export async function getSyncStatus(): Promise<SyncStatus> {
    const stored = await extensionApi.storage.local.get(SYNC_STATUS_STORAGE_KEY)
    return normalizeSyncStatus(stored?.[SYNC_STATUS_STORAGE_KEY])
}

export async function saveSyncStatus(next: Partial<SyncStatus>): Promise<SyncStatus> {
    const current = await getSyncStatus()
    const merged = normalizeSyncStatus({ ...current, ...next })

    await extensionApi.storage.local.set({
        [SYNC_STATUS_STORAGE_KEY]: merged
    })

    return merged
}

export async function runSyncNow(): Promise<SyncStatus> {
    const current = await getSyncStatus()

    if (!current.enabled || current.provider === "none") {
        return saveSyncStatus({
            lastError: "Sync is disabled or no provider selected"
        })
    }

    if (current.provider === "gist" && (!current.gistId || !current.gistToken)) {
        return saveSyncStatus({
            lastError: "Gist ID and token are required for gist sync"
        })
    }

    try {
        if (current.provider === "gist") {
            const [localPayload, remotePayload] = await Promise.all([
                getLocalSyncMangaRecords(),
                getRemoteGistPayload(current)
            ])
            const merged = mergeMangaPayloadWithStats(localPayload.records, remotePayload.records)
            const withSemantics = applyDeletionSemantics(merged.records)

            await Promise.all([
                saveLocalSyncMangaRecords(withSemantics.records),
                saveRemoteGistPayload(current, withSemantics.records)
            ])

            return saveSyncStatus({
                lastSyncAt: new Date().toISOString(),
                lastError: null,
                lastRunStats: {
                    localCount: localPayload.records.length,
                    remoteCount: remotePayload.records.length,
                    mergedCount: withSemantics.records.length,
                    keptTombstones: withSemantics.keptTombstones,
                    prunedTombstones: withSemantics.prunedTombstones,
                    propagatedDeletes: withSemantics.propagatedDeletes,
                    tieConflicts: merged.tieConflicts,
                    tombstoneTieBreaks: merged.tombstoneTieBreaks,
                    duplicateKeyConflicts: merged.duplicateKeyConflicts,
                    malformedLocalRecords: localPayload.malformedCount,
                    malformedRemoteRecords: remotePayload.malformedCount,
                    remoteSchemaVersion: remotePayload.schemaVersion,
                    usedLegacyArrayFormat: remotePayload.usedLegacyArrayFormat,
                    usedLegacyLocalFallback: localPayload.usedLegacyLocalFallback
                }
            })
        }

        return saveSyncStatus({
            lastSyncAt: new Date().toISOString(),
            lastError: null
        })
    } catch (error) {
        return saveSyncStatus({
            lastError: error instanceof Error ? error.message : "Sync failed"
        })
    }
}
