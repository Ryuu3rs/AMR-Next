import type { ZodType } from "zod"
import { SourceError, SourceRequestError } from "./errors"
import type { SourceRequestClient, SourceRequestOptions } from "./types"

export type FetchResponse = {
    ok: boolean
    status: number
    text(): Promise<string>
}

export type FetchFunction = (
    url: string,
    init: {
        headers?: Readonly<Record<string, string>>
        method: "GET" | "POST"
        body?: string
        signal: AbortSignal
        credentials?: "include" | "same-origin" | "omit"
    }
) => Promise<FetchResponse>

export type BoundedRequestClientOptions = {
    fetch: FetchFunction
    allowedOrigins: readonly string[]
    maxRequests: number
    maxResponseBytes: number
    timeoutMs: number
    // Optional per-client rate limit. Spacing = intervalMs / requests between
    // consecutive requests. Omit to disable (default).
    rateLimit?: { requests: number; intervalMs: number }
    // Transient-failure retries (timeouts, network errors, 429, 5xx). Default 2.
    maxRetries?: number
    // Base backoff in ms; grows exponentially per attempt with jitter. Default 300.
    retryBaseDelayMs?: number
    // Injectable for tests so backoff/rate-limit waits are instant.
    sleep?: (ms: number) => Promise<void>
    random?: () => number
}

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

function isRetryable(error: unknown): boolean {
    if (error instanceof SourceRequestError) {
        const status = error.status
        return status === undefined || status === 429 || (status >= 500 && status <= 599)
    }
    return false
}

export function createBoundedRequestClient(options: BoundedRequestClientOptions): SourceRequestClient {
    const allowedOrigins = new Set(options.allowedOrigins.map(origin => new URL(origin).origin))
    const maxRetries = options.maxRetries ?? 2
    const retryBaseDelayMs = options.retryBaseDelayMs ?? 300
    const sleep = options.sleep ?? defaultSleep
    const random = options.random ?? Math.random
    const minIntervalMs =
        options.rateLimit && options.rateLimit.requests > 0
            ? options.rateLimit.intervalMs / options.rateLimit.requests
            : 0

    let requestCount = 0
    let nextAllowedAt = 0

    async function waitForRateSlot(): Promise<void> {
        if (minIntervalMs <= 0) return
        const now = Date.now()
        const wait = Math.max(0, nextAllowedAt - now)
        nextAllowedAt = Math.max(now, nextAllowedAt) + minIntervalMs
        if (wait > 0) await sleep(wait)
    }

    async function attemptOnce(
        url: URL,
        init: { method: "GET" | "POST"; headers?: Readonly<Record<string, string>>; body?: string }
    ): Promise<string> {
        if (requestCount >= options.maxRequests) {
            throw new SourceError("request-limit", `Request limit of ${options.maxRequests} exceeded`)
        }
        requestCount += 1
        await waitForRateSlot()

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
        try {
            const response = await options.fetch(url.toString(), {
                method: init.method,
                signal: controller.signal,
                credentials: "include",
                ...(init.body === undefined ? {} : { body: init.body }),
                ...(init.headers === undefined ? {} : { headers: init.headers })
            })
            const body = await response.text()
            const bodySize = new TextEncoder().encode(body).byteLength

            if (bodySize > options.maxResponseBytes) {
                throw new SourceError("request-limit", `Response exceeded ${options.maxResponseBytes} bytes`, {
                    url: url.toString(),
                    bodySize
                })
            }
            if (!response.ok) {
                throw new SourceRequestError(`Request failed with status ${response.status}`, response.status, {
                    url: url.toString()
                })
            }
            return body
        } catch (error) {
            if (error instanceof SourceError) throw error
            if (controller.signal.aborted) {
                throw new SourceRequestError(`Request timed out after ${options.timeoutMs}ms`, undefined, {
                    url: url.toString()
                })
            }
            throw new SourceRequestError("Request failed", undefined, {
                url: url.toString(),
                cause: String(error)
            })
        } finally {
            clearTimeout(timeout)
        }
    }

    async function requestText(
        url: URL,
        init: { method: "GET" | "POST"; headers?: Readonly<Record<string, string>>; body?: string }
    ): Promise<string> {
        if (!allowedOrigins.has(url.origin)) {
            throw new SourceError("invalid-input", `Request origin is not allowed: ${url.origin}`)
        }
        let attempt = 0
        for (;;) {
            try {
                return await attemptOnce(url, init)
            } catch (error) {
                if (attempt >= maxRetries || !isRetryable(error)) throw error
                const backoff = retryBaseDelayMs * 2 ** attempt + Math.floor(random() * retryBaseDelayMs)
                attempt += 1
                await sleep(backoff)
            }
        }
    }

    return {
        async getJson<T>(url: URL, schema: ZodType<T>, requestOptions?: SourceRequestOptions): Promise<T> {
            const body = await requestText(url, {
                method: "GET",
                ...(requestOptions?.headers === undefined ? {} : { headers: requestOptions.headers })
            })
            let json: unknown
            try {
                json = JSON.parse(body)
            } catch (error) {
                throw new SourceError("invalid-response", "Response was not valid JSON", {
                    url: url.toString(),
                    cause: String(error)
                })
            }
            const result = schema.safeParse(json)
            if (!result.success) {
                throw new SourceError("invalid-response", "Response did not match the expected schema", {
                    url: url.toString(),
                    issues: result.error.issues
                })
            }
            return result.data
        },

        async getText(url: URL, requestOptions?: SourceRequestOptions): Promise<string> {
            return requestText(url, {
                method: "GET",
                ...(requestOptions?.headers === undefined ? {} : { headers: requestOptions.headers })
            })
        },

        async postForm(
            url: URL,
            params: Record<string, string>,
            requestOptions?: SourceRequestOptions
        ): Promise<string> {
            return requestText(url, {
                method: "POST",
                body: new URLSearchParams(params).toString(),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    ...(requestOptions?.headers ?? {})
                }
            })
        }
    }
}
