import { BaseMirror } from "./abstract/BaseMirror"
import { MirrorImplementation } from "../../types/common"
import { MirrorHelper } from "../MirrorHelper"
import MangaBuddyIcon from "../icons/manga-btt-optimized.png"

export class MangaBuddy extends BaseMirror implements MirrorImplementation {
    constructor(amrLoader: MirrorHelper) {
        super(amrLoader)
    }

    mirrorName = "Manga Buddy"
    canListFullMangas = false
    mirrorIcon = MangaBuddyIcon
    languages = "en"
    domains = ["mangabuddy.com"]
    home = "https://mangabuddy.com/home"
    baseUrl = "https://mangabuddy.com"
    chapter_url = /^\/.+\/chapter-\d+$/g

    async getMangaList(search: string) {
        const doc = await this.mirrorHelper.loadPage(this.home + "/search?q=" + search, {
            nocache: true,
            preventimages: true
        })

        const res = []
        const _self = this
        const $ = this.parseHtml(doc)

        $(".manga-list .title h3 a").each(function () {
            res.push([$(this).text().trim(), _self.baseUrl + $(this).attr("href")])
        })
        return res
    }

    async getListChaps(urlManga) {
        const doc = await this.mirrorHelper.loadPage(urlManga, { nocache: true, preventimages: true })

        const res = []
        const _self = this
        const $ = this.parseHtml(doc)

        $("ul.chapter-list a").each(function (index) {
            res.push([$(".chapter-title", this).text().trim(), _self.baseUrl + $(this).attr("href")])
        })
        return res
    }

    async getCurrentPageInfo(doc, curUrl) {
        const $ = this.parseHtml(doc)
        const mgtitle = $($("#breadcrumbs-container .breadcrumbs-item")[1]).find("a")

        return {
            name: mgtitle.text(),
            currentMangaURL: this.baseUrl + mgtitle.attr("href"),
            currentChapterURL: curUrl
        }
    }

    async getListImages(doc, curUrl, sender) {
        const $ = this.parseHtml(doc)

        // MangaBuddy stores images in a JavaScript variable called "chapImages"
        // as a comma-separated string of URLs
        const chapImagesVar = this.getVariable({ variableName: "chapImages", doc })

        if (chapImagesVar && typeof chapImagesVar === "string") {
            // Split by comma and filter out empty strings
            const images = chapImagesVar.split(",").filter(url => url && url.trim())
            if (images.length > 0) {
                return images
            }
        }

        // Fallback: try to extract from img elements with data-src
        const res = []
        $("div.chapter-image img").each(function () {
            const src = $(this).attr("data-src") || $(this).attr("src")
            if (src && src.trim()) {
                res.push(src.trim())
            }
        })

        return res
    }

    isCurrentPageAChapterPage(doc, curUrl) {
        return this.queryHtml(doc, "div#chapter-images div.chapter-image").length > 0
    }

    async getImageUrlFromPage(urlImage: string): Promise<string> {
        return urlImage
    }
}
