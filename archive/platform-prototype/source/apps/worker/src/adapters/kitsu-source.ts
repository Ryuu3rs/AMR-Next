import type { IngestCatalogItem, MangaChapter, MangaDetail } from "@amr-next/contracts"
import type { SourceAdapter } from "./types.js"

const apiBase = process.env.KITSU_API_BASE_URL ?? "https://kitsu.io/api/edge"
const mangaLimit = Math.min(Math.max(Number(process.env.KITSU_MANGA_LIMIT ?? 6), 1), 20)
const chapterCap = Math.min(Math.max(Number(process.env.KITSU_CHAPTER_CAP ?? 20), 1), 80)
const requestTimeoutMs = Math.min(Math.max(Number(process.env.KITSU_TIMEOUT_MS ?? 12000), 1000), 60000)

type KitsuManga = {
    id: string
    attributes?: {
        canonicalTitle?: string
        abbreviatedTitles?: string[]
        synopsis?: string
        status?: string
        chapterCount?: number
        posterImage?: {
            large?: string
            original?: string
        }
        subtype?: string
        startDate?: string
        updatedAt?: string
    }
}

type KitsuResponse = {
    data: KitsuManga[]
}

const safeText = (value: unknown): string => (typeof value === "string" ? value.trim() : "")

const mapStatus = (value: string | undefined): MangaDetail["status"] => {
    const normalized = safeText(value).toLowerCase()
    if (normalized.includes("finished")) return "completed"
    if (normalized.includes("on_hold")) return "hiatus"
    if (normalized.includes("unreleased")) return "hiatus"
    return "ongoing"
}

const withTimeout = async (url: string): Promise<Response> => {
    const signal = AbortSignal.timeout(requestTimeoutMs)
    return fetch(url, { signal })
}

const fetchManga = async (): Promise<KitsuManga[]> => {
    const params = new URLSearchParams()
    params.set("page[limit]", String(mangaLimit))
    params.set("sort", "-userCount")
    params.set("filter[subtype]", "manga,manhwa,manhua")
    const response = await withTimeout(`${apiBase}/manga?${params.toString()}`)
    if (!response.ok) {
        const body = await response.text()
        throw new Error(`kitsu ${response.status}: ${body.slice(0, 240)}`)
    }
    const payload = (await response.json()) as KitsuResponse
    return payload.data ?? []
}

const buildChapters = (mangaId: string, sourceUrl: string, chapterCount: number, nowIso: string): MangaChapter[] => {
    const capped = Math.max(1, Math.min(chapterCount, chapterCap))
    const items: MangaChapter[] = []
    for (let chapter = capped; chapter > Math.max(0, capped - 20); chapter -= 1) {
        items.push({
            id: `kitsu-${mangaId}-ch-${chapter}`,
            mangaId,
            title: `Chapter ${chapter}`,
            number: String(chapter),
            sourceName: "kitsu",
            sourceChapterUrl: `${sourceUrl}#chapter-${chapter}`,
            releasedAt: nowIso
        })
    }
    return items
}

export const kitsuSourceAdapter: SourceAdapter = {
    id: "kitsu",
    async pullSnapshot(context): Promise<IngestCatalogItem[]> {
        const feed = await fetchManga()
        return feed.map(item => {
            const attributes = item.attributes ?? {}
            const mangaId = `kitsu-${item.id}`
            const sourceUrl = `https://kitsu.io/manga/${item.id}`
            const title = safeText(attributes.canonicalTitle) || mangaId
            const chapterCount = Math.max(1, attributes.chapterCount ?? 12)
            const subtype = safeText(attributes.subtype)
            const genres = subtype ? [subtype.toUpperCase()] : ["Manga"]
            const startYear = safeText(attributes.startDate).slice(0, 4)

            return {
                sourceMangaId: item.id,
                sourceMangaUrl: sourceUrl,
                sourceTitle: title,
                manga: {
                    id: mangaId,
                    title,
                    coverUrl:
                        safeText(attributes.posterImage?.large) ||
                        safeText(attributes.posterImage?.original) ||
                        `https://picsum.photos/seed/${mangaId}/400/600`,
                    synopsis: safeText(attributes.synopsis) || `${title} from Kitsu`,
                    genres,
                    themes: [],
                    status: mapStatus(attributes.status),
                    sourceCount: 1,
                    lastChapterNumber: String(chapterCount),
                    updatedAt: safeText(attributes.updatedAt) || context.nowIso,
                    altTitles: (attributes.abbreviatedTitles ?? [])
                        .map(entry => safeText(entry))
                        .filter(Boolean)
                        .slice(0, 6),
                    authors: startYear ? [`Serialized ${startYear}`] : ["Unknown"],
                    artists: ["Unknown"]
                },
                chapters: buildChapters(mangaId, sourceUrl, chapterCount, context.nowIso)
            }
        })
    }
}
