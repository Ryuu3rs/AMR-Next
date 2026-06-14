/**
 * LocalStorage - Manages local IndexedDB storage for sync operations
 * Refactored to fix method shadowing issue where dispatch method was overwriting constructor property
 */
import storedb from "../storedb"
import * as syncUtils from "../sync/utils"
import type { SyncManga } from "../sync/sync-operations"

/** IndexedDB interface */
export interface IIndexedDb {
    getMangaList(): Promise<SyncManga[]>
}

/** Dispatch function type */
export type DispatchFn = (action: string, payload: unknown, silent?: boolean) => Promise<unknown>

/**
 * LocalStorage class for managing local IndexedDB storage
 */
export class LocalStorage {
    private indexedDb: IIndexedDb
    private _dispatch: DispatchFn
    private requests: number

    /**
     * Create a new LocalStorage instance
     * @param indexedDb - IndexedDB interface (storedb)
     * @param dispatchFn - Vuex dispatch function
     */
    constructor(indexedDb: IIndexedDb, dispatchFn: DispatchFn) {
        this.indexedDb = indexedDb
        this._dispatch = dispatchFn
        this.requests = 0
    }

    /**
     * Load all mangas from local storage
     * @returns List of manga objects
     */
    async loadMangaList(): Promise<SyncManga[]> {
        return this.indexedDb.getMangaList()
    }

    /**
     * Dispatch an action to the store (with silent flag by default)
     * @param action - Action name
     * @param payload - Action payload
     * @param silent - Whether to skip sync back to remote (default: true)
     */
    dispatch(action: string, payload: unknown, silent = true): Promise<void> {
        return this._dispatch(action, payload, silent) as Promise<void>
    }

    /**
     * Sync a manga from remote to local storage
     * Uses throttling to prevent overwhelming the database
     * @param manga - Manga object to sync
     */
    syncLocal(manga: SyncManga): void {
        this.requests = this.requests + 1
        setTimeout(() => {
            this.requests = this.requests - 1
            // Fixed: was checking manga.delete instead of manga.deleted
            if (manga.deleted === syncUtils.DELETED) {
                this._dispatch("deleteManga", { key: manga.key }, true)
                return
            }
            this._dispatch("readManga", { ...manga, fromSite: 1, isSync: 1 })
        }, this.requests * 500)
    }
}

/**
 * Create a new LocalStorage instance
 * @param dispatch - Vuex dispatch function
 */
export const createLocalStorage = (dispatch: DispatchFn): LocalStorage => new LocalStorage(storedb, dispatch)
