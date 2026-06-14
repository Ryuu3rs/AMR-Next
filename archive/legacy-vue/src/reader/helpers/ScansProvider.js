import { reactive, markRaw, shallowReactive } from "vue"
import EventBus from "./EventBus"
import browser from "webextension-polyfill"
import pageData from "../state/pagedata"
import { debug } from "../../core/debug"

/**
 * ============================================================================
 * MEMORY LEAK PREVENTION - CONSTANTS AND LIMITS
 * ============================================================================
 */

// Polling interval for Firefox MV3 image load detection
const POLL_INTERVAL_MS = 25

// Start polling shortly after src assignment to let native onload fire first
const POLL_START_DELAY_MS = 75

// Maximum polling duration before fallback/error handling
const MAX_POLL_DURATION_MS = 30000

// Maximum number of sync XHR retries per URL
const MAX_SYNC_FETCH_RETRIES = 3

// Timeout for pending image requests (60 seconds)
const PENDING_REQUEST_TIMEOUT_MS = 60000

// Cache for sync fetch results to prevent repeated requests
const syncFetchCache = new Map()

// Maximum cache size to prevent memory growth
const MAX_SYNC_FETCH_CACHE_SIZE = 100

// Track sync fetch retry counts per URL
const syncFetchRetryCounts = new Map()

/**
 * ============================================================================
 * MEMORY LEAK INSTRUMENTATION - DEBUG CODE
 * ============================================================================
 */
const leakCounters = {
    activePolls: 0, // Number of active polling timeouts
    pendingRequests: 0, // Number of pending image requests in Map
    createdImages: 0, // Total HTMLImageElements created
    destroyedImages: 0, // Total HTMLImageElements cleaned up
    portConnections: 0, // Active port connections
    maxActivePolls: 0, // Peak active polls (to detect accumulation)
    syncFetchCalls: 0, // Total sync fetch calls
    pollTimeouts: 0 // Polls that hit the max attempt limit
}

// Expose globally for console access
if (typeof window !== "undefined") {
    window._amrLeakCounters = leakCounters
    window._amrClearCaches = () => {
        syncFetchCache.clear()
        syncFetchRetryCounts.clear()
        console.log("[AMR] Caches cleared")
    }
}

// Log counters periodically (every 10 seconds)
let leakLogInterval = null
function startLeakLogging() {
    if (leakLogInterval) return
    leakLogInterval = setInterval(() => {
        const eventListenerCount = EventBus.listenerCount ? EventBus.listenerCount("check-viewport") : "N/A"
        console.log(
            "[AMR LEAK DEBUG]",
            `polls=${leakCounters.activePolls}/${leakCounters.maxActivePolls}`,
            `pending=${leakCounters.pendingRequests}`,
            `imgs=${leakCounters.createdImages - leakCounters.destroyedImages}`,
            `ports=${leakCounters.portConnections}`,
            `syncFetch=${leakCounters.syncFetchCalls}`,
            `pollTimeouts=${leakCounters.pollTimeouts}`,
            `checkViewportListeners=${eventListenerCount}`
        )
    }, 10000)
}

function stopLeakLogging() {
    if (leakLogInterval) {
        clearInterval(leakLogInterval)
        leakLogInterval = null
    }
}

// Start logging when module loads
startLeakLogging()

/**
 * ============================================================================
 * END MEMORY LEAK INSTRUMENTATION
 * ============================================================================
 */

/**
 * Check if a URL is probably a direct image URL
 * @param {string} url - URL to check
 * @returns {boolean} True if URL appears to be a direct image
 */
function isProbablyImageUrl(url) {
    if (!url || typeof url !== "string") return false
    if (url.startsWith("data:image/")) return true
    if (url.startsWith("blob:")) return true
    return /\.(png|jpg|jpeg|webp|gif|avif)(\?|#|$)/i.test(url)
}

/**
 * Execute a synchronous fetch with caching and retry limits.
 * Returns the response text directly (not a Promise).
 * This works around Firefox MV3 bugs where async callbacks don't fire.
 *
 * FIX #1: Added caching to prevent repeated requests for the same URL
 * FIX #9: Added retry limit to prevent infinite retry loops
 *
 * @param {string} url - URL to fetch
 * @returns {string} Response text
 * @throws {Error} If fetch fails after max retries or URL is blocked
 */
function syncFetch(url) {
    leakCounters.syncFetchCalls++

    // Check cache first to avoid repeated requests
    if (syncFetchCache.has(url)) {
        console.log("[AMR Direct] syncFetch cache HIT for:", url.substring(0, 60))
        return syncFetchCache.get(url)
    }

    // Check retry count to prevent infinite loops
    const retryCount = syncFetchRetryCounts.get(url) || 0
    if (retryCount >= MAX_SYNC_FETCH_RETRIES) {
        console.log("[AMR Direct] syncFetch MAX RETRIES reached for:", url.substring(0, 60))
        throw new Error(`syncFetch max retries (${MAX_SYNC_FETCH_RETRIES}) reached for URL`)
    }
    syncFetchRetryCounts.set(url, retryCount + 1)

    console.log(
        "[AMR Direct] syncFetch for:",
        url.substring(0, 60),
        `(attempt ${retryCount + 1}/${MAX_SYNC_FETCH_RETRIES})`
    )

    try {
        const xhr = new XMLHttpRequest()
        xhr.open("GET", url, false) // false = synchronous (blocking)
        xhr.send()
        console.log("[AMR Direct] syncFetch done, status:", xhr.status, "length:", xhr.responseText?.length)

        if (xhr.status >= 200 && xhr.status < 300) {
            const response = xhr.responseText

            // Cache the successful response
            // Limit cache size to prevent memory growth
            if (syncFetchCache.size >= MAX_SYNC_FETCH_CACHE_SIZE) {
                // Remove oldest entry (first key)
                const firstKey = syncFetchCache.keys().next().value
                syncFetchCache.delete(firstKey)
            }
            syncFetchCache.set(url, response)

            // Clear retry count on success
            syncFetchRetryCounts.delete(url)

            return response
        }
        throw new Error(`syncFetch failed: ${xhr.status}`)
    } catch (e) {
        console.log("[AMR Direct] syncFetch error:", e?.message || e)
        throw e
    }
}

/**
 * Clear sync fetch caches - called during cleanup
 */
function clearSyncFetchCaches() {
    syncFetchCache.clear()
    syncFetchRetryCounts.clear()
}

/**
 * NOTE: syncFetchImageAsBlob was removed because CORS blocks synchronous XHR
 * to image CDNs. The server returns malformed CORS headers ('*, *' instead of '*').
 * Normal <img> tags can load these images, but XHR cannot.
 * We now use img.src + polling instead.
 */

// Helper to yield control back to the event loop between synchronous operations
const yieldToEventLoop = () => new Promise(resolve => setTimeout(resolve, 0))

async function extractMangaFoxImageUrl(pageUrl) {
    try {
        // Skip if already a direct image URL
        if (pageUrl.startsWith("//") || pageUrl.startsWith("https://zjcdn")) {
            console.log("[AMR Direct] Already a direct URL, returning as-is")
            return pageUrl
        }

        console.log("[AMR Direct] Fetching page HTML:", pageUrl.substring(0, 60))

        // Yield before first sync XHR to allow UI to render
        await yieldToEventLoop()

        // Fetch the page HTML using synchronous XHR
        const doc = syncFetch(pageUrl)
        console.log("[AMR Direct] Got page HTML, length:", doc.length)

        // Yield after sync XHR to allow UI to render
        await yieldToEventLoop()

        // Extract the request key from the page
        const keyRegex = /(?:\\'\w{0,1}\\'\+{0,1}){10,}/
        const keyMatch = doc.match(keyRegex)
        let mkey = ""
        if (keyMatch) {
            mkey = keyMatch[0].replace(/[\\'\+]/g, "")
        }
        console.log("[AMR Direct] Extracted key:", mkey ? mkey.substring(0, 20) : "(empty)")

        // Extract variables from the page - look for "var chapterid = 123" pattern
        const getVariable = varname => {
            const pattern = new RegExp(`var\\s+${varname}\\s*=\\s*([0-9]+)`)
            const match = doc.match(pattern)
            return match ? match[1] : null
        }

        const curl = pageUrl.substring(0, pageUrl.lastIndexOf("/") + 1)
        const cid = getVariable("chapterid")
        const curpage = getVariable("imagepage")
        console.log("[AMR Direct] Extracted cid:", cid, "curpage:", curpage)

        if (!cid || !curpage) {
            console.log("[AMR Direct] Failed to extract chapterid or imagepage from HTML")
            // Log a snippet of the HTML to debug
            const scriptMatch = doc.match(/var\s+chapterid[\s\S]{0,200}/)
            console.log("[AMR Direct] Script snippet:", scriptMatch ? scriptMatch[0].substring(0, 100) : "not found")
            return null
        }

        // Build the chapterfun.ashx URL
        const chapfunurl = curl + "chapterfun.ashx"
        const queryParams = new URLSearchParams({ cid, page: curpage, key: mkey })
        const url = `${chapfunurl}?${queryParams}`

        console.log("[AMR Direct] Fetching chapterfun:", url.substring(0, 80))

        // Yield before second sync XHR to allow UI to render
        await yieldToEventLoop()

        // Fetch the encrypted data using synchronous XHR
        const data = syncFetch(url)
        console.log("[AMR Direct] chapterfun data length:", data?.length, "preview:", data?.substring(0, 60))

        // Yield after sync XHR to allow UI to render
        await yieldToEventLoop()

        if (!data) {
            throw new Error("Empty chapterfun response")
        }

        // Unpack the obfuscated JavaScript
        const unpack = function (p, a, c, k, e, d) {
            e = function (c) {
                return (
                    (c < a ? "" : e(parseInt(c / a))) +
                    ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36))
                )
            }
            if (!"".replace(/^/, String)) {
                while (c--) d[e(c)] = k[c] || e(c)
                k = [
                    function (e) {
                        return d[e]
                    }
                ]
                e = function () {
                    return "\\w+"
                }
                c = 1
            }
            while (c--) if (k[c]) p = p.replace(new RegExp("\\b" + e(c) + "\\b", "g"), k[c])
            return p
        }

        // Parse the arguments for the unpack function
        const regexpargs = /'(([^\\']|\\')*)',([0-9]+),([0-9]+),'(([^\\']|\\')*)'/g
        const match = regexpargs.exec(data)
        if (!match) {
            console.log("[AMR Direct] Failed to parse unpack args, data:", data?.substring(0, 100))
            throw new Error("Failed to parse unpack arguments")
        }

        const args = [match[1], parseInt(match[3]), parseInt(match[4]), match[5].split("|"), 0, {}]
        let sc = unpack(...args)
        sc = sc.replace(/\\'/g, "'")
        console.log("[AMR Direct] Unpacked script:", sc?.substring(0, 100))

        // Extract variables from the unpacked script
        const getScriptVariable = (varname, script) => {
            // For arrays like pvalue
            const arrayPattern = new RegExp(`${varname}\\s*=\\s*\\[([^\\]]+)\\]`)
            const arrayMatch = script.match(arrayPattern)
            if (arrayMatch) {
                try {
                    return JSON.parse("[" + arrayMatch[1].replace(/'/g, '"') + "]")
                } catch (e) {
                    console.log("[AMR Direct] Failed to parse array for", varname, ":", e?.message)
                    return null
                }
            }
            // For string values
            const stringPattern = new RegExp(`${varname}\\s*=\\s*["']([^"']+)["']`)
            const stringMatch = script.match(stringPattern)
            return stringMatch ? stringMatch[1] : null
        }

        const extractedCid = getScriptVariable("cid", sc)
        const key = getScriptVariable("key", sc)
        const pix = getScriptVariable("pix", sc)
        const pvalue = getScriptVariable("pvalue", sc)
        console.log(
            "[AMR Direct] Extracted: cid=",
            extractedCid,
            "key=",
            key?.substring?.(0, 10),
            "pix=",
            pix,
            "pvalue=",
            pvalue
        )

        if (!pvalue || !Array.isArray(pvalue) || pvalue.length === 0) {
            throw new Error("Failed to extract pvalue array")
        }

        // Build the final image URL - pvalue[0] already contains the path with token
        // Don't add cid/key again as they're already in the token
        const imageUrl = pix + pvalue[0]
        console.log("[AMR Direct] SUCCESS! Image URL:", imageUrl.substring(0, 80))
        return imageUrl
    } catch (e) {
        console.log("[AMR Direct] Extraction failed:", e?.message || e)
        return null
    }
}

/**
 * Check if a mirror uses MangaFox-style image extraction
 * @param {string} mirrorName - The mirror name
 * @returns {boolean} True if the mirror uses MangaFox-style extraction
 */
function isMangaFoxStyleMirror(mirrorName) {
    const mangaFoxMirrors = ["Manga-Fox", "MangaFox", "Manga-Here", "MangaHere"]
    return mangaFoxMirrors.some(m => mirrorName?.toLowerCase() === m.toLowerCase())
}

/**
 * Global registry for pending image requests
 * Maps requestId -> { resolve, reject } callbacks
 */
const pendingImageRequests = new Map()

/**
 * Clear all pending image requests (called during cleanup)
 * This prevents memory leaks from unresolved Promises
 */
function clearPendingImageRequests() {
    const count = pendingImageRequests.size
    if (count > 0) {
        console.log("[AMR LEAK DEBUG] Clearing", count, "pending image requests")
        // Reject all pending requests to allow Promise cleanup
        for (const [requestId, callbacks] of pendingImageRequests) {
            try {
                callbacks.reject(new Error("Request cancelled during cleanup"))
            } catch (e) {
                // Ignore - just ensuring cleanup
            }
        }
        pendingImageRequests.clear()
        leakCounters.pendingRequests = 0
    }
}

/**
 * Global message listener for image responses from background worker
 * This handles responses sent via tabs.sendMessage
 */
browser.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === "imageResponse" && msg.requestId) {
        console.log("[AMR ScanLoader] onMessage received imageResponse for:", msg.requestId)
        const pending = pendingImageRequests.get(msg.requestId)
        if (pending) {
            pendingImageRequests.delete(msg.requestId)
            leakCounters.pendingRequests = pendingImageRequests.size // Update counter
            if (msg.error) {
                pending.reject(new Error(msg.error))
            } else {
                pending.resolve(msg.result)
            }
        }
    }
    // Return undefined - we don't send a response
    return undefined
})

/**
 * This file handles Scans Loading, (unique scan and all scans from a chapter)
 * and keeps the state of the current chapter scans
 *
 * IMPORTANT: Vue 3 reactivity change from Vue 2:
 * In Vue 2, objects added to a reactive array automatically became reactive.
 * In Vue 3, this is NOT the case - objects must be explicitly made reactive.
 * Each ScanLoader instance is wrapped in reactive() to ensure Vue detects
 * property changes like loading=false.
 */

/** Current chapter's scans state - wrapped in reactive() for Vue 3 */
export const scansProvider = {
    /** Current shared state of scans */
    state: reactive({
        scans: [], // list of scans [{url, loading, error, doublepage, scan HTMLImage}]
        scansMap: new Map(), // URL -> scan object for O(1) lookups
        progress: 0, // percentage (0 - 100) loaded of the whole chapter
        loaded: false, // flag indicating all scans are loaded
        loadedCount: 0 // Counter for loaded scans
    }),

    /** Reference to current ScansLoader to clean up on chapter change */
    _currentLoader: null,

    /**
     * Get a scan by URL with O(1) lookup instead of O(n) find()
     * @param {string} url - The scan URL to look up
     * @returns {ScanLoader|null} The scan object or null if not found
     */
    getScanByUrl(url) {
        return this.state.scansMap.get(url) || null
    },

    /**
     * Rebuild the scansMap from the scans array
     * Called when scans are initialized or modified
     */
    rebuildScansMap() {
        this.state.scansMap.clear()
        for (const scan of this.state.scans) {
            this.state.scansMap.set(scan.url, scan)
        }
    },

    /**
     * Clean up old scans to prevent memory leaks
     * Removes image references and clears event listeners
     *
     * FIX #13: Ensure all caches are cleared
     * FIX #14: Stop leak logging interval when reader closes
     */
    cleanup() {
        console.log("[AMR LEAK DEBUG] scansProvider.cleanup() called, scans:", this.state.scans.length)

        // Clean up old loader callbacks to prevent memory leaks
        if (this._currentLoader) {
            this._currentLoader.onloadchapter = null
            this._currentLoader.onloadscan = null
            this._currentLoader = null
        }

        // Clean up each scan's Image object
        let cleanedImages = 0
        for (const scan of this.state.scans) {
            if (scan.scan) {
                // Remove src to stop any pending loads
                scan.scan.src = ""
                // Null the reference to allow garbage collection
                scan.scan = null
                cleanedImages++
                leakCounters.destroyedImages++
            }
        }
        console.log("[AMR LEAK DEBUG] Cleaned", cleanedImages, "image references")

        // Clear pending image requests to prevent Promise memory leaks
        clearPendingImageRequests()

        // FIX #13: Clear sync fetch caches to free memory
        clearSyncFetchCaches()

        // Clear the arrays/maps - use splice to maintain reactivity
        this.state.scans.splice(0, this.state.scans.length)
        this.state.scansMap.clear()

        // Reset progress counters
        this.state.progress = 0
        this.state.loaded = false
        this.state.loadedCount = 0

        // Log final state
        console.log(
            "[AMR LEAK DEBUG] cleanup complete:",
            `imgs=${leakCounters.createdImages - leakCounters.destroyedImages}`,
            `polls=${leakCounters.activePolls}`,
            `pending=${leakCounters.pendingRequests}`
        )
    },

    /**
     * Full cleanup including stopping the leak logging interval.
     * Call this when the reader is completely closed/destroyed.
     * FIX #14: Ensure interval is stopped to prevent timer accumulation
     */
    destroy() {
        this.cleanup()
        stopLeakLogging()
        console.log("[AMR LEAK DEBUG] scansProvider.destroy() complete - leak logging stopped")
    },

    /**
     * Init current state with a ScansProvider
     * @param {} scp the scans provider to load in current state
     */
    initWithProvider(scp) {
        // Clean up old scans before loading new ones
        this.cleanup()

        // Store reference to current loader for later cleanup
        this._currentLoader = scp

        // Push new scans to maintain reactivity
        this.state.scans.push(...scp.scans)

        // Rebuild the URL -> scan map for O(1) lookups
        this.rebuildScansMap()

        // Track if thin-scan event has already been emitted to avoid repeated emissions
        let thinScanEmitted = false

        // Listen to state change
        scp.onloadchapter = () => {
            EventBus.$emit("chapter-loaded")
        }
        scp.onloadscan = () => {
            /**
             * CRITICAL PERFORMANCE FIX: Use counter instead of reduce()
             * Old code: this.state.scans.reduce((acc, sc) => acc + (sc.loading ? 0 : 1), 0)
             * This iterated ALL scans on EVERY scan load = O(n²) total during chapter load
             * For 100 scans: 100 × 100 = 10,000 iterations
             *
             * New code: Increment counter when scan loads = O(1) per scan = O(n) total
             */
            this.state.loadedCount++
            this.state.progress = Math.floor((this.state.loadedCount / this.state.scans.length) * 100)
            this.state.loaded = this.state.loadedCount === this.state.scans.length
            EventBus.$emit("loaded-scan")
            // Only emit thin-scan ONCE per chapter to prevent repeated event spam
            if (!thinScanEmitted && this.state.scans.some(sc => sc.thinscan)) {
                thinScanEmitted = true
                EventBus.$emit("thin-scan")
            }
        }
        // initialize state with provider values (scans already set above)
        this.state.progress = scp.progress
        this.state.loaded = scp.loaded

        // Initialize loadedCount by counting already-loaded scans
        // This handles cases where scans are pre-loaded or restored from cache
        this.state.loadedCount = this.state.scans.filter(sc => !sc.loading).length

        if (this.state.loaded) {
            if (!thinScanEmitted && this.state.scans.some(sc => sc.thinscan)) {
                thinScanEmitted = true
                EventBus.$emit("thin-scan")
            }
            EventBus.$emit("chapter-loaded")
        }
    },

    /** Initialize state with a whole list of scans urls */
    init(scansUrl, mirror, inorder = false) {
        console.log("[AMR ScansProvider] init() called with", scansUrl?.length, "URLs, mirror:", mirror?.mirrorName)
        if (!scansUrl || scansUrl.length === 0) {
            console.log("[AMR ScansProvider] init() - NO URLs provided, returning early")
            return
        }

        const scp = new ScansLoader(scansUrl, mirror)
        console.log("[AMR ScansProvider] ScansLoader created with", scp.scans.length, "scans")
        this.initWithProvider(scp)
        console.log("[AMR ScansProvider] initWithProvider done, scansMap size:", this.state.scansMap.size)
        scp.load(inorder)
        console.log("[AMR ScansProvider] scp.load() started")
    }
}

/**
 * Create a ScansLoader, which loads scans in background
 */
export const ScansLoader = class {
    constructor(scansUrl, mirror) {
        this.scans = [] // list of scans [{url, loading, error, doublepage, scan HTMLImage}]
        this.loaded = false // top indicating all scans are loaded
        this._isLoading = false // FIX #11: Guard flag to prevent duplicate load calls
        this.onloadchapter = () => {} // function to call when chapter is fully loaded
        this.onloadscan = () => {} // function to call when scan is loaded

        /**
         * Initialize scans - wrap each ScanLoader in shallowReactive() for Vue 3 reactivity.
         * CRITICAL: Use shallowReactive() instead of reactive() to prevent deep Proxy wrapping.
         * We only need reactivity on top-level properties (loading, error, doublepage, etc.),
         * not on nested objects like the HTMLImageElement (this.scan).
         * Combined with markRaw() on the HTMLImageElement, this prevents the catastrophic
         * memory leak caused by Vue 3 trying to make DOM elements reactive.
         */
        this.scans.push(...scansUrl.map(url => shallowReactive(new ScanLoader(url, mirror))))
    }

    /**
     * Load all scans with concurrency limit and priority
     * FIX #11: Added _isLoading guard to prevent duplicate calls
     * @param {boolean} inorder - If true, load strictly in order (1 at a time)
     * @param {number} concurrency - Max concurrent requests (default 6, browser limit)
     * @param {number} startIndex - Starting page index for priority loading (default 0)
     * @param {number} priorityRadius - Number of pages around startIndex to load first (default 2)
     */
    async load(inorder = false, concurrency = 3, startIndex = 0, priorityRadius = 2) {
        // Reduced concurrency from 6 to 3 to reduce UI blocking from synchronous XHR calls
        // FIX #11: Prevent duplicate load calls
        if (this._isLoading) {
            console.log("[AMR ScansLoader] load() already in progress, skipping duplicate call")
            return
        }
        this._isLoading = true

        if (inorder) {
            // Load scans strictly in order (1 at a time)
            for (const sc of this.scans) {
                await sc.load()
                this.onloadscan()
            }
        } else {
            // Priority loading: load pages around the starting position first
            const priorityScans = []
            const remainingScans = []

            // Build priority queue: startIndex ± priorityRadius first
            for (let i = 0; i < this.scans.length; i++) {
                if (i >= startIndex - priorityRadius && i <= startIndex + priorityRadius) {
                    priorityScans.push(this.scans[i])
                } else {
                    remainingScans.push(this.scans[i])
                }
            }

            // Combined queue: priority scans first, then remaining
            const queue = [...priorityScans, ...remainingScans]

            // Helper to yield control back to the event loop
            // This prevents synchronous XHR from completely blocking the UI
            const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0))

            // Use Promise-based concurrency with UI yielding
            const loadWithConcurrency = async () => {
                const executing = new Set()
                let loadedCount = 0

                for (const scan of queue) {
                    // Yield to UI every few scans to allow rendering
                    // This is critical because syncFetch blocks the main thread
                    if (loadedCount > 0 && loadedCount % 2 === 0) {
                        await yieldToUI()
                    }

                    // Start loading this scan
                    const promise = (async () => {
                        try {
                            await scan.load()
                            this.onloadscan()
                        } catch (e) {
                            debug.scans.error("Scan load error:", e)
                        }
                    })()

                    executing.add(promise)
                    promise.finally(() => {
                        executing.delete(promise)
                        loadedCount++
                    })

                    // If we've hit the concurrency limit, wait for one to finish
                    if (executing.size >= concurrency) {
                        await Promise.race(executing)
                    }
                }

                // Wait for all remaining loads to complete
                if (executing.size > 0) {
                    await Promise.all(executing)
                }
            }

            // Add timeout to prevent infinite hanging
            const timeoutMs = 5 * 60 * 1000 // 5 minutes
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error("ScansLoader timeout after 5 minutes")), timeoutMs)
            })

            try {
                await Promise.race([loadWithConcurrency(), timeoutPromise])
            } catch (e) {
                debug.scans.error("ScansLoader:", e.message)
            }
        }
        this.loaded = true
        this._isLoading = false // Reset loading flag
        this.onloadchapter()
    }
}

/**
 * Handle a scan load, keeps original Image object to clone to insert scan somewhere
 */
class ScanLoader {
    /**
     * Build the scan initial state
     * @param url {string}
     * @param mirror {{ mirrorName: string }}
     */
    constructor(url, mirror) {
        this.mirror = mirror
        this.url = url
        this.loading = true
        this.error = false
        this.doublepage = false
        this.thinscan = false

        /**
         * Image containing the loaded scan, will be cloned to be displayed.
         * Use markRaw() to prevent Vue 3 from wrapping the HTMLImageElement
         * in a reactive Proxy.
         */
        this.scan = markRaw(document.createElement("img"))

        this.retried = false

        // LEAK INSTRUMENTATION: Track image creation
        leakCounters.createdImages++
    }

    /** Loads the scan */
    load() {
        this.loading = true
        this.error = false
        console.log("[AMR ScanLoader] load() starting for:", this.url?.substring(0, 60))
        debug.scans.debug("ScanLoader.load() starting for:", this.url?.substring(0, 60))

        return new Promise(async resolve => {
            let done = false
            let pollAttempts = 0
            const pollStartMs = Date.now()
            let imgLoadTimeoutId = null

            const clearImgTimeout = () => {
                if (imgLoadTimeoutId) {
                    clearTimeout(imgLoadTimeoutId)
                    imgLoadTimeoutId = null
                    // LEAK INSTRUMENTATION: Track poll cleanup
                    if (leakCounters.activePolls > 0) {
                        leakCounters.activePolls--
                    }
                }
            }

            const scheduleNextPoll = (delayMs = POLL_INTERVAL_MS) => {
                // LEAK INSTRUMENTATION: Track active timers
                leakCounters.activePolls++
                if (leakCounters.activePolls > leakCounters.maxActivePolls) {
                    leakCounters.maxActivePolls = leakCounters.activePolls
                }

                imgLoadTimeoutId = setTimeout(() => {
                    // Timer has fired; it is no longer active
                    if (leakCounters.activePolls > 0) {
                        leakCounters.activePolls--
                    }
                    imgLoadTimeoutId = null
                    pollImageComplete()
                }, delayMs)
            }

            const markDone = () => {
                if (done) return false
                done = true
                clearImgTimeout()
                return true
            }

            const finalizeLoaded = source => {
                if (!markDone()) return
                const img = this.scan
                if (!img) return

                // Check if scan is double page
                if (img.width > img.height) {
                    this.doublepage = true
                }
                if (img.height >= 3 * img.width) {
                    this.thinscan = true
                }

                this.loading = false
                this.error = false
                console.log(`[AMR ScanLoader] loading set to FALSE (${source}) for:`, this.url?.substring(0, 60))
                debug.scans.trace(`ScanLoader.loading set to false (${source}) for:`, this.url?.substring(0, 60))
                resolve()
            }

            // Use once: true to prevent listener accumulation on retries
            this.scan.addEventListener(
                "load",
                () => {
                    console.log("[AMR ScanLoader] IMAGE LOADED successfully:", this.url?.substring(0, 60))
                    debug.scans.debug("ScanLoader image loaded successfully:", this.url?.substring(0, 60))
                    finalizeLoaded("onload")
                },
                { once: true }
            )

            const manageError = e => {
                if (!markDone()) return
                console.log("[AMR ScanLoader] IMAGE ERROR:", e?.message || e, "for:", this.url?.substring(0, 60))
                debug.scans.error("ScanLoader error loading image", e?.message || e)
                this.loading = false
                this.error = true
                resolve()
            }

            this.scan.addEventListener("error", manageError, { once: true })

            try {
                // Check if mirror is valid before sending message
                if (!this.mirror || !this.mirror.mirrorName) {
                    console.log("[AMR ScanLoader] ERROR - mirror not available:", this.mirror)
                    debug.scans.error("ScanLoader - mirror not available:", this.mirror)
                    manageError(new Error("Mirror not available"))
                    return
                }

                console.log(
                    "[AMR ScanLoader] sending getImageUrlFromPageUrl for:",
                    this.url?.substring(0, 60),
                    "mirror:",
                    this.mirror.mirrorName
                )

                // For MangaFox-style mirrors, try direct extraction first (bypasses broken Firefox MV3 messaging)
                let imageUrl
                if (isMangaFoxStyleMirror(this.mirror.mirrorName)) {
                    console.log("[AMR ScanLoader] Using DIRECT extraction for MangaFox-style mirror...")
                    imageUrl = await extractMangaFoxImageUrl(this.url)
                    if (imageUrl) {
                        console.log("[AMR ScanLoader] Direct extraction succeeded:", imageUrl?.substring?.(0, 80))
                    }
                }

                // Fallback to Port-based messaging if direct extraction failed or not a MangaFox mirror
                if (!imageUrl) {
                    try {
                        debug.scans.trace("ScanLoader awaiting getImageUrlFromPageUrl for:", this.url?.substring(0, 60))
                        console.log("[AMR ScanLoader] using Port + onMessage dual approach...")

                        // Generate unique request ID
                        const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

                        imageUrl = await new Promise((resolve, reject) => {
                            let resolved = false
                            let port = null
                            let timeoutId = null

                            const doResolve = result => {
                                if (resolved) return
                                resolved = true
                                cleanup()
                                resolve(result)
                            }

                            const doReject = error => {
                                if (resolved) return
                                resolved = true
                                cleanup()
                                reject(error)
                            }

                            const cleanup = () => {
                                // Remove from pending requests
                                pendingImageRequests.delete(requestId)
                                // LEAK INSTRUMENTATION: Update pending count
                                leakCounters.pendingRequests = pendingImageRequests.size
                                if (timeoutId) {
                                    clearTimeout(timeoutId)
                                    timeoutId = null
                                }
                                if (port) {
                                    try {
                                        port.disconnect()
                                        // LEAK INSTRUMENTATION: Track port cleanup
                                        if (leakCounters.portConnections > 0) {
                                            leakCounters.portConnections--
                                        }
                                    } catch (e) {
                                        // Port already disconnected
                                    }
                                    port = null
                                }
                            }

                            // Register in global pending requests for tabs.sendMessage responses
                            pendingImageRequests.set(requestId, {
                                resolve: result => {
                                    console.log("[AMR ScanLoader] onMessage resolved:", requestId)
                                    doResolve(result)
                                },
                                reject: error => {
                                    console.log("[AMR ScanLoader] onMessage rejected:", requestId)
                                    doReject(error)
                                }
                            })
                            // LEAK INSTRUMENTATION: Track pending requests
                            leakCounters.pendingRequests = pendingImageRequests.size

                            try {
                                // Create a persistent Port connection to the background worker
                                port = browser.runtime.connect({ name: `imageRequest_${requestId}` })
                                // LEAK INSTRUMENTATION: Track port connections
                                leakCounters.portConnections++
                                console.log("[AMR ScanLoader] Port connected for requestId:", requestId)

                                // Listen for response on the port
                                port.onMessage.addListener(msg => {
                                    if (resolved) return
                                    console.log("[AMR ScanLoader] Port received message:", msg?.type, msg?.requestId)

                                    if (msg.type === "imageResponse" && msg.requestId === requestId) {
                                        if (msg.error) {
                                            console.log("[AMR ScanLoader] Port received error:", msg.error)
                                            doReject(new Error(msg.error))
                                        } else {
                                            console.log(
                                                "[AMR ScanLoader] Port received result:",
                                                msg.result?.substring?.(0, 80) || msg.result
                                            )
                                            doResolve(msg.result)
                                        }
                                    }
                                })

                                // FIX #8: Handle port disconnect with proper error checking
                                // If browser.runtime.lastError exists, it means an error occurred
                                port.onDisconnect.addListener(() => {
                                    const error = browser.runtime.lastError
                                    console.log(
                                        "[AMR ScanLoader] Port disconnected for:",
                                        requestId,
                                        error ? `Error: ${error.message}` : "(normal)"
                                    )
                                    // If there's an error and we haven't resolved yet, check if we should reject
                                    // Wait for onMessage first, unless there's a specific error
                                    if (error && !resolved) {
                                        // Reduce port connections counter since port is now disconnected
                                        if (leakCounters.portConnections > 0) {
                                            leakCounters.portConnections--
                                        }
                                        port = null // Prevent double disconnect in cleanup
                                    }
                                })

                                // FIX #7: Set timeout to prevent stale requests from accumulating
                                // Uses PENDING_REQUEST_TIMEOUT_MS constant (60 seconds)
                                timeoutId = setTimeout(() => {
                                    console.log(
                                        "[AMR ScanLoader] TIMEOUT for requestId:",
                                        requestId,
                                        "after",
                                        PENDING_REQUEST_TIMEOUT_MS,
                                        "ms"
                                    )
                                    doReject(
                                        new Error(
                                            `getImageUrlFromPageUrl timeout after ${PENDING_REQUEST_TIMEOUT_MS}ms`
                                        )
                                    )
                                }, PENDING_REQUEST_TIMEOUT_MS)

                                // Send request through the port
                                const msg = {
                                    type: "getImageUrlFromPageUrl",
                                    requestId: requestId,
                                    url: this.url,
                                    mirror: this.mirror.mirrorName,
                                    language: pageData.state.language
                                }

                                port.postMessage(msg)
                                console.log("[AMR ScanLoader] Port sent request for:", requestId)
                            } catch (err) {
                                console.log("[AMR ScanLoader] Port connection failed:", err?.message || err)
                                doReject(err)
                            }
                        })

                        console.log("[AMR ScanLoader] received imageUrl:", imageUrl?.substring?.(0, 80) || imageUrl)
                        debug.scans.debug("ScanLoader received imageUrl:", imageUrl?.substring?.(0, 80) || imageUrl)
                    } catch (e) {
                        console.log("[AMR ScanLoader] getImageUrlFromPageUrl FAILED:", e?.message || e)
                        debug.scans.warn("ScanLoader getImageUrlFromPageUrl failed:", e?.message || e)
                        // Fallback: if the original URL is already an image URL, try loading it directly
                        if (isProbablyImageUrl(this.url)) {
                            console.log("[AMR ScanLoader] using original URL as fallback")
                            debug.scans.debug("ScanLoader using original URL as fallback (isProbablyImageUrl)")
                            imageUrl = this.url
                        } else {
                            manageError(e)
                            return
                        }
                    }
                } // end if (!imageUrl)

                // Check if we got a valid image URL
                if (!imageUrl || imageUrl === "error" || imageUrl === "null") {
                    debug.scans.debug("ScanLoader imageUrl is invalid:", imageUrl)
                    // Fallback: some mirrors already provide direct image URLs as the page URL
                    if (isProbablyImageUrl(this.url)) {
                        debug.scans.debug("ScanLoader using original URL as fallback (isProbablyImageUrl)")
                        imageUrl = this.url
                    } else {
                        manageError(new Error("Failed to get image URL from mirror"))
                        return
                    }
                }

                // Normalize protocol-relative URLs (starting with //) to use https://
                if (imageUrl.startsWith("//")) {
                    imageUrl = "https:" + imageUrl
                }

                debug.scans.debug("ScanLoader setting img.src to:", imageUrl?.substring?.(0, 80))
                console.log("[AMR ScanLoader] Setting img.src to:", imageUrl?.substring?.(0, 80))

                // Set the image source
                this.scan.src = imageUrl

                // Firefox MV3 bug: img.onload callbacks don't fire reliably
                // Use polling as a secondary detection path (hybrid approach)
                const maxPollAttempts = Math.ceil(MAX_POLL_DURATION_MS / POLL_INTERVAL_MS)

                const pollImageComplete = () => {
                    pollAttempts++
                    const elapsedMs = Date.now() - pollStartMs

                    // If native callback path worked first, stop immediately
                    if (done) {
                        return
                    }

                    if (this.scan.complete && this.scan.naturalWidth > 0) {
                        console.log("[AMR ScanLoader] IMAGE COMPLETE (polled):", this.url?.substring(0, 60))
                        finalizeLoaded("polled")
                        return
                    }

                    // Keep polling while under timeout budget
                    if (elapsedMs < MAX_POLL_DURATION_MS) {
                        scheduleNextPoll(POLL_INTERVAL_MS)
                        return
                    }

                    // Final timeout handling
                    if (this.scan.currentSrc || this.scan.src) {
                        // Fail-open fallback: avoid infinite spinner when Firefox misses callbacks
                        console.log(
                            "[AMR ScanLoader] POLL TIMEOUT fallback after",
                            elapsedMs,
                            "ms (assume loaded) for:",
                            this.url?.substring(0, 60)
                        )
                        finalizeLoaded("timeout-fallback")
                    } else {
                        console.log(
                            "[AMR ScanLoader] POLL TIMEOUT error after",
                            elapsedMs,
                            "ms for:",
                            this.url?.substring(0, 60)
                        )
                        leakCounters.pollTimeouts++
                        manageError(
                            new Error(
                                `Image polling timeout after ${maxPollAttempts} attempts (${MAX_POLL_DURATION_MS}ms)`
                            )
                        )
                    }
                }

                // Start polling after a short delay to allow the load event to fire first
                scheduleNextPoll(POLL_START_DELAY_MS)
            } catch (e) {
                debug.scans.error("ScanLoader exception during load", e?.message || e)
                manageError(e)
            }
        })
    }
}
