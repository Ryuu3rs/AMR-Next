export type ReadingDirection = "ltr" | "rtl" | "vertical"
export type PageFit = "width" | "height" | "contain" | "original"

export type OpenChapterIn = "reader" | "browser"

export type AppSettings = {
    autoAdd: boolean
    readingMode: "continuous" | "single"
    readingDirection: ReadingDirection
    pageFit: PageFit
    showPageNumber: boolean
    noGapContinuous: boolean
    preloadPages: number
    openChapterIn: OpenChapterIn
    theme: "dark" | "light" | "system"
    language: string
    dailyGoal: number
    blurNsfw: boolean
    updateIntervalHours: 0 | 6 | 12 | 24
    notifyNewChapters: boolean
    autoBackup: boolean
    // Auto-pause a title whose most recent read is older than this many days (0 = off).
    // Consumed by effectiveReadingStatus (reading-status.ts).
    autoPauseDays: number
    // When importing an AniList list, include entries the user has PAUSED / DROPPED
    // there (default true). When false, those entries are skipped on import.
    anilistImportPaused: boolean
    anilistImportDropped: boolean
    // Source ids the user toggled OFF for search on the Sources tab. Aggregate search
    // (manga:search + the streaming Home search) skips these so a big library isn't
    // querying every adapter every time. Empty = search all (default).
    searchDisabledSourceIds: string[]
}

const settingsKey = "settings"

export const defaultSettings: AppSettings = {
    autoAdd: true,
    readingMode: "continuous",
    readingDirection: "ltr",
    pageFit: "width",
    showPageNumber: true,
    noGapContinuous: false,
    preloadPages: 3,
    openChapterIn: "reader",
    theme: "dark",
    language: "en",
    dailyGoal: 0,
    blurNsfw: true,
    updateIntervalHours: 12,
    notifyNewChapters: true,
    autoBackup: true,
    autoPauseDays: 0,
    anilistImportPaused: true,
    anilistImportDropped: true,
    searchDisabledSourceIds: []
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
