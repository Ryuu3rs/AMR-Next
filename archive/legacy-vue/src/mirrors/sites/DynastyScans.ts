import { BaseMirror } from "./abstract/BaseMirror"
import { MirrorImplementation } from "../../types/common"
import { MirrorHelper } from "../MirrorHelper"
import DynastyScansIcon from "../icons/dynastyscans-optimized.png"

export class DynastyScans extends BaseMirror implements MirrorImplementation {
    constructor(amrLoader: MirrorHelper) {
        super(amrLoader)
    }

    mirrorName = "Dynasty Scans"
    canListFullMangas = true
    mirrorIcon = DynastyScansIcon
    languages = "en"
    domains = ["dynasty-scans.com"]
    home = "https://dynasty-scans.com"
    chapter_url = /^\/chapters\/.+$/g

    async getMangaList(search: string) {
        const res = []
        const seen = new Set<string>()
        const _self = this
        const needle = (search || "").trim().toLowerCase()

        let page = 1
        let hasNext = true
        let safety = 0

        while (hasNext && safety < 50) {
            safety++
            const url = page === 1 ? `${this.home}/series` : `${this.home}/series?page=${page}`
            let doc = ""
            try {
                doc = await this.mirrorHelper.loadPage(url, {
                    nocache: true,
                    preventimages: true
                })
            } catch {
                // Some later pages intermittently fail; return partial results instead of hard error.
                break
            }

            const $ = this.parseHtml(doc)
            $(".tag-list a").each(function () {
                const name = $(this).text().trim()
                const href = $(this).attr("href")
                if (!name || !href) return
                if (needle && !name.toLowerCase().includes(needle)) return
                const fullUrl = _self.home + href
                if (seen.has(fullUrl)) return
                seen.add(fullUrl)
                res.push([name, fullUrl])
            })

            const next = $(".pagination a[rel='next']").first().attr("href")
            if (!next) {
                hasNext = false
            } else {
                page++
            }
        }

        return res
    }

    async getListChaps(urlManga) {
        const doc = await this.mirrorHelper.loadPage(urlManga, { nocache: true, preventimages: true })

        const res = []
        const _self = this
        const $ = this.parseHtml(doc)

        $(".chapter-list a.name").each(function (index) {
            res[res.length] = [$(this).text(), _self.home + $(this).attr("href")]
        })
        res.reverse()
        return res
    }

    async getCurrentPageInfo(doc, curUrl) {
        const $ = this.parseHtml(doc)
        const chapterTitleText = $("#chapter-title").text().replace(/\s+/g, " ").trim()

        const linkSelectors = [
            "#chapter-title a[href^='/series/']",
            "#chapter-details a[href^='/series/']",
            "#chapter-details a[href^='/anthologies/']",
            "#chapter-details a[href^='/issues/']",
            "#chapter-details a[href^='/doujins/']",
            "#chapter-details a[href^='/lists/']",
            "#chapter-title a"
        ]

        let target = null
        for (const selector of linkSelectors) {
            const found = $(selector).first()
            if (found && found.length > 0) {
                target = found
                break
            }
        }

        const name = target ? target.text().trim() : chapterTitleText
        const href = target ? target.attr("href") : undefined
        const currentMangaURL = href ? this.home + href : curUrl

        return {
            name: name || chapterTitleText,
            currentMangaURL,
            currentChapterURL: curUrl.split("?")[0]
        }
    }

    async getListImages(doc) {
        const pages = this.mirrorHelper.getVariableFromScript("pages", doc)
        if (!Array.isArray(pages)) return []

        return pages
            .map(page => {
                const image = page?.image ?? page
                if (!image || typeof image !== "string") return null
                if (image.startsWith("http://") || image.startsWith("https://")) {
                    return image
                }
                return this.home + image
            })
            .filter(Boolean)
    }

    isCurrentPageAChapterPage(doc) {
        return this.queryHtml(doc, "#image img").length > 0
    }

    async getImageUrlFromPage(urlImage: string): Promise<string> {
        return urlImage
    }
}
