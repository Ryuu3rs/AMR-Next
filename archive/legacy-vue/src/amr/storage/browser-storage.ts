/**
 * Browser sync storage implementation
 * Uses browser.storage.sync API for cross-device synchronization
 */
import browser from "webextension-polyfill"
import { arrayToObject, batchProps, objectMapToArray } from "../../shared/utils"
import { ThrottleError } from "./error/ToManyRequests"
import Storage from "./model-storage"

/** Browser storage limits */
const LIMITS = {
    MAX_ITEMS: 512,
    MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE: 1000000,
    MAX_WRITE_OPERATIONS_PER_HOUR: 1800,
    MAX_WRITE_OPERATIONS_PER_MINUTE: 120,
    QUOTA_BYTES: 102400,
    QUOTA_BYTES_PER_ITEM: 8192
} as const

/** Error messages that indicate throttling */
const ThrottleErrorMessages = Object.keys(LIMITS).filter(k => k.includes("OPERATIONS"))

/** Stored manga data structure */
export interface StoredMangaData {
    key: string
    [key: string]: unknown
}

/** Browser storage configuration */
export interface BrowserStorageConfig {
    // Currently unused but kept for API consistency
}

/**
 * Browser sync storage implementation
 * @link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync
 */
export default class BrowserStorage extends Storage {
    override name = "Browser"
    private storageSync: typeof browser.storage.sync
    private batchSize: number

    constructor(_config?: BrowserStorageConfig) {
        super(true)
        this.storageSync = browser.storage.sync
        this.batchSize = 10
    }

    async remove(keys: string | string[]): Promise<void> {
        await this.wait()
        await this.storageSync.remove(keys)
    }

    async getAll(): Promise<StoredMangaData[]> {
        await this.wait()
        const result = await this.storageSync.get()
        const data = objectMapToArray(result)
        return data.filter((i): i is StoredMangaData => typeof i === "object" && i !== null)
    }

    async save(key: string, value: unknown): Promise<void> {
        await this.wait()
        return this.storageSync.set({ [key]: value }).catch(e => this.handleSyncError(e))
    }

    async delete(key: string, value: unknown): Promise<void> {
        return this.save(key, value)
    }

    async set(data: Record<string, unknown>): Promise<void> {
        if (typeof data === "object") {
            if (Object.keys(data).length > this.batchSize) {
                return this.setInBatches(data)
            }
        }

        try {
            await this.wait()
            await this.storageSync.set(data)
        } catch (e) {
            this.handleSyncError(e as Error)
        }
    }

    async get(key: string | string[]): Promise<Record<string, unknown>> {
        await this.wait()
        return this.storageSync.get(key).catch(e => this.handleSyncError(e))
    }

    saveAll(data: StoredMangaData[] | Record<string, StoredMangaData>): Promise<void> {
        if (Array.isArray(data)) {
            data = arrayToObject(data, "key") as Record<string, StoredMangaData>
        }
        return this.set(data)
    }

    clear(): void {
        this.storageSync.clear()
    }

    getBytesInUse(): void {
        this.storageSync.getBytesInUse()
    }

    private async setInBatches(data: Record<string, unknown>): Promise<void> {
        const batchedKeys = batchProps(data, this.batchSize)
        const promises = batchedKeys.map(async batch => {
            await this.wait()
            return this.storageSync.set(batch)
        })

        await Promise.all(promises).catch(e => this.handleSyncError(e))
    }

    private handleSyncError(e: Error): never {
        if (ThrottleErrorMessages.some(msg => e.message.includes(msg))) {
            // Delay by 30min
            const timestamp = Date.now() + 1800 * 1000
            throw new ThrottleError(e.message, new Date(timestamp))
        }
        throw e
    }
}
