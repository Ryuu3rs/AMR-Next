// Side-effect-only import, deliberately first: @amr/contracts/src/domain.ts's
// disableZodEvalProbe() disables zod's eval capability probe (which otherwise
// trips a CSP console warning under MV3's `script-src 'self'`) and runs once
// at that module's own top level, as a side effect of importing it - no call
// needed here. Declaring the import first guarantees @amr/contracts evaluates
// before @amr/sources (imported next) constructs its own schemas - see
// packages/sources/src/mangadex.ts, which builds zod schemas without
// importing @amr/contracts. Per ES module evaluation order, a module's
// *imports* (unlike its own plain statements) always evaluate before any
// subsequent sibling import, so import declaration order is what matters.
import "@amr/contracts"
import { sourceRegistry } from "@amr/sources"
import { runtimeRequestSchema, type RuntimeRequest } from "../src/runtime"
import { SOURCE_ORIGINS } from "../src/permissions"
import { findSource, searchMangaStreaming } from "../src/sources"
import { success, failure, type HandlerContext } from "../src/background/handler-types"
import { captureChapter } from "../src/background/capture"
import { isInternalTab } from "../src/background/tab-fetch"
import { injectChapterPrompt } from "../src/background/inject-chapter-prompt"
import {
    updateAlarmName,
    communityAlarmName,
    syncAlarmName,
    extensionUpdateAlarmName,
    EXTENSION_UPDATE_INTERVAL_HOURS,
    configureUpdateAlarm,
    configureSyncAlarm,
    configureCommunityAlarm
} from "../src/background/alarms"
import { checkUpdates, checkExtensionUpdate, backfillMangaGenres } from "../src/handlers/updates-sources"
import { runCommunitySync } from "../src/handlers/community"
import { autoPush } from "../src/handlers/data-sync-settings"
import { handlers } from "../src/background/dispatch"
import { MUTATION_SCOPES } from "../src/background/mutation-scopes"
import { publishLive } from "../src/live"

export default defineBackground(() => {
    browser.runtime.onInstalled.addListener(() => {
        void configureUpdateAlarm()
        void configureSyncAlarm()
        void configureCommunityAlarm()
        void browser.alarms.create(extensionUpdateAlarmName, {
            periodInMinutes: EXTENSION_UPDATE_INTERVAL_HOURS * 60
        })
        // force=true: bypass 24h throttle and clear stale banner on every install/update
        void checkExtensionUpdate(true)
        void backfillMangaGenres()
    })

    // Re-arm alarms on browser startup in case they were cleared (profile wipe,
    // browser crash, edge-case alarm storage corruption). onInstalled only fires
    // on install/update, so without this, a lost alarm silently breaks until the
    // next extension update.
    browser.runtime.onStartup.addListener(() => {
        void configureUpdateAlarm()
        void configureSyncAlarm()
        void configureCommunityAlarm()
        void browser.alarms.create(extensionUpdateAlarmName, {
            periodInMinutes: EXTENSION_UPDATE_INTERVAL_HOURS * 60
        })
        void checkExtensionUpdate()
        void backfillMangaGenres()
    })

    browser.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === updateAlarmName) void checkUpdates()
        if (alarm.name === communityAlarmName) void runCommunitySync()
        if (alarm.name === syncAlarmName) void autoPush()
        if (alarm.name === extensionUpdateAlarmName) void checkExtensionUpdate()
    })

    const onUpdatedHandler = (
        tabId: number,
        changeInfo: { url?: string; status?: string },
        tab: { url?: string | undefined }
    ) => {
        if (changeInfo.url && !isInternalTab(tabId)) {
            void captureChapter(changeInfo.url).catch(error => {
                console.warn("[AMR] Automatic chapter capture failed", error)
            })
        }
        if (changeInfo.status === "complete" && tab.url) {
            let parsedUrl: URL
            try {
                parsedUrl = new URL(tab.url)
            } catch {
                return
            }
            const source = findSource(parsedUrl)
            if (source?.match(parsedUrl) === "chapter") {
                void browser.scripting
                    .executeScript({ target: { tabId }, func: injectChapterPrompt, args: [tab.url] })
                    .catch(() => {})
            }
        }
    }
    // Chrome does not support URL filters on tabs.onUpdated - Firefox does.
    // Unfiltered onUpdated is noisier but safe; captureChapter ignores non-source URLs internally.
    if (import.meta.env.BROWSER === "firefox") {
        // @ts-expect-error Firefox-only URL filter not in webextension-polyfill types
        browser.tabs.onUpdated.addListener(onUpdatedHandler, { urls: [...SOURCE_ORIGINS] })
    } else {
        browser.tabs.onUpdated.addListener(onUpdatedHandler)
    }

    // Streaming search via long-lived port so the UI can show results per-source
    // as each adapter settles instead of waiting for all to finish.
    browser.runtime.onConnect.addListener(port => {
        if (port.name !== "search-stream") return
        port.onMessage.addListener((msg: { type: string; query: string }) => {
            if (msg.type !== "manga:search" || !msg.query) return
            const searchable = sourceRegistry.list().filter(a => !!a.search)
            port.postMessage({ type: "start", total: searchable.length })
            searchMangaStreaming(
                msg.query,
                (results, sourceId) => {
                    try {
                        port.postMessage({ type: "partial", results, sourceId })
                    } catch {
                        // port may have disconnected
                    }
                },
                () => {
                    try {
                        port.postMessage({ type: "done" })
                    } catch {
                        // port may have disconnected
                    }
                }
            )
        })
    })

    browser.runtime.onMessage.addListener((message, sender) => {
        return (async () => {
            try {
                const request = runtimeRequestSchema.parse(message)
                const handler = handlers[request.type]
                const ctx: HandlerContext = { sender }
                const data = await (handler as (r: RuntimeRequest, c: HandlerContext) => Promise<unknown>)(request, ctx)
                const scopes = MUTATION_SCOPES[request.type]
                if (scopes) {
                    publishLive(
                        scopes,
                        "mangaId" in request && typeof request.mangaId === "string" ? [request.mangaId] : undefined
                    )
                }
                return success(data)
            } catch (error) {
                return failure(error)
            }
        })()
    })
})
