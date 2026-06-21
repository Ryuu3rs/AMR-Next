import type { ChapterRecord, SourceLinkRecord } from "@amr/contracts"
import { sourceRegistry } from "@amr/sources"
import type { HistoryEvent, LibraryManga } from "./database"

type LegacyManga = {
    m?: string
    n?: string
    u?: string
    l?: string
    ut?: number
    g?: string
    wt?: boolean
}
type LegacyExport = { mangas: LegacyManga[]; bookmarks?: unknown[] }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MANGA_PATH_MARKERS = ["manga", "comic", "comics", "series", "manhwa", "manhua", "title", "read"]

// Old AMR stored URLs on domains that have since changed or that the new registry lists under a different canonical hostname.
const LEGACY_DOMAIN_ALIASES: Readonly<Record<string, string>> = {
    // MangaNato / Manganelo — the old AMR "Manganelo" mirror accepted many subdomains
    // that the new manganato adapter doesn't list (it only covers the canonical ones).
    "chap.manganato.com": "manganato",
    "m.manganato.com": "manganato",
    "readmanganato.com": "manganato",
    "m.manganelo.com": "manganato",
    "chap.manganelo.com": "manganato",
    "manganelo.com": "manganato",
    // MangaPark — old AMR used .com, new adapter only registers .net
    "mangapark.com": "mangapark",
    // AsuraScans — old AMR used asura.gg and www.asurascans.com before the domain settled
    "asura.gg": "asurascans",
    "www.asurascans.com": "asurascans",
    // ManhuaPlus — migrated domain (.com → .org); old AMR links still use .com
    "manhuaplus.com": "manhuaplus",
    "www.manhuaplus.com": "manhuaplus",
    // MangaRead — old AMR accepted mangaread.org without www prefix
    "mangaread.org": "mangaread",
    // Dynasty Scans — ensure the apex domain without www is covered
    "dynasty-scans.com": "dynasty-scans",
    // MangaBuddy family
    "mangabuddy.com": "mangabuddy",
    // MangaSushi — old AMR used .net, new adapter only registers .org
    "mangasushi.net": "mangasushi",
    // Weeb Central — cover any legacy capitalization / www variant
    "www.weebcentral.com": "weebcentral",
    // AsuraToon — early domain before asurascans.com settled
    "asuratoon.com": "asurascans",
    "www.asuratoon.com": "asurascans",
    // FlameComics — migrated from .com/.me to .xyz
    "flamecomics.com": "flamecomics",
    "www.flamecomics.com": "flamecomics",
    "flamecomics.me": "flamecomics",
    "www.flamecomics.me": "flamecomics",
    // Tritinia Scans
    "www.tritinia.org": "tritinia"
}

export function isLegacyExport(raw: unknown): raw is LegacyExport {
    if (typeof raw !== "object" || raw === null) return false
    const obj = raw as Record<string, unknown>
    return Array.isArray(obj.mangas) && obj.format === undefined
}

function parseUrl(value: string | undefined): URL | undefined {
    if (!value) return undefined
    try {
        const u = new URL(value)
        return u.protocol === "http:" || u.protocol === "https:" ? u : undefined
    } catch {
        return undefined
    }
}

function adapterIdFor(url: URL): string | undefined {
    const adapter = sourceRegistry.match(url)
    if (adapter) return adapter.manifest.id
    return LEGACY_DOMAIN_ALIASES[url.hostname.toLowerCase()]
}

function deriveSlug(u: URL): string {
    const segments = u.pathname.split("/").filter(Boolean)
    const markerIndex = segments.findIndex(s => MANGA_PATH_MARKERS.includes(s.toLowerCase()))
    const afterMarker = markerIndex >= 0 ? segments[markerIndex + 1] : undefined
    if (afterMarker) return afterMarker
    const last = segments[segments.length - 1] ?? ""
    const readerStyle = last.match(/^(.*?)-chapter[-_]/i)
    if (readerStyle?.[1]) return readerStyle[1]
    return segments[0] ?? ""
}

function mangadexId(u: URL, kind: "title" | "chapter"): string | undefined {
    const segments = u.pathname.split("/").filter(Boolean)
    const i = segments.indexOf(kind)
    const id = i === -1 ? undefined : segments[i + 1]
    return id && UUID_PATTERN.test(id) ? id.toLowerCase() : undefined
}

function chapterNumberFrom(url: string): number | undefined {
    const chapter = url.match(/chapter[-_ ]?(\d+(?:\.\d+)?)/i)
    if (chapter?.[1] !== undefined) return Number(chapter[1])
    // Webtoons uses episode_no=N query param instead of /chapter-N/ path segments
    const episode = url.match(/[?&]episode_no=(\d+)/i)
    if (episode?.[1] !== undefined) return Number(episode[1])
    return undefined
}

function sanitizeKey(u: URL): string {
    return `${u.hostname}${u.pathname}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || u.hostname
}

function convertEntry(entry: LegacyManga): {
    manga: LibraryManga
    sourceLink?: SourceLinkRecord
    chapter?: ChapterRecord
    history?: HistoryEvent
} | null {
    const title = entry.n?.trim()
    if (!title) return null

    const mangaUrlParsed = parseUrl(entry.u)
    const chapterUrlParsed = parseUrl(entry.l)
    const primary = mangaUrlParsed ?? chapterUrlParsed
    if (!primary) return null

    const sourceId = adapterIdFor(primary) ?? (chapterUrlParsed ? adapterIdFor(chapterUrlParsed) : undefined)
    const known = sourceId !== undefined
    const resolvedSourceId = sourceId ?? primary.hostname

    const isMangaDex = resolvedSourceId === "mangadex"
    const isWebtoons = resolvedSourceId === "webtoons"
    const sourceMangaId = isMangaDex
        ? mangaUrlParsed
            ? mangadexId(mangaUrlParsed, "title")
            : undefined
        : isWebtoons
          ? ((mangaUrlParsed ?? primary).searchParams.get("title_no") ?? undefined)
          : deriveSlug(mangaUrlParsed ?? primary) || undefined

    const idKey = sourceMangaId ?? sanitizeKey(mangaUrlParsed ?? primary)
    const id = `${resolvedSourceId}:manga:${idKey}`
    const now = entry.ut ?? Date.now()
    const sourceUrl = (chapterUrlParsed ?? mangaUrlParsed ?? primary).toString()
    const lastReadNumber = !isMangaDex && entry.l ? chapterNumberFrom(entry.l) : undefined

    const manga: LibraryManga = {
        id,
        title,
        normalizedTitle: title.toLocaleLowerCase("en").replace(/\s+/g, " "),
        authors: [],
        status: "unknown",
        addedAt: now,
        updatedAt: now,
        sourceId: resolvedSourceId,
        sourceUrl,
        ...(sourceMangaId ? { sourceMangaId } : {}),
        ...(mangaUrlParsed ? { mangaUrl: mangaUrlParsed.toString() } : {}),
        ...(lastReadNumber !== undefined ? { lastReadChapterNumber: lastReadNumber } : {}),
        ...(known ? {} : { manualTracking: true })
    }

    const linkUrl = mangaUrlParsed ?? (known ? chapterUrlParsed : undefined)
    const sourceLink: SourceLinkRecord | undefined =
        known && linkUrl
            ? {
                  mangaId: id,
                  sourceId: resolvedSourceId,
                  url: linkUrl.toString(),
                  ...(sourceMangaId ? { sourceMangaId } : {}),
                  title,
                  ...(entry.g ? { language: entry.g } : {}),
                  addedAt: now,
                  updatedAt: now
              }
            : undefined

    let chapter: ChapterRecord | undefined
    let history: HistoryEvent | undefined
    if (chapterUrlParsed && lastReadNumber !== undefined) {
        const chapterId = `${id}:ext:ch-${lastReadNumber}`
        chapter = {
            id: chapterId,
            mangaId: id,
            sourceId: resolvedSourceId,
            title: `Chapter ${lastReadNumber}`,
            url: chapterUrlParsed.toString(),
            sortKey: lastReadNumber
        }
        manga.lastReadChapterId = chapterId
        manga.latestChapterId = chapterId
        manga.latestChapterNumber = lastReadNumber
        manga.lastReadAt = now
        history = { mangaId: id, chapterId, type: "completed", occurredAt: now }
    }

    return {
        manga,
        ...(sourceLink ? { sourceLink } : {}),
        ...(chapter ? { chapter } : {}),
        ...(history ? { history } : {})
    }
}

export function migrateLegacyImport(raw: unknown): {
    envelope: unknown
    migrated: boolean
    converted: number
    skipped: number
    needsAttention: string[]
} {
    if (!isLegacyExport(raw)) {
        return { envelope: raw, migrated: false, converted: 0, skipped: 0, needsAttention: [] }
    }

    const manga: LibraryManga[] = []
    const sourceLinks: SourceLinkRecord[] = []
    const chapters: ChapterRecord[] = []
    const historyEvents: HistoryEvent[] = []
    const needsAttention: string[] = []
    const seen = new Set<string>()
    let skipped = 0

    for (const entry of raw.mangas) {
        const converted = convertEntry(entry)
        if (!converted) {
            skipped += 1
            continue
        }
        if (seen.has(converted.manga.id)) continue
        seen.add(converted.manga.id)
        manga.push(converted.manga)
        if (converted.manga.manualTracking) needsAttention.push(converted.manga.id)
        if (converted.sourceLink) sourceLinks.push(converted.sourceLink)
        if (converted.chapter) chapters.push(converted.chapter)
        if (converted.history) historyEvents.push(converted.history)
    }

    return {
        envelope: {
            format: "all-mangas-reader",
            version: 1,
            exportedAt: Date.now(),
            data: { manga, sourceLinks, chapters, progress: [], historyEvents }
        },
        migrated: true,
        converted: manga.length,
        skipped,
        needsAttention
    }
}
