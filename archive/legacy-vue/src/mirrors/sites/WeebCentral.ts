import { BaseMirror } from "./abstract/BaseMirror"
import { CurrentPageInfo, InfoResult, MirrorImplementation } from "../../types/common"
import { MirrorHelper } from "../MirrorHelper"
import BaseIcon from "../icons/_base-icon-optimized.png"
import { debug } from "../../core/debug"

/**
 * WeebCentral mirror implementation
 * Replacement for dead Manga4Life/MangaSee sites
 * Uses HTMX-style API endpoints for search and chapter data
 */
export class WeebCentral extends BaseMirror implements MirrorImplementation {
    constructor(amrLoader: MirrorHelper) {
        super(amrLoader)
    }

    mirrorName = "Weeb Central"
    canListFullMangas = false
    mirrorIcon = BaseIcon
    languages = "en"
    domains = ["weebcentral.com"]
    home = "https://weebcentral.com/"
    chapter_url = /\/chapters\/[A-Z0-9]+/
    // Site may have Cloudflare protection - search might not work from background script
    // but reading should work when visiting the site directly in browser
    disabledForSearch = false // Try enabled first, can disable if needed

    private baseUrl = "https://weebcentral.com"

    async getMangaList(search: string): Promise<InfoResult[]> {
        // Use the HTMX search endpoint
        const searchUrl = `${this.baseUrl}/search/data?text=${encodeURIComponent(
            search
        )}&sort=Best%20Match&order=Descending&official=Any&display_mode=Full%20Display&limit=20&offset=0`

        const doc = await this.mirrorHelper.loadPage(searchUrl, {
            nocache: true,
            preventimages: true
        })

        const $ = this.parseHtml(doc)
        const res: InfoResult[] = []

        // Parse search results - each result has a link to /series/{id}/{slug}
        $('a[href*="/series/"]').each(function () {
            const href = $(this).attr("href")
            // Find the title - it's in a nested structure
            const titleEl = $(this).find("p").first()
            const title = titleEl.text().trim()

            if (href && title && href.includes("/series/")) {
                // Ensure full URL
                const fullUrl = href.startsWith("http") ? href : `https://weebcentral.com${href}`
                res.push([title, fullUrl])
            }
        })

        // Deduplicate by URL (search results may have duplicate links)
        const seen = new Set<string>()
        return res.filter(([, url]) => {
            if (seen.has(url)) return false
            seen.add(url)
            return true
        })
    }

    async getListChaps(urlManga: string): Promise<InfoResult[]> {
        // Extract series ID from URL: /series/{ID}/{slug} or /series/{ID}
        const match = urlManga.match(/\/series\/([A-Z0-9]+)/)
        if (!match) {
            debug.mirrors.error("WeebCentral Could not extract series ID from URL:", urlManga)
            return []
        }

        const seriesId = match[1]
        const chaptersUrl = `${this.baseUrl}/series/${seriesId}/full-chapter-list`

        const doc = await this.mirrorHelper.loadPage(chaptersUrl, {
            nocache: true,
            preventimages: true
        })

        const $ = this.parseHtml(doc)
        const res: InfoResult[] = []

        // Parse chapter list - each chapter has a link to /chapters/{id}
        $('a[href*="/chapters/"]').each(function () {
            const href = $(this).attr("href")
            // Get chapter title from the span with chapter number
            const chapterSpan = $(this).find("span").first()
            const chapterText = chapterSpan.text().trim() || $(this).text().trim()

            if (href && chapterText) {
                const fullUrl = href.startsWith("http") ? href : `https://weebcentral.com${href}`
                res.push([chapterText, fullUrl])
            }
        })

        return res
    }

    async getCurrentPageInfo(doc: string, curUrl: string): Promise<CurrentPageInfo> {
        const $ = this.parseHtml(doc)

        // Get manga name from the series link (on chapter pages, this is the manga title)
        let name = ""
        let mangaUrl = ""

        // Find the series link - it contains the manga name
        // Must match /series/{ID} where ID is alphanumeric (not "random" or other nav links)
        // Series IDs look like: 01J76XYG8FNWRR3PHEFKN2NB87
        $('a[href*="/series/"]').each(function () {
            const href = $(this).attr("href")
            const text = $(this).text().trim()
            // Skip navigation links like /series/random - only match actual series IDs
            // Series IDs are alphanumeric and typically 26 characters
            if (href && text && !mangaUrl && href.match(/\/series\/[A-Z0-9]{20,}/i)) {
                mangaUrl = href.startsWith("http") ? href : `https://weebcentral.com${href}`
                name = text
            }
        })

        // Fallback: try h1 for series pages
        if (!name) {
            name = $("h1").first().text().trim()
        }

        return {
            name: name || "Unknown",
            currentMangaURL: mangaUrl,
            currentChapterURL: curUrl
        }
    }

    async getListImages(doc: string, curUrl: string): Promise<string[]> {
        // Extract chapter ID from URL: /chapters/{ID}
        const match = curUrl.match(/\/chapters\/([A-Z0-9]+)/)
        if (!match) {
            debug.mirrors.error("WeebCentral Could not extract chapter ID from URL:", curUrl)
            return []
        }

        const chapterId = match[1]
        const imagesUrl = `${this.baseUrl}/chapters/${chapterId}/images?is_prev=False&current_page=1&reading_style=long_strip`

        const imgDoc = await this.mirrorHelper.loadPage(imagesUrl, {
            nocache: true,
            preventimages: false
        })

        // Parse image URLs from the response
        const $ = this.parseHtml(imgDoc)
        const images: string[] = []

        // Images are in img tags with src attribute
        $("img[src]").each(function () {
            const src = $(this).attr("src")
            if (src && (src.includes("cdn") || src.includes("weebcentral") || src.startsWith("http"))) {
                images.push(src)
            }
        })

        // Fallback: try regex if cheerio didn't find images
        if (images.length === 0) {
            const srcMatches = imgDoc.match(/src="([^"]+)"/g)
            if (srcMatches) {
                for (const m of srcMatches) {
                    const url = m.replace('src="', "").replace('"', "")
                    if (url.includes("cdn") || url.includes(".jpg") || url.includes(".png") || url.includes(".webp")) {
                        images.push(url)
                    }
                }
            }
        }

        return images
    }

    async getImageUrlFromPage(urlImg: string): Promise<string> {
        // Images are direct URLs, no need to fetch page
        return urlImg
    }

    isCurrentPageAChapterPage(doc: string, curUrl: string): boolean {
        // Chapter pages have /chapters/{ID} in the URL
        return /\/chapters\/[A-Z0-9]+/.test(curUrl)
    }
}
