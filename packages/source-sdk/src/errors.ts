export type SourceErrorCode =
    | "invalid-input"
    | "invalid-response"
    | "not-found"
    | "request-failed"
    | "request-limit"
    | "unsupported-url"

export class SourceError extends Error {
    readonly code: SourceErrorCode
    readonly details?: Readonly<Record<string, unknown>>

    constructor(code: SourceErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
        super(message)
        this.name = "SourceError"
        this.code = code
        if (details !== undefined) {
            this.details = details
        }
    }
}

export class SourceRequestError extends SourceError {
    readonly status?: number

    constructor(message: string, status?: number, details?: Readonly<Record<string, unknown>>) {
        super(status === 404 ? "not-found" : "request-failed", message, details)
        this.name = "SourceRequestError"
        if (status !== undefined) {
            this.status = status
        }
    }
}
