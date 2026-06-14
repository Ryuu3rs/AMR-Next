/**
 * Error thrown when rate limiting is triggered
 * Contains information about when to retry
 */
export class ThrottleError extends Error {
    name = "ThrottleError" as const
    retryAfter: Date

    /**
     * Create a new ThrottleError
     * @param message - Error message
     * @param retryAfter - Date or timestamp when retry is allowed
     */
    constructor(message: string, retryAfter: Date | number | string) {
        super(message)
        this.retryAfter = new Date(retryAfter)
    }

    /**
     * Get the date when retry is allowed
     * @returns Date when retry is allowed
     */
    getRetryAfterDate(): Date {
        return this.retryAfter
    }
}
