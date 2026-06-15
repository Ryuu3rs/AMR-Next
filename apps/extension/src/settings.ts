export type ReadingDirection = "ltr" | "rtl" | "vertical"
export type PageFit = "width" | "height" | "contain" | "original"

export type OpenChapterIn = "reader" | "browser"

export type AppSettings = {
    autoAdd: boolean
    readingMode: "continuous" | "single"
    readingDirection: ReadingDirection
    pageFit: PageFit
    showPageNumber: boolean
    preloadPages: number
    openChapterIn: OpenChapterIn
    theme: "dark" | "light" | "system"
    updateIntervalHours: 0 | 6 | 12 | 24
}

const settingsKey = "settings"

export const defaultSettings: AppSettings = {
    autoAdd: true,
    readingMode: "continuous",
    readingDirection: "ltr",
    pageFit: "width",
    showPageNumber: true,
    preloadPages: 3,
    openChapterIn: "reader",
    theme: "dark",
    updateIntervalHours: 12
}

export async function getSettings(): Promise<AppSettings> {
    const stored = await browser.storage.local.get(settingsKey)
    return { ...defaultSettings, ...(stored[settingsKey] as Partial<AppSettings> | undefined) }
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const settings = { ...(await getSettings()), ...patch }
    await browser.storage.local.set({ [settingsKey]: settings })
    return settings
}
