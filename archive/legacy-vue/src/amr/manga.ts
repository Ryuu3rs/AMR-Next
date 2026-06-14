/**
 * Manga entity class
 * Represents a manga entry followed in AMR
 */

// 0/1 have different meanings for these flags
export const MANGA_READ_START = 0 as const
export const MANGA_READ_STOP = 1 as const

export const MANGA_UPDATE_START = 1 as const
export const MANGA_UPDATE_STOP = 0 as const

/** Chapter info in list */
export interface ChapterInfo {
    name: string
    url: string
    [key: string]: unknown
}

/** Multi-language chapter list structure */
export interface MultiLangChapters {
    [language: string]: ChapterInfo[]
}

/** Raw manga data from storage or API */
export interface MangaData {
    mirror: string
    name: string
    url: string
    lastChapterReadURL?: string
    lastChapterReadName?: string
    listChaps?: string | ChapterInfo[] | MultiLangChapters
    read?: number
    update?: number
    display?: number
    layout?: number
    cats?: string | string[]
    ts?: number
    tsOpts?: number
    upts?: number
    webtoon?: boolean
    scaleUp?: number
    updateError?: number
    updateErrorCode?: number
    zoom?: number
    displayName?: string
    language?: string
    languages?: string[]
    currentChapter?: string
    currentScanUrl?: string
    orphaned?: boolean
    orphanedReason?: string
    lastKnownUrl?: string
}

/**
 * Manga entry followed in AMR
 */
export default class Manga {
    /** Unique key identifying the manga (usually mirror + name combo) */
    key: string
    /** Mirror name this manga is from */
    mirror: string
    /** Original manga name */
    name: string
    /** Manga page URL */
    url: string
    /** URL of last chapter read */
    lastChapterReadURL?: string
    /** Name of last chapter read */
    lastChapterReadName?: string
    /** List of chapters */
    listChaps: ChapterInfo[] | MultiLangChapters
    /** Read state: 0 = following updates, 1 = stopped */
    read: number
    /** Update state: 1 = updating, 0 = stopped */
    update: number
    /** Display mode */
    display: number
    /** Layout mode */
    layout: number
    /** Category IDs this manga belongs to */
    cats: string[]
    /** Timestamp of last chapter read update */
    ts: number
    /** Timestamp of last options update */
    tsOpts: number
    /** Timestamp of last new chapter found */
    upts: number
    /** Webtoon mode (no whitespace between images) */
    webtoon: boolean
    /** Scale up images */
    scaleUp: number
    /** Update error flag */
    updateError: number
    /** Update error code */
    updateErrorCode: number
    /** Zoom level */
    zoom: number
    /** Custom display name */
    displayName: string
    /** Language of followed manga */
    language?: string
    /** All available languages for this manga */
    languages?: string[]
    /** Currently reading chapter URL */
    currentChapter?: string
    /** Currently reading scan URL */
    currentScanUrl?: string
    /** Orphaned flag - mirror is dead or manga removed */
    orphaned: boolean
    /** Reason for being orphaned */
    orphanedReason: string
    /** Last known working URL (for migration) */
    lastKnownUrl: string

    /**
     * Manga object constructor, copy properties and check validation
     */
    constructor(obj: MangaData, key: string) {
        this.key = key
        this.mirror = obj.mirror
        this.name = obj.name
        this.url = obj.url
        this.lastChapterReadURL = obj.lastChapterReadURL
        this.lastChapterReadName = obj.lastChapterReadName

        // Parse listChaps from string if needed
        if (obj.listChaps && typeof obj.listChaps === "string") {
            this.listChaps = JSON.parse(obj.listChaps) as ChapterInfo[] | MultiLangChapters
        } else if (obj.listChaps) {
            this.listChaps = obj.listChaps as ChapterInfo[] | MultiLangChapters
        } else {
            this.listChaps = []
        }

        // Read state: start(0) / stop(1) following updates
        this.read = obj.read ?? MANGA_READ_START

        // Update state: start(1) / stop(0) looking for new chapters
        this.update = obj.update ?? MANGA_UPDATE_START

        this.display = obj.display ?? 0
        this.layout = obj.layout ?? 0

        // Parse cats from string if needed
        if (obj.cats && typeof obj.cats === "string") {
            this.cats = JSON.parse(obj.cats) as string[]
        } else if (obj.cats) {
            this.cats = obj.cats as string[]
        } else {
            this.cats = []
        }

        // Timestamps
        this.ts = obj.ts ?? Math.round(Date.now() / 1000)
        this.tsOpts = obj.tsOpts ?? Math.round(Date.now() / 1000)
        this.upts = obj.upts ?? 0

        // Reader settings
        this.webtoon = obj.webtoon ?? false
        this.scaleUp = obj.scaleUp ?? 0
        this.zoom = obj.zoom ?? 0

        // Update error tracking
        this.updateError = obj.updateError ?? 0
        this.updateErrorCode = obj.updateErrorCode ?? 0

        // Display name (for renaming)
        this.displayName = obj.displayName ?? ""

        // Multi-language support
        this.language = obj.language
        this.languages = obj.languages

        // Reading progress
        this.currentChapter = obj.currentChapter
        this.currentScanUrl = obj.currentScanUrl

        // Orphaned manga handling
        this.orphaned = obj.orphaned ?? false
        this.orphanedReason = obj.orphanedReason ?? ""
        this.lastKnownUrl = obj.lastKnownUrl ?? obj.url
    }
}
