import { extensionApi } from "../extension/browser-api"

export const PREFERENCES_STORAGE_KEY = "rewrite.preferences"

export type RewritePreferences = {
    compactMode: boolean
    openLinksInNewTab: boolean
    theme: "system" | "light" | "dark"
    showNotifications: boolean
    releaseCheckIntervalMinutes: number
    enableDashboardReader: boolean
}

export const defaultPreferences: RewritePreferences = {
    compactMode: false,
    openLinksInNewTab: true,
    theme: "system",
    showNotifications: true,
    releaseCheckIntervalMinutes: 30,
    enableDashboardReader: true
}

export async function getPreferences(): Promise<RewritePreferences> {
    const stored = await extensionApi.storage.local.get(PREFERENCES_STORAGE_KEY)
    const current = stored?.[PREFERENCES_STORAGE_KEY]

    if (!current || typeof current !== "object") {
        return defaultPreferences
    }

    return {
        compactMode: typeof current.compactMode === "boolean" ? current.compactMode : defaultPreferences.compactMode,
        openLinksInNewTab:
            typeof current.openLinksInNewTab === "boolean"
                ? current.openLinksInNewTab
                : defaultPreferences.openLinksInNewTab,
        theme:
            current.theme === "light" || current.theme === "dark" || current.theme === "system"
                ? current.theme
                : defaultPreferences.theme,
        showNotifications:
            typeof current.showNotifications === "boolean"
                ? current.showNotifications
                : defaultPreferences.showNotifications,
        releaseCheckIntervalMinutes:
            typeof current.releaseCheckIntervalMinutes === "number" && current.releaseCheckIntervalMinutes >= 5
                ? current.releaseCheckIntervalMinutes
                : defaultPreferences.releaseCheckIntervalMinutes,
        enableDashboardReader:
            typeof current.enableDashboardReader === "boolean"
                ? current.enableDashboardReader
                : defaultPreferences.enableDashboardReader
    }
}

export async function savePreferences(preferences: RewritePreferences): Promise<RewritePreferences> {
    await extensionApi.storage.local.set({
        [PREFERENCES_STORAGE_KEY]: preferences
    })

    return preferences
}
