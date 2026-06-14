/**
 * Base storage class for remote storage implementations
 * Provides common functionality for rate limiting and request management
 */

/** Interface for storage implementations */
export interface IStorage {
    name: string
    retryDate: Date
    interval: number
    isdb: boolean
    requests: number
    delay: number
    wait(ms?: number): Promise<void>
    resetRequests(): void
}

/**
 * Base Storage class
 * Extended by GistStorage and BrowserStorage
 */
export default class Storage implements IStorage {
    name = "BaseStorage"
    retryDate: Date
    interval: number
    isdb: boolean
    requests: number
    delay: number

    /**
     * Create a new Storage instance
     * @param isdb - Whether this is a database storage
     * @param interval - Retry interval in milliseconds (default: 30 seconds)
     */
    constructor(isdb: boolean, interval = 30 * 1000) {
        this.retryDate = new Date()
        this.interval = interval
        this.isdb = isdb
        this.requests = 0
        this.delay = 500
    }

    /**
     * Wait for a specified time, incrementing request counter
     * Used for rate limiting
     * @param ms - Base milliseconds to wait (multiplied by request count)
     */
    async wait(ms = 150): Promise<void> {
        this.requests = this.requests + 1
        const time = this.requests * ms
        return new Promise(resolve => {
            setTimeout(() => {
                this.resetRequests()
                resolve()
            }, time)
        })
    }

    /**
     * Decrement the request counter
     */
    resetRequests(): void {
        if (this.requests > 0) this.requests = this.requests - 1
    }
}
