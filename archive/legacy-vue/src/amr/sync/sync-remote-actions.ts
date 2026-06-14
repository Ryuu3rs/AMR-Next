/**
 * Remote sync actions for SyncManager
 * Handles operations that modify remote storage
 * Refactored from sync-remote-actions.js with TypeScript types
 */
import { ThrottleError } from "../storage/error/ToManyRequests"
import * as syncUtils from "./utils"
import { SyncManga } from "./sync-operations"
import { SyncTracker } from "./SyncTracker"
import { AppLogger } from "../../shared/AppLogger"
import { AppOptions } from "../../shared/OptionStorage"

/**
 * Remote storage interface for sync actions
 */
export interface RemoteStorageForActions {
    name: string
    isdb: boolean
    retryDate?: Date
    getAll(): Promise<SyncManga[]>
    saveAll(mangas: SyncManga[]): Promise<void>
    delete(key: string, value: SyncManga): Promise<void>
    set?(manga: SyncManga): void
    constructor: { name: string }
}

/**
 * Context object for remote sync operations
 */
export interface SyncContext {
    remoteStorages: RemoteStorageForActions[]
    vuexStore: { options: AppOptions }
    syncTracker: SyncTracker
    logger: AppLogger
}

/**
 * Delete a manga from remote storage (marks as deleted for sync)
 */
export async function deleteMangaFromRemote(context: SyncContext, key: string): Promise<void> {
    const { remoteStorages, syncTracker, logger } = context

    for (const storage of remoteStorages) {
        try {
            await storage.delete(key, {
                key,
                ts: Math.round(Date.now() / 1000),
                deleted: syncUtils.DELETED
            })
        } catch (e) {
            syncTracker.triggerLastSyncError(e)

            if (e instanceof ThrottleError) {
                storage.retryDate = e.getRetryAfterDate()
                const retryDelay = storage.retryDate.getTime() - Date.now() + 2000

                setTimeout(() => {
                    deleteMangaFromRemote(context, key)
                }, retryDelay)
            } else if (e instanceof Error) {
                logger.debug(`[SYNC-${storage.constructor.name.replace("Storage", "")}] ${e.message}`)
            }
        }
    }
}

/**
 * Set a manga property to remote storage
 */
export async function setToRemote(
    context: SyncContext,
    localManga: SyncManga,
    mutatedKey: string,
    remoteStorage?: RemoteStorageForActions
): Promise<void> {
    const { remoteStorages, vuexStore } = context

    // Retry later if currently syncing
    if (vuexStore.options.isSyncing && !remoteStorage) {
        setTimeout(() => {
            setToRemote(context, localManga, mutatedKey, remoteStorage)
        }, 5000)
        return
    }

    if (remoteStorage) {
        await setToRemoteInternal(context, localManga, mutatedKey, remoteStorage)
    } else {
        for (const storage of remoteStorages) {
            await setToRemoteInternal(context, localManga, mutatedKey, storage)
        }
    }
}

/**
 * Internal implementation for setting manga to remote
 */
async function setToRemoteInternal(
    context: SyncContext,
    localManga: SyncManga,
    mutatedKey: string,
    storage: RemoteStorageForActions
): Promise<void> {
    const { syncTracker, logger } = context

    // Get remote manga list
    const remoteList = await storage.getAll()
    const remoteManga = remoteList.find(m => m.key === localManga.key)

    if (!remoteManga) {
        // New manga - add to list
        remoteList.push({ ...localManga, listChaps: [] })
    } else {
        // Update existing manga
        let shouldSave = false

        if (mutatedKey === "ts") {
            // Timestamp update (chapter read progress)
            if (remoteManga.ts < localManga.ts) {
                remoteManga.lastChapterReadURL = localManga.lastChapterReadURL
                remoteManga.lastChapterReadName = localManga.lastChapterReadName
                remoteManga.ts = localManga.ts
                shouldSave = true
            }
        } else if (
            (remoteManga as unknown as Record<string, unknown>)[mutatedKey] !==
            (localManga as unknown as Record<string, unknown>)[mutatedKey]
        ) {
            // Other property update
            ;(remoteManga as unknown as Record<string, unknown>)[mutatedKey] = (
                localManga as unknown as Record<string, unknown>
            )[mutatedKey]
            remoteManga.tsOpts = localManga.tsOpts
            shouldSave = true
        }

        if (!shouldSave) return

        // Handle re-added manga that was previously deleted
        if (remoteManga.deleted === syncUtils.DELETED) {
            Object.assign(remoteManga, localManga, { listChaps: [] })
            delete remoteManga.deleted
        }
    }

    // Save changes
    if (storage.isdb && storage.set) {
        storage.set(remoteManga || { ...localManga, listChaps: [] })
    } else {
        try {
            await storage.saveAll(remoteList)
        } catch (e) {
            handleSaveError(context, storage, localManga, mutatedKey, e)
        }
    }
}

/**
 * Handle save errors with retry logic
 */
function handleSaveError(
    context: SyncContext,
    storage: RemoteStorageForActions,
    localManga: SyncManga,
    mutatedKey: string,
    e: unknown
): void {
    const { syncTracker, logger } = context

    syncTracker.triggerLastSyncError(e)

    if (e instanceof ThrottleError) {
        storage.retryDate = e.getRetryAfterDate()
        const retryDelay = storage.retryDate.getTime() - Date.now() + 2000

        setTimeout(() => {
            setToRemote(context, localManga, mutatedKey)
        }, retryDelay)
    } else if (e instanceof Error) {
        logger.debug(`[SYNC-${storage.constructor.name.replace("Storage", "")}] ${e.message}`)
    }
}

/**
 * Fix language keys in remote storage
 * Used when manga keys change due to language corrections
 */
export async function fixLang(
    context: SyncContext,
    payload: Array<{ oldManga: SyncManga; newManga: SyncManga }>
): Promise<void> {
    const { remoteStorages, syncTracker, logger } = context

    for (const storage of remoteStorages) {
        try {
            const remoteList = await storage.getAll()

            // Mark old keys as deleted and add new keys
            const updated = remoteList
                .map(manga => {
                    const match = payload.find(p => p.oldManga.key === manga.key)
                    if (!match) return manga

                    return {
                        key: manga.key,
                        ts: Math.round(Date.now() / 1000),
                        deleted: syncUtils.DELETED
                    }
                })
                .concat(payload.map(p => p.newManga))

            await storage.saveAll(updated as SyncManga[])
        } catch (e) {
            syncTracker.triggerLastSyncError(e)

            if (e instanceof ThrottleError) {
                storage.retryDate = e.getRetryAfterDate()
                const retryDelay = storage.retryDate.getTime() - Date.now() + 2000

                setTimeout(() => {
                    fixLang(context, payload)
                }, retryDelay)
            } else if (e instanceof Error) {
                logger.debug(`[SYNC-${storage.constructor.name.replace("Storage", "")}] ${e.message}`)
            }
        }
    }
}
