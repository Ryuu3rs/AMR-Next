import browser, { Cookies } from "webextension-polyfill"
import CryptoJS from "crypto-js"
import { debug } from "../core/debug"

export interface LoadOptions {
    /** @deprecated Do not sent content type **/
    nocontenttype?: boolean

    /** true to prevent page to be loaded from cache **/
    nocache?: boolean

    /** true to prevent images in page to be loaded **/
    preventimages?: boolean

    /**
     * @deprecated use method instead
     * true to send message using POST
     **/
    post?: boolean

    method?: "GET" | "PATCH" | "POST" | "DELETE"

    /** data: object to send in accordance with its dataType **/
    data?: Record<string, unknown> | string | URLSearchParams | FormData

    referrer?: string

    crossdomain?: boolean

    headers?: { [k: string]: string }

    credentials?: RequestCredentials

    redirect?: RequestRedirect

    timeoutInMs?: number
}

type StateOptions = Record<string, string | undefined | null | number>

export type JsonOptions = Omit<LoadOptions, "preventimages">

/**
 * Abstract common functionality that needs to handed by the reader
 */
export class MirrorHelper {
    constructor(private options: StateOptions) {}

    crypto = CryptoJS

    /**
     * Loads a page and return an element in which page is loaded
     */
    public async loadPage(url: string, options: LoadOptions = {}): Promise<string> {
        const config = this.getConfig(options)
        const response = await fetch(url, config)

        if (!response.ok) {
            const message = `Failed to load manga list from url ${url}`
            this.logError("loadPage", message, url, config)
            throw new Error(message)
        }

        let text = await response.text()
        if (options.preventimages) {
            text = text.replace(/<img/gi, "<noload")
        }
        return text
    }

    /**
     * This method was really miss used in a lot of places in previous implementations
     * where it was not loading json at all, but instead text....
     */
    public async loadJson(url: string, options?: JsonOptions) {
        const config = this.getConfig(options, { "Content-Type": "application/json" })
        const response = await fetch(url, config)

        if (!response.ok) {
            const message = `Failed to load manga list from url ${url}`
            this.logError("loadJson", message, url, config)
            throw new Error(message)
        }

        // Manually try to parse json as original method
        const data = await response.text()

        try {
            return JSON.parse(data)
        } catch (e) {
            debug.mirrors.error("Failed to parse JSON response:", e)
            return data
        }
    }

    private logError(fn: string, message: string, url: string, config: RequestInit) {
        debug.mirrors.error("MirrorHelper error:", {
            fn,
            message,
            url,
            method: config.method,
            cache: config.cache,
            body: config.body ? config.body.toString() : config.body
        })
    }

    private getConfig(options: LoadOptions = {}, defaultHeaders?: Record<string, string>): RequestInit {
        // In browser extensions, we have host_permissions so we can use 'cors' mode
        // for cross-domain requests. 'no-cors' mode makes responses opaque and unreadable.
        // Don't specify mode at all - let the browser use the default which works with permissions
        return {
            credentials: options.credentials,
            cache: options.nocache ? "no-cache" : "default",
            method: options.post ? "POST" : options.method ?? "GET",
            // mode is intentionally not set - extensions have host_permissions for cross-origin
            headers: this.getDefaultHeaders(options, defaultHeaders),
            body: this.getData(options),
            referrer: options.referrer,
            redirect: options.redirect,
            signal: AbortSignal.timeout(options.timeoutInMs ?? 60000)
        }
    }

    private getData(options: LoadOptions): BodyInit | undefined {
        if (options.data instanceof URLSearchParams) {
            return options.data
        }

        if (options.data instanceof FormData) {
            return options.data
        }

        if (typeof options.data === "object") {
            return JSON.stringify(options.data)
        }

        if (typeof options.data === "string") {
            return options.data
        }

        // In theory should never reach this
        return options.data ? JSON.stringify(options.data) : undefined
    }

    private getDefaultHeaders(options: LoadOptions, defaults: Record<string, string> = {}): Record<string, string> {
        const header = { ...defaults, ...options.headers }

        if (options.data instanceof URLSearchParams) {
            // Must be  application/x-www-form-urlencoded
            header["Content-Type"] = "application/x-www-form-urlencoded"
        } else if (options.nocontenttype) {
            delete header["Content-Type"]
        }

        return header
    }

    /**
     * @TODO Don't think we want to call this or use this anymore
     * @deprecated
     **/
    getVariable(variableName: string, doc: Document) {
        const textDom = doc.getElementById("__amr_text_dom__").innerText
        return this.getVariableFromScript(variableName, textDom)
    }

    /**
     * Extracts a JavaScript variable value from a script string.
     *
     * This function parses JavaScript source code to extract the value of a variable
     * declaration. It supports:
     * - Number literals (e.g., `var x = 42`)
     * - String literals with single or double quotes (e.g., `var x = "hello"`)
     * - Object literals (e.g., `var x = { key: "value" }`)
     * - Array literals (e.g., `var x = [1, 2, 3]`)
     * - JSON.parse() calls (e.g., `var x = JSON.parse('{"key":"value"}')`)
     * - Base64 encoded data via atob() (e.g., `JSON.parse(atob("..."))`)
     *
     * @param varname - The name of the variable to extract (must be a valid JS identifier)
     * @param sc - The script source code to parse
     * @returns The parsed value (number, string, object, or array), or undefined if not found
     * @throws Error if the variable name is invalid or if JSON parsing fails
     *
     * @example
     * // Extract a number
     * getVariableFromScript('pageCount', 'var pageCount = 42;') // returns 42
     *
     * @example
     * // Extract an object
     * getVariableFromScript('config', 'const config = {"pages": [1,2,3]};') // returns {pages: [1,2,3]}
     *
     * @security This function uses regex-based parsing rather than eval() for safety.
     * However, it still parses untrusted input via JSON.parse(), so the caller should
     * handle potential parsing errors.
     */
    public getVariableFromScript = function (varname: string, sc: string): any {
        // Validate variable name to prevent regex injection
        if (!varname || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(varname)) {
            throw new Error(`Invalid variable name: ${varname}`)
        }

        // Validate script input
        if (!sc || typeof sc !== "string") {
            return undefined
        }

        let res: any = undefined

        // Escape special regex characters in variable name (extra safety)
        const escapedVarname = varname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

        const rx = new RegExp(
            "(var|let|const)\\s+" + escapedVarname + "\\s*=\\s*([0-9]+|\\\"|\\'|\\{|\\[|JSON\\s*\\.\\s*parse\\()",
            "gmi"
        )
        const match = rx.exec(sc)

        if (match) {
            const ind = match.index
            const varchar = match[2]
            const start = sc.indexOf(varchar, ind) + 1

            try {
                if (varchar.match(/^[0-9]+$/)) {
                    // Variable is a number literal
                    res = Number(varchar)
                } else if (varchar === '"' || varchar === "'") {
                    // Variable is a string literal
                    res = this.parseStringLiteral(sc, start, varchar)
                } else {
                    // Variable is an object, array, or JSON.parse() call
                    res = this.parseComplexLiteral(sc, start, varchar)
                }
            } catch (error) {
                // Log parsing error but don't throw - return undefined instead
                debug.mirrors.warn(`MirrorHelper Failed to parse variable '${varname}':`, error)
                return undefined
            }
        }

        return res
    }

    /**
     * Parses a string literal from script source, handling escape sequences.
     * @private
     */
    private parseStringLiteral(sc: string, start: number, quoteChar: string): string {
        let found = false
        let curpos = start
        let prevbs = false
        const maxIterations = sc.length - start + 1
        let iterations = 0

        while (!found && iterations < maxIterations) {
            iterations++
            const c = sc.charAt(curpos++)
            if (c === quoteChar && !prevbs) {
                found = true
                break
            }
            prevbs = c === "\\"
        }

        if (!found) {
            throw new Error("Unterminated string literal")
        }

        return sc.substring(start, curpos - 1)
    }

    /**
     * Parses a complex literal (object, array, or JSON.parse call) from script source.
     * @private
     */
    private parseComplexLiteral(sc: string, start: number, varchar: string): any {
        let curpos = start + varchar.length - 1
        let openings = 1
        const opening = varchar.startsWith("JSON") ? "(" : varchar
        const opposite = varchar === "[" ? "]" : varchar === "{" ? "}" : ")"
        const maxIterations = sc.length - curpos + 1
        let iterations = 0

        while (openings > 0 && curpos < sc.length && iterations < maxIterations) {
            iterations++
            const c = sc.charAt(curpos++)
            if (c === opening) openings++
            if (c === opposite) openings--
        }

        if (openings !== 0) {
            throw new Error("Unbalanced brackets in literal")
        }

        let toparse = sc.substring(start - 1 + varchar.length - 1, curpos)

        // Handle base64 encoded data via atob()
        if (toparse.match(/atob\s*\(/g)) {
            const m = /(?:'|").*(?:'|")/g.exec(toparse)
            if (m && m[0]) {
                toparse = atob(m[0].substring(1, m[0].length - 1))
            }
        }

        return JSON.parse(toparse)
    }

    /**
     * Set a cookie on a domain
     */
    async setCookie(setCookieObj: Cookies.SetDetailsType) {
        if (this.options.allowcookies) {
            await browser.cookies.set(setCookieObj)
        }
    }

    async getCookie(details: Cookies.GetDetailsType) {
        if (this.options.allowcookies) {
            return browser.cookies.get(details)
        }
    }

    getOption(option) {
        return this.options[option] || ""
    }

    setOptions(options) {
        this.options = options
    }
}

let instance: MirrorHelper
export const getMirrorHelper = (options: StateOptions) => {
    if (!instance) {
        instance = new MirrorHelper(options)
    }
    return instance
}
