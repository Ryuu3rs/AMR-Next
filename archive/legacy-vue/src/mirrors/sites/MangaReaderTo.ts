import { BaseMirror } from "./abstract/BaseMirror"
import { MirrorImplementation } from "../../types/common"
import { MirrorHelper } from "../MirrorHelper"
import MangaReaderToIcon from "../icons/manga-reader-to-optimized.png"
import { debug } from "../../core/debug"

export class MangaReaderTo extends BaseMirror implements MirrorImplementation {
    constructor(amrLoader: MirrorHelper) {
        super(amrLoader)
    }

    mirrorName = "Manga Reader.to"
    canListFullMangas = false
    disabledForSearch = true // Search endpoint currently returns HTTP errors
    mirrorIcon = MangaReaderToIcon
    languages = "en"
    domains = ["mangareader.to"]
    home = "https://mangareader.to/home"
    baseUrl = "https://mangareader.to"
    chapter_url = /^\/read\/.*\/en\/chapter-\d+/g

    async getMangaList(search: string) {
        const doc = await this.mirrorHelper.loadPage(this.baseUrl + "/search?keyword=" + search, {
            nocache: true,
            preventimages: true
        })

        const res = []
        const _self = this
        const $ = this.parseHtml(doc)

        $("h3.manga-name a").each(function () {
            res.push([$(this).text().trim(), _self.baseUrl + $(this).attr("href")])
        })
        return res
    }

    async getListChaps(urlManga) {
        const doc = await this.mirrorHelper.loadPage(urlManga, { nocache: true, preventimages: true })

        const res = []
        const _self = this
        const $ = this.parseHtml(doc)

        $('ul#en-chapters a[href*="/read/"]').each(function (index) {
            res.push([$("span.name", this).text(), _self.baseUrl + $(this).attr("href")])
        })
        return res
    }

    async getCurrentPageInfo(doc, curUrl) {
        const $ = this.parseHtml(doc)
        var mgtitle = $("a.hr-manga")

        return {
            name: mgtitle.text().trim(),
            currentMangaURL: this.baseUrl + mgtitle.attr("href"),
            currentChapterURL: curUrl
        }
    }

    async getListImages(doc, curUrl, sender) {
        const res = []
        let $ = this.parseHtml(doc)

        // Try multiple ways to get the reading ID
        // 1. From the wrapper element (most reliable when page is fully rendered)
        let id = $("div#wrapper").attr("data-reading-id")

        // 2. From any element with data-reading-id attribute
        if (!id) {
            id = $("[data-reading-id]").first().attr("data-reading-id")
        }

        // 3. From the raw HTML using regex
        if (!id) {
            const readingIdMatch = doc.match(/data-reading-id=["'](\d+)["']/)
            if (readingIdMatch) {
                id = readingIdMatch[1]
            }
        }

        // 4. Try to find it in script content
        if (!id) {
            const scriptMatch = doc.match(/reading[_-]?id['":\s]+(\d+)/i)
            if (scriptMatch) {
                id = scriptMatch[1]
            }
        }

        if (!id) {
            debug.mirrors.error("Could not find reading ID for MangaReaderTo. URL:", curUrl)
            debug.mirrors.trace("Page content length:", doc.length)
            // Log first 500 chars of doc for debugging
            debug.mirrors.trace("Page start:", doc.substring(0, 500))
            return res
        }

        debug.mirrors.debug("MangaReaderTo: Found reading ID:", id)

        // https://mangareader.to/ajax/image/list/chap/844382?mode=vertical&quality=high&hozPageSize=1
        try {
            const imageData = await this.mirrorHelper.loadJson(
                `${this.baseUrl}/ajax/image/list/chap/${id}?mode=vertical&quality=high&hozPageSize=1`,
                { nocache: true }
            )
            $ = this.parseHtml(imageData.html)

            $("div.iv-card").each(function (index) {
                res.push($(this).attr("data-url"))
            })
        } catch (e) {
            debug.mirrors.error("Failed to fetch images from MangaReaderTo:", e)
        }

        return res
    }

    isCurrentPageAChapterPage(doc, curUrl) {
        const pathname = new URL(curUrl).pathname
        // Reset lastIndex to avoid issues with global regex flag
        this.chapter_url.lastIndex = 0
        return this.chapter_url.test(pathname)
    }

    async getImageUrlFromPage(urlImage: string): Promise<string> {
        return urlImage
    }
}
