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
import { captureChapter, clearAddedBadge, ADD_BADGE_ALARM_NAME } from "../src/background/capture"
import { isInternalTab, isInternalUrl } from "../src/background/tab-fetch"
import { injectChapterPrompt } from "../src/background/inject-chapter-prompt"
import { NEW_CHAPTERS_NOTIFICATION_ID } from "../src/notifications"
import { createBackup } from "../src/database"
import {
    updateAlarmName,
    communityAlarmName,
    syncAlarmName,
    anilistAlarmName,
    extensionUpdateAlarmName,
    backupAlarmName,
    EXTENSION_UPDATE_INTERVAL_HOURS,
    configureUpdateAlarm,
    configureSyncAlarm,
    configureCommunityAlarm,
    configureAniListAlarm,
    configureBackupAlarm
} from "../src/background/alarms"
import {
    checkUpdates,
    checkExtensionUpdate,
    backfillMangaGenres,
    clearStaleUpdateProgress,
    abortLongRunningTasks
} from "../src/handlers/updates-sources"
import { runCommunitySync } from "../src/handlers/community"
import { runAniListSync, abortAniListSync } from "../src/handlers/anilist"
import { autoPush, runAutoBackup } from "../src/handlers/data-sync-settings"
import { getSettings } from "../src/settings"
import { handlers } from "../src/background/dispatch"
import { MUTATION_SCOPES } from "../src/background/mutation-scopes"
import { publishLive } from "../src/live"

export default defineBackground(() => {
    // When an extension update is downloaded and waiting, the browser holds it back
    // until the worker goes idle. A long rate-limited update check keeps the worker
    // busy for minutes, deferring the update - and force-updating mid-check could wedge
    // the install until a full restart. Aborting the check lets the worker idle so the
    // browser applies the pending update on its own, at a safe point. We deliberately do
    // NOT call runtime.reload() here: a forced reload would abort an in-flight import,
    // restore, or sync-pull (silently rolling the whole transaction back) and tear down
    // any open reader/dashboard tabs mid-use. Letting the browser's own hold-until-idle
    // apply the update avoids yanking active work; onStartup's clearStaleUpdateProgress
    // then resets any progress record the killed check left behind.
    browser.runtime.onUpdateAvailable.addListener(() => {
        abortLongRunningTasks()
        abortAniListSync()
    })

    browser.runtime.onInstalled.addListener(details => {
        // Snapshot the library the first time a new version runs, so a bad update (or a
        // migration/sync that goes wrong afterwards) is always recoverable from Data ->
        // Restore. The browser can't run our code BEFORE it swaps in the new version, so
        // this first-run snapshot is the earliest safe point.
        if (details.reason === "update") void createBackup("pre-update")
        void clearStaleUpdateProgress()
        void configureUpdateAlarm()
        void configureSyncAlarm()
        void configureCommunityAlarm()
        void configureAniListAlarm()
        void getSettings().then(settings => configureBackupAlarm(settings.autoBackup))
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
        void clearStaleUpdateProgress()
        void configureUpdateAlarm()
        void configureSyncAlarm()
        void configureCommunityAlarm()
        void configureAniListAlarm()
        void getSettings().then(settings => configureBackupAlarm(settings.autoBackup))
        void browser.alarms.create(extensionUpdateAlarmName, {
            periodInMinutes: EXTENSION_UPDATE_INTERVAL_HOURS * 60
        })
        void checkExtensionUpdate()
        void backfillMangaGenres()
        // Clear any "ADD" badge left stuck by a capture whose clear-timeout never ran
        // because the worker was suspended.
        void clearAddedBadge()
    })

    browser.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === updateAlarmName) void checkUpdates()
        if (alarm.name === communityAlarmName) void runCommunitySync()
        if (alarm.name === syncAlarmName) void autoPush()
        if (alarm.name === anilistAlarmName) void runAniListSync()
        if (alarm.name === extensionUpdateAlarmName) void checkExtensionUpdate()
        if (alarm.name === backupAlarmName) void runAutoBackup()
        if (alarm.name === ADD_BADGE_ALARM_NAME) void clearAddedBadge()
    })

    // Clicking a "new chapters" notification opens the library so the user can jump in.
    browser.notifications.onClicked.addListener(id => {
        if (id !== NEW_CHAPTERS_NOTIFICATION_ID) return
        void browser.tabs.create({ url: browser.runtime.getURL("/app.html") })
        void browser.notifications.clear(id)
    })

    const onUpdatedHandler = (
        tabId: number,
        changeInfo: { url?: string; status?: string },
        tab: { url?: string | undefined }
    ) => {
        if (changeInfo.url && !isInternalTab(tabId) && !isInternalUrl(changeInfo.url)) {
            void captureChapter(changeInfo.url).catch(error => {
                console.warn("[AMR] Automatic chapter capture failed", error)
            })
        }
        if (changeInfo.status === "complete" && tab.url && !isInternalTab(tabId) && !isInternalUrl(tab.url)) {
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
        // The controller for the current query on this port. A new query aborts the
        // previous one so its late partials are dropped instead of interleaving with the
        // fresh results; a disconnect (search UI closed) aborts it so in-flight adapter
        // work stops feeding a dead port.
        let activeController: AbortController | null = null
        port.onMessage.addListener((msg: { type: string; query: string }) => {
            if (msg.type !== "manga:search" || !msg.query) return
            activeController?.abort()
            const controller = new AbortController()
            activeController = controller
            const searchable = sourceRegistry.list().filter(a => !!a.search)
            port.postMessage({ type: "start", total: searchable.length })
            searchMangaStreaming(
                msg.query,
                (results, sourceId) => {
                    if (controller.signal.aborted) return
                    try {
                        port.postMessage({ type: "partial", results, sourceId })
                    } catch {
                        // port may have disconnected
                    }
                },
                () => {
                    if (controller.signal.aborted) return
                    try {
                        port.postMessage({ type: "done" })
                    } catch {
                        // port may have disconnected
                    }
                },
                controller.signal
            )
        })
        port.onDisconnect.addListener(() => {
            activeController?.abort()
            activeController = null
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
