/**
 * SyncManager - Manages synchronization between local and remote storage
 * Refactored from sync-manager.js for better maintainability and TypeScript support
 */
import { ThrottleError } from "../storage/error/ToManyRequests"
import GistStorage from "../storage/gist-storage"
import BrowserStorage from "../storage/browser-storage"
import { createLocalStorage, LocalStorage } from "../storage/local-storage"
import { getAppLogger, AppLogger } from "../../shared/AppLogger"
import { SyncTracker } from "./SyncTracker"
import { processUpdatesToLocal, processUpdatesToRemote, SyncManga } from "./sync-operations"
import {
    deleteMangaFromRemote,
    setToRemote,
    fixLang,
    SyncContext,
    RemoteStorageForActions
} from "./sync-remote-actions"
import { DispatchMethod } from "../../types/action"
import { AppOptions } from "../../shared/OptionStorage"

/**
 * Remote storage interface
 */
export interface RemoteStorage {
    name: string
    isdb: boolean
    interval: number
    retryDate?: Date
    syncInterval?: ReturnType<typeof setInterval>
    getAll(): Promise<SyncManga[]>
    saveAll(mangas: SyncManga[]): Promise<void>
    delete(key: string, value: SyncManga): Promise<void>
    set?(manga: SyncManga): void
}

/**
 * Configuration for sync manager
 */
export interface SyncConfig {
    syncInterval?: number
    syncEnabled?: number
    gistSyncEnabled?: number
    gistSyncGitID?: string
    gistSyncSecret?: string
    [key: string]: unknown
}

/**
 * Vuex store interface (subset used by sync)
 */
interface VuexStore {
    options: AppOptions
}

const storageClasses: Record<string, new (config: Record<string, unknown>) => RemoteStorage> = {
    GistStorage: GistStorage as unknown as new (config: Record<string, unknown>) => RemoteStorage,
    BrowserStorage: BrowserStorage as unknown as new (config: Record<string, unknown>) => RemoteStorage
}

const DEFAULT_CONFIG: SyncConfig = {
    syncInterval: 30 * 1000,
    syncEnabled: 0,
    gistSyncEnabled: 0
}

/**
 * Manages synchronization between local IndexedDB and remote storage (Gist/Browser Sync)
 */
export class SyncManager {
    private config: SyncConfig = DEFAULT_CONFIG
    private vuexStore!: VuexStore
    private localStorage!: LocalStorage
    private dispatch!: DispatchMethod
    private remoteStorages: RemoteStorage[] = []

    constructor(private readonly logger: AppLogger, private readonly syncTracker: SyncTracker) {}

    /**
     * Initialize the sync manager with configuration
     */
    init(config: SyncConfig, vuexStore: VuexStore, dispatch: DispatchMethod): this {
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.vuexStore = vuexStore
        this.localStorage = createLocalStorage(dispatch)
        this.dispatch = dispatch

        // Initialize enabled remote storages
        for (const storageConfig of this.parseStorageConfigs()) {
            if (storageConfig.enabled && !this.hasStorage(storageConfig.name)) {
                const StorageClass = storageClasses[storageConfig.name]
                if (StorageClass) {
                    this.remoteStorages.push(new StorageClass(storageConfig.config))
                }
            }
        }

        return this
    }

    /**
     * Check if a storage type is already registered
     */
    private hasStorage(name: string): boolean {
        return this.remoteStorages.some(s => s.constructor.name === name)
    }

    /**
     * Parse storage configurations from config object
     */
    private parseStorageConfigs(): Array<{ name: string; enabled: boolean; config: Record<string, unknown> }> {
        const configs: Array<{ name: string; enabled: boolean; config: Record<string, unknown> }> = []

        // Find all *syncEnabled or *SyncEnabled keys
        const enabledKeys = Object.keys(this.config).filter(k => k.toLowerCase().includes("syncenabled"))

        for (const enabledKey of enabledKeys) {
            // Extract prefix: "gistSyncEnabled" -> "gist", "syncEnabled" -> ""
            const prefix = enabledKey.replace(/syncEnabled|SyncEnabled/, "")
            const storageName =
                prefix === "" ? "BrowserStorage" : `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}Storage`

            // Collect all config values with this prefix
            const storageConfig: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(this.config)) {
                if (prefix === "" ? key === "syncEnabled" : key.startsWith(prefix)) {
                    storageConfig[key] = value
                }
            }

            configs.push({
                name: storageName,
                enabled: Boolean(this.config[enabledKey]),
                config: storageConfig
            })
        }

        return configs
    }

    /**
     * Start sync intervals for all enabled storages
     */
    async start(): Promise<void> {
        await this.initializeTimestamps()

        for (const storage of this.remoteStorages) {
            // Trigger immediate sync
            this.triggerSync(storage.constructor.name)
            // Set up interval
            storage.syncInterval = setInterval(() => this.triggerSync(storage.constructor.name), storage.interval)
        }
    }

    /**
     * Stop all sync intervals
     */
    stop(): void {
        for (const storage of this.remoteStorages) {
            if (storage.syncInterval) {
                clearInterval(storage.syncInterval)
            }
        }
        this.remoteStorages = []
        this.dispatch("setOption", { key: "isSyncing", value: 0 })
    }

    /**
     * Trigger sync for a specific storage
     */
    async triggerSync(storageName: string): Promise<void> {
        const storage = this.remoteStorages.find(s => s.constructor.name === storageName)
        if (!storage) return

        // Skip if busy
        const { isUpdatingChapterLists, isConverting, isSyncing } = this.vuexStore.options
        if (isUpdatingChapterLists || isConverting || isSyncing) {
            this.logger.debug(`[SYNC-${storage.name}] Skipping sync - busy`)
            return
        }

        // Skip if in retry cooldown
        if (storage.retryDate && storage.retryDate.getTime() > Date.now()) {
            this.logger.debug(
                `[SYNC-${storage.name}] Skipping sync - retry cooldown until ${storage.retryDate.toISOString()}`
            )
            return
        }

        this.logger.debug(`[SYNC-${storage.name}] Starting sync`)
        await this.dispatch("setOption", { key: "isSyncing", value: 1 })

        try {
            const result = await this.performSync(storage)
            this.logger.debug(
                `[SYNC-${storage.name}] Done - incoming: ${result.incoming.length}, outgoing: ${result.outgoing.length}`
            )
        } catch (e) {
            this.handleSyncError(storage, e)
        } finally {
            await this.dispatch("setOption", { key: "isSyncing", value: 0 })
        }
    }

    /**
     * Perform the actual sync operation
     */
    private async performSync(storage: RemoteStorage): Promise<{ incoming: SyncManga[]; outgoing: SyncManga[] }> {
        this.logger.debug(`[SYNC-${storage.name}] Checking sync data`)

        const localList = await this.localStorage.loadMangaList()
        const remoteList = await storage.getAll()

        this.logger.debug(`[SYNC-${storage.name}] Comparing local and remote list`)

        const incoming = await processUpdatesToLocal(this.localStorage, localList, remoteList)
        const outgoing = await processUpdatesToRemote(this.logger, localList, remoteList, storage)

        this.logger.debug(`[SYNC-${storage.name}] Completed sync`)
        return { incoming, outgoing }
    }

    /**
     * Handle sync errors with proper retry logic
     */
    private handleSyncError(storage: RemoteStorage, e: unknown): void {
        this.syncTracker.triggerLastSyncError(e)

        if (e instanceof ThrottleError) {
            storage.retryDate = e.getRetryAfterDate()
        } else if (e instanceof Error) {
            this.logger.error(`[SYNC-${storage.name}] ${e.message}`)
        }
    }

    /**
     * Initialize timestamps for mangas that don't have them
     * This ensures proper sync comparison for older data
     */
    private async initializeTimestamps(): Promise<void> {
        const localList = await this.localStorage.loadMangaList()
        const now = Date.now()

        // Initialize local manga timestamps
        for (const manga of localList) {
            if (typeof manga.tsOpts === "undefined") {
                await this.dispatch("setMangaTsOpts", manga, now)
            }
        }

        // Initialize remote manga timestamps
        for (const storage of this.remoteStorages) {
            await this.initializeRemoteTimestamps(storage, now)
        }
    }

    /**
     * Initialize timestamps for a specific remote storage
     */
    private async initializeRemoteTimestamps(storage: RemoteStorage, timestamp: number): Promise<void> {
        try {
            const remoteList = await storage.getAll()
            let needsUpdate = false

            const updatedList = remoteList.map(manga => {
                if (typeof manga.tsOpts === "undefined") {
                    needsUpdate = true
                    return { ...manga, tsOpts: timestamp }
                }
                return manga
            })

            if (!needsUpdate) {
                this.logger.debug(`[SYNC-${storage.name}] Timestamps already initialized`)
                return
            }

            if (storage.isdb && storage.set) {
                // Browser storage - update individually
                for (const manga of updatedList.filter(m => m.tsOpts === timestamp)) {
                    storage.set(manga)
                }
            } else {
                // Gist storage - batch update
                await storage.saveAll(updatedList)
            }

            this.logger.debug(`[SYNC-${storage.name}] Timestamps initialized`)
        } catch (e) {
            this.handleTimestampInitError(storage, e, timestamp)
        }
    }

    /**
     * Handle errors during timestamp initialization with retry
     */
    private handleTimestampInitError(storage: RemoteStorage, e: unknown, timestamp: number): void {
        this.syncTracker.triggerLastSyncError(e)

        if (e instanceof ThrottleError) {
            storage.retryDate = e.getRetryAfterDate()
            const retryDelay = storage.retryDate.getTime() - Date.now() + 2000

            setTimeout(() => {
                this.initializeRemoteTimestamps(storage, timestamp)
            }, retryDelay)
        } else if (e instanceof Error) {
            this.logger.error(`[SYNC-${storage.name}] ${e.message}`)
        }
    }

    /**
     * Get context object for remote actions
     */
    private getContext(): SyncContext {
        return {
            remoteStorages: this.remoteStorages,
            vuexStore: this.vuexStore,
            syncTracker: this.syncTracker,
            logger: this.logger
        }
    }

    /**
     * Delete a manga from remote storage (marks as deleted for sync)
     */
    async deleteManga(key: string): Promise<void> {
        return deleteMangaFromRemote(this.getContext(), key)
    }

    /**
     * Update a manga property in remote storage
     */
    async setToRemote(localManga: SyncManga, mutatedKey: string, remoteStorage?: RemoteStorage): Promise<void> {
        return setToRemote(this.getContext(), localManga, mutatedKey, remoteStorage)
    }

    /**
     * Fix language keys in remote storage
     */
    async fixLang(payload: Array<{ oldManga: SyncManga; newManga: SyncManga }>): Promise<void> {
        return fixLang(this.getContext(), payload)
    }
}

// Singleton instance
let instance: SyncManager | null = null

/**
 * Get or create the SyncManager singleton
 *
 * @TODO this should be only handled in background alone and interacted through
 * sending background messages, not part of any vuex store methods.
 * VUE App -> browser.runtime.sendMessage -> Background -> Handler -> SyncManager
 */
export function getSyncManager(
    config?: SyncConfig,
    vuexStore?: VuexStore,
    dispatch?: DispatchMethod,
    notificationManager?: unknown
): SyncManager {
    if (!instance) {
        if (!vuexStore) {
            throw new Error("SyncManager not initialized - vuexStore required on first call")
        }
        const appLogger = getAppLogger(vuexStore.options)
        const syncTracker = new SyncTracker(appLogger, vuexStore.options, dispatch!, notificationManager as never)
        instance = new SyncManager(appLogger, syncTracker)
    }

    if (config && vuexStore && dispatch) {
        return instance.init(config, vuexStore, dispatch)
    }

    return instance
}
