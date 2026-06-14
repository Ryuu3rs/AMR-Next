import type { MirrorCapability, MirrorCatalogDiagnostics } from "../mirrors/catalog"
import type { RewritePreferences } from "../settings/preferences"
import type { ReleaseReadiness } from "../release/readiness"
import type { SyncProvider, SyncRecordsImportResult, SyncMangaRecord, SyncStatus } from "../sync/status"

export type HealthPingMessage = { type: "health:ping" }
export type PreferencesGetMessage = { type: "preferences:get" }
export type PreferencesSetMessage = {
    type: "preferences:set"
    payload: RewritePreferences
}
export type MirrorsListMessage = { type: "mirrors:list" }
export type MirrorsDiagnosticsMessage = { type: "mirrors:diagnostics" }
export type ReleaseReadinessGetMessage = { type: "release:readiness:get" }
export type SyncStatusGetMessage = { type: "sync:status:get" }
export type SyncStatusSetMessage = {
    type: "sync:status:set"
    payload: {
        enabled: boolean
        provider: SyncProvider
        autoSync: boolean
        gistId: string | null
        gistToken: string | null
    }
}
export type SyncRunNowMessage = { type: "sync:run-now" }
export type SyncRecordsGetMessage = { type: "sync:records:get" }
export type SyncRecordsImportMessage = {
    type: "sync:records:import"
    payload: {
        records: unknown[]
    }
}

export type SearchMirrorsMessage = {
    type: "search:mirrors"
    payload: {
        query: string
        /** If empty/undefined, search all enabled mirrors */
        mirrors?: string[]
    }
}

export type SearchResult = {
    name: string
    url: string
    mirror: string
}

export type MirrorSearchStatus = {
    mirror: string
    status: "pending" | "done" | "error"
    count: number
    error?: string
    errorCode?: "OFFLINE" | "BLOCKED" | "NETWORK" | "TIMEOUT" | "PARSE" | "NOT_FOUND" | "HTTP" | "CHANGED" | "UNKNOWN"
    errorDetail?: string
    durationMs?: number
}

export type SearchMirrorsPayload = {
    ok: true
    query: string
    results: SearchResult[]
    mirrorStatuses: MirrorSearchStatus[]
    durationMs: number
}

// --- Release Tracking ---

export type ReleaseCheckMessage = { type: "release:check" }
export type ReleaseCheckStatusMessage = { type: "release:check:status" }

export type MangaReleaseInfo = {
    key: string
    name: string
    mirror: string
    url: string
    previousChapterUrl: string
    latestChapterUrl: string
    latestChapterName: string
    hasNew: boolean
    checkedAt: number
    error?: string
}

export type ReleaseCheckPayload = {
    ok: true
    results: MangaReleaseInfo[]
    checkedAt: number
    durationMs: number
    isRunning: boolean
}

export type ReleaseCheckStatusPayload = {
    ok: true
    lastCheckAt: number
    isRunning: boolean
    results: MangaReleaseInfo[]
}

// --- Sharing ---

export type ShareExportMessage = {
    type: "share:export"
    payload: {
        /** If empty, export all library manga */
        keys?: string[]
    }
}

export type ShareImportMessage = {
    type: "share:import"
    payload: {
        data: ShareableList
    }
}

export type ShareableManga = {
    name: string
    url: string
    mirror: string
    language: string
}

export type ShareableList = {
    version: 1
    name: string
    exportedAt: string
    manga: ShareableManga[]
}

export type ShareExportPayload = {
    ok: true
    data: ShareableList
}

export type ShareImportPayload = {
    ok: true
    imported: number
    skipped: number
    errors: number
}

export type ExtensionMessage =
    | HealthPingMessage
    | PreferencesGetMessage
    | PreferencesSetMessage
    | MirrorsListMessage
    | MirrorsDiagnosticsMessage
    | ReleaseReadinessGetMessage
    | SyncStatusGetMessage
    | SyncStatusSetMessage
    | SyncRunNowMessage
    | SyncRecordsGetMessage
    | SyncRecordsImportMessage
    | SearchMirrorsMessage
    | ReleaseCheckMessage
    | ReleaseCheckStatusMessage
    | ShareExportMessage
    | ShareImportMessage

export type HealthPong = {
    ok: true
    source: "background"
    timestamp: number
    version: string
}

export type PreferencesPayload = {
    ok: true
    preferences: RewritePreferences
}

export type MirrorsPayload = {
    ok: true
    mirrors: MirrorCapability[]
}

export type MirrorsDiagnosticsPayload = {
    ok: true
    mirrors: MirrorCapability[]
    diagnostics: MirrorCatalogDiagnostics
}

export type SyncStatusPayload = {
    ok: true
    syncStatus: SyncStatus
}

export type ReleaseReadinessPayload = {
    ok: true
    readiness: ReleaseReadiness
}

export type SyncRecordsPayload = {
    ok: true
    records: SyncMangaRecord[]
}

export type SyncRecordsImportPayload = {
    ok: true
    result: SyncRecordsImportResult
    records: SyncMangaRecord[]
}

export type ExtensionMessageResponseMap = {
    "health:ping": HealthPong
    "preferences:get": PreferencesPayload
    "preferences:set": PreferencesPayload
    "mirrors:list": MirrorsPayload
    "mirrors:diagnostics": MirrorsDiagnosticsPayload
    "release:readiness:get": ReleaseReadinessPayload
    "sync:status:get": SyncStatusPayload
    "sync:status:set": SyncStatusPayload
    "sync:run-now": SyncStatusPayload
    "sync:records:get": SyncRecordsPayload
    "sync:records:import": SyncRecordsImportPayload
    "search:mirrors": SearchMirrorsPayload
    "release:check": ReleaseCheckPayload
    "release:check:status": ReleaseCheckStatusPayload
    "share:export": ShareExportPayload
    "share:import": ShareImportPayload
}

export type ResponseFor<T extends ExtensionMessage["type"]> = ExtensionMessageResponseMap[T]
