import { getSettings } from "./settings"

// Shared id so the background click handler can recognise our own notification and open
// the app (rather than reacting to any notification in the browser).
export const NEW_CHAPTERS_NOTIFICATION_ID = "amr-new-chapters"

// Fires a single aggregate desktop notification for the titles that gained a new chapter
// on the last update check. Opt-out via the notifyNewChapters setting. Best-effort: it
// swallows every failure so it can never break the update loop, and no-ops when the
// notifications API is unavailable.
export async function notifyNewChapters(titles: readonly string[]): Promise<void> {
    if (titles.length === 0) return
    try {
        const settings = await getSettings()
        if (!settings.notifyNewChapters) return
        if (!browser.notifications?.create) return

        const shown = titles.slice(0, 5)
        const title = titles.length === 1 ? "New chapter available" : `${titles.length} titles updated`
        const message =
            titles.length === 1
                ? titles[0]!
                : shown.join(", ") + (titles.length > shown.length ? `, and ${titles.length - shown.length} more` : "")

        await browser.notifications.create(NEW_CHAPTERS_NOTIFICATION_ID, {
            type: "basic",
            iconUrl: browser.runtime.getURL("/icons/icon_128.png"),
            title,
            message
        })
    } catch (error) {
        console.warn("[AMR] Failed to show new-chapter notification", error)
    }
}
