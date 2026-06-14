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
}

export function createBoundedRequestClient(options: BoundedRequestClientOptions): SourceRequestClient {
    const allowedOrigins = new Set(options.allowedOrigins.map(origin => new URL(origin).origin))
    let requestCount = 0

    async function fetchText(url: URL, requestOptions?: SourceRequestOptions): Promise<string> {
        if (!allowedOrigins.has(url.origin)) {
            throw new SourceError("invalid-input", `Request origin is not allowed: ${url.origin}`)
        }
        if (requestCount >= options.maxRequests) {
            throw new SourceError("request-limit", `Request limit of ${options.maxRequests} exceeded`)
        }
        requestCount += 1

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs)

        try {
            const response = await options.fetch(url.toString(), {
                method: "GET",
                signal: controller.signal,
                credentials: "include",
                ...(requestOptions?.headers === undefined ? {} : { headers: requestOptions.headers })
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
            if (error instanceof SourceError) {
                throw error
            }
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

    return {
        async getJson<T>(url: URL, schema: ZodType<T>, requestOptions?: SourceRequestOptions): Promise<T> {
            if (!allowedOrigins.has(url.origin)) {
                throw new SourceError("invalid-input", `Request origin is not allowed: ${url.origin}`)
            }
            if (requestCount >= options.maxRequests) {
                throw new SourceError("request-limit", `Request limit of ${options.maxRequests} exceeded`)
            }
            requestCount += 1

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), options.timeoutMs)

            try {
                const response = await options.fetch(url.toString(), {
                    method: "GET",
                    signal: controller.signal,
                    ...(requestOptions?.headers === undefined ? {} : { headers: requestOptions.headers })
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
            } catch (error) {
                if (error instanceof SourceError) {
                    throw error
                }
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
        },

        getText: fetchText,

        async postForm(
            url: URL,
            params: Record<string, string>,
            requestOptions?: SourceRequestOptions
        ): Promise<string> {
            if (!allowedOrigins.has(url.origin)) {
                throw new SourceError("invalid-input", `Request origin is not allowed: ${url.origin}`)
            }
            if (requestCount >= options.maxRequests) {
                throw new SourceError("request-limit", `Request limit of ${options.maxRequests} exceeded`)
            }
            requestCount += 1

            const body = new URLSearchParams(params).toString()
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), options.timeoutMs)

            try {
                const response = await options.fetch(url.toString(), {
                    method: "POST",
                    body,
                    signal: controller.signal,
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        ...(requestOptions?.headers ?? {})
                    }
                })
                const text = await response.text()
                const bodySize = new TextEncoder().encode(text).byteLength
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
                return text
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
    }
}
