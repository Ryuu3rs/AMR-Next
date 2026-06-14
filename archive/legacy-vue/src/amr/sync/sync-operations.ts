/**
 * Sync operations for processing updates between local and remote storage
 * Extracted from sync-manager.js for better maintainability
 */
import * as syncUtils from "./utils"

/**
 * Manga interface for sync operations
 */
export interface SyncManga {
    key: string
    ts: number
    tsOpts?: number
    deleted?: number
    read?: number
    update?: number
    display?: number
    layout?: number
    webtoon?: number
    zoom?: number
    displayName?: string
    lastChapterReadURL?: string
    lastChapterReadName?: string
    listChaps?: unknown[]
}

/**
 * Local storage interface for sync operations
 */
export interface LocalStorage {
    dispatch: (action: string, manga: SyncManga, silent?: boolean) => Promise<void>
    syncLocal: (manga: SyncManga) => void
}

/**
 * Remote storage interface for sync operations
 */
export interface RemoteStorage {
    isdb: boolean
    saveAll: (mangas: SyncManga[]) => Promise<void>
    constructor: { name: string }
}

/**
 * Logger interface for sync operations
 */
export interface SyncLogger {
    debug: (message: string, ...args: unknown[]) => void
}

/**
 * Checks if entry is deleted or corrupted
 */
export function shouldSkipSync(manga: SyncManga): boolean {
    return manga.deleted === syncUtils.DELETED || manga.key === syncUtils.FAIL_KEY
}

/**
 * Don't have local copy and remote manga is not skipped
 * or remote manga have newer timestamp
 */
export function shouldSyncToLocal(localManga: SyncManga | null, remoteManga: SyncManga): boolean {
    // Don't have local copy, but remote manga is skipped.
    // Should not sync as there are no reason to added *new* deleted entry,
    // that will try to delete non existing local entry forever.
    if (!localManga && shouldSkipSync(remoteManga)) {
        return false
    }

    // Don't have it or remote manga have newer timestamp
    return !localManga || localManga.ts < remoteManga.ts
}

/**
 * Compare remote and local version of manga list
 * updates each entries when it's needed
 */
export async function processUpdatesToLocal(
    localStorage: LocalStorage,
    localList: SyncManga[],
    remoteList: SyncManga[]
): Promise<SyncManga[]> {
    const localUpdates: SyncManga[] = []
    for (const remoteManga of remoteList) {
        const localManga = localList.find(m => m.key === remoteManga.key)
        if (localManga) {
            if (remoteManga.deleted === syncUtils.DELETED) {
                await localStorage.dispatch("deleteManga", localManga, true)
                continue
            }
            if ((remoteManga.tsOpts ?? 0) > (localManga.tsOpts ?? 0)) {
                if (localManga.read !== remoteManga.read)
                    await localStorage.dispatch("setMangaReadTop", remoteManga, true)
                if (localManga.update !== remoteManga.update)
                    await localStorage.dispatch("setMangaUpdateTop", remoteManga, true)
                if (localManga.display !== remoteManga.display)
                    await localStorage.dispatch("setMangaDisplayMode", remoteManga, true)
                if (localManga.layout !== remoteManga.layout)
                    await localStorage.dispatch("setMangaLayoutMode", remoteManga, true)
                if (localManga.webtoon !== remoteManga.webtoon)
                    await localStorage.dispatch("setMangaWebtoonMode", remoteManga, true)
                if (localManga.zoom !== remoteManga.zoom)
                    await localStorage.dispatch("setMangaZoomMode", remoteManga, true)
                if (localManga.displayName !== remoteManga.displayName)
                    await localStorage.dispatch("setMangaDisplayName", remoteManga, true)
            }
            if (remoteManga.ts > localManga.ts) {
                localStorage.syncLocal(remoteManga)
            }
            localUpdates.push(remoteManga)
        } else {
            if (remoteManga.deleted !== syncUtils.DELETED) {
                localUpdates.push(remoteManga)
                localStorage.syncLocal(remoteManga)
            }
        }
    }
    return localUpdates
}

/**
 * Process updates from local to remote storage
 */
export async function processUpdatesToRemote(
    logger: SyncLogger,
    localList: SyncManga[],
    remoteList: SyncManga[],
    remoteStorage: RemoteStorage
): Promise<SyncManga[]> {
    const remoteUpdates: SyncManga[] = []
    for (const local of localList) {
        if (!shouldSkipSync(local)) {
            const remoteManga = remoteList.find(m => m.key === local.key)
            if (!remoteManga) {
                remoteUpdates.push({ ...local, listChaps: [] })
                continue
            }
            let save = false
            if (remoteManga.ts < local.ts) {
                save = true
                remoteManga.lastChapterReadURL = local.lastChapterReadURL
                remoteManga.lastChapterReadName = local.lastChapterReadName
                remoteManga.ts = local.ts
            }
            if ((remoteManga.tsOpts ?? 0) < (local.tsOpts ?? 0)) {
                save = true
                remoteManga.tsOpts = local.tsOpts
                if (local.read !== remoteManga.read) remoteManga.read = local.read
                if (local.update !== remoteManga.update) remoteManga.update = local.update
                if (local.display !== remoteManga.display) remoteManga.display = local.display
                if (local.layout !== remoteManga.layout) remoteManga.layout = local.layout
                if (local.webtoon !== remoteManga.webtoon) remoteManga.webtoon = local.webtoon
                if (local.zoom !== remoteManga.zoom) remoteManga.zoom = local.zoom
                if (local.displayName !== remoteManga.displayName) remoteManga.displayName = local.displayName
            }
            if (save) remoteUpdates.push({ ...remoteManga, listChaps: [] })
        }
    }
    if (remoteUpdates.length) {
        try {
            if (remoteStorage.isdb) {
                await remoteStorage.saveAll(remoteUpdates)
            } else {
                const updatesMap = new Map(remoteUpdates.map(u => [u.key, u]))
                const updates = remoteList.map(r => {
                    const update = updatesMap.get(r.key)
                    if (update) {
                        updatesMap.delete(r.key)
                        return update
                    }
                    return { ...r, listChaps: [] }
                })
                await remoteStorage.saveAll([...updates, ...Array.from(updatesMap.values())])
            }
        } catch (e) {
            const error = e as Error
            logger.debug(
                `[SYNC-${remoteStorage.constructor.name.replace("Storage", "")}] Failed to sync keys to storage: ${
                    error.message
                }`,
                e
            )
            throw e
        }
    } else {
        logger.debug(`[SYNC-${remoteStorage.constructor.name.replace("Storage", "")}] Nothing to update.`)
    }
    return remoteUpdates
}
