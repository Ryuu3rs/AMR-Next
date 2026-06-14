import { BaseMirror } from "./abstract/BaseMirror"
import { MirrorImplementation } from "../../types/common"
import { MirrorHelper } from "../MirrorHelper"
import Icon from "../icons/batoto-optimized.png"
import { debug } from "../../core/debug"

export class BatotoFake extends BaseMirror implements MirrorImplementation {
    constructor(mirrorHelper: MirrorHelper) {
        super(mirrorHelper)
    }

    mirrorName = "Batoto (fake)"
    disabledForSearch = true // Expensive recursive search often times out
    mirrorIcon = Icon
    languages = "en"
    domains = [
        "bato.to",
        "batotoo.com",
        "comiko.net",
        "mto.to",
        "mangatoto.com",
        "dto.to",
        "battwo.com",
        "batocomic.com",
        "batocomic.net",
        "batocomic.org",
        "xbato.com",
        "zbato.com",
        "readbato.com",
        "wto.to"
    ]
    home = "https://bato.to"
    chapter_url = /^\/chapter\/.+$/

    globalVariables = ["batoPass", "batoWord"]

    public async getMangaList(search, url = null) {
        let doc
        if (!url) {
            doc = await this.mirrorHelper.loadPage(this.home + "/search?word=" + search, {
                nocache: true,
                preventimages: true
            })
        } else {
            doc = await this.mirrorHelper.loadPage(url, { nocache: true, preventimages: true })
        }

        const res = []
        const self = this

        const $ = this.parseHtml(doc)

        $("a.item-title[href*='/series/']").each(function () {
            res.push([$(this).text().trim(), self.home + $(this).attr("href")])
        })
        const nextPage = $("li.page-item:last")
        if (!nextPage.hasClass("disabled")) {
            res.push(...(await self.getMangaList("", self.home + nextPage.find("a").attr("href"))))
        }
        return res
    }

    public async getListChaps(urlManga: string) {
        const doc = await this.mirrorHelper.loadPage(urlManga, { nocache: true, preventimages: true })
        const res = []
        const $ = this.parseHtml(doc)

        // Get the base URL from the manga URL to handle different domains
        const baseUrl = new URL(urlManga).origin

        // Try multiple selectors - bato.to has changed their HTML structure
        // New structure: chapter links are in divs with data-hk attributes, containing <a> with href="/chapter/..."
        const chapterLinks = $("a[href*='/chapter/']")

        // Filter to only get chapter links (not other links that might contain /chapter/)
        chapterLinks.each(function () {
            const href = $(this).attr("href")
            // Only include links that look like chapter links (start with /chapter/)
            if (href && href.startsWith("/chapter/")) {
                const text = $(this).text().trim()
                // Skip empty text or navigation links
                if (text && text.length > 0) {
                    res.push([text, baseUrl + href])
                }
            }
        })

        // Fallback to old selector if new one doesn't work
        if (res.length === 0) {
            $(".main a.chapt").each(function () {
                res.push([$(this).text(), baseUrl + $(this).attr("href")])
            })
        }

        return res
    }

    public async getCurrentPageInfo(doc: string, curUrl: string) {
        const $ = this.parseHtml(doc)
        // Try multiple selectors for the manga title link
        let title = $("a[href*='/series/']").first()
        if (!title.length) {
            title = $("h3.nav-title a", doc).first()
        }

        // Get the current host from the URL to build proper URLs
        const urlObj = new URL(curUrl)
        const baseUrl = urlObj.origin

        return {
            name: title.text().trim(),
            currentMangaURL: baseUrl + title.attr("href"),
            currentChapterURL: curUrl.split("/").slice(0, 5).join("/")
        }
    }

    public async getListImages(doc: string, _currentUrl: string, _sender: unknown) {
        // First, get the imgHttps array directly - these are the base image URLs
        const images = this.getVariable({ doc, variableName: "imgHttps" })

        // Check if batoWord exists - if not, images might work without tokens
        const batoWordMatch = /const batoWord = "(.*?)";/g.exec(doc)
        if (!batoWordMatch || !batoWordMatch[1]) {
            // No encryption, return images as-is
            return images
        }
        const batoWord = batoWordMatch[1]

        // Get batoPass and deobfuscate it
        const batoPassMatch = /const batoPass = (.*?);/g.exec(doc)
        if (!batoPassMatch || !batoPassMatch[1]) {
            // No pass, return images as-is
            return images
        }

        // Deobfuscation logic that converts JSFuck-style obfuscation to a string
        // The obfuscation uses patterns like [!+[]+!+[]+!+[]] which equals [3] = "3"
        // And complex expressions like (+(+!+[]+[+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+[!+[]+!+[]]+[+[]])+[])[+!+[]] = "n" (from "Infinity")
        let batoPass = batoPassMatch[1]

        // Handle the Infinity trick: (+(+!+[]+[+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+[!+[]+!+[]]+[+[]])+[])[+!+[]] = "n"
        // This creates "Infinity" and takes the second character "n"
        batoPass = batoPass.replace(
            /\(\+\(\+!\+\[\]\+\[\+!\+\[\]\]\+\(!\[\]\+\[\]\)\[!\+\[\]\+!\+\[\]\+!\+\[\]\]\+\[!\+\[\]\+!\+\[\]\]\+\[\+\[\]\]\)\+\[\]\)\[\+!\+\[\]\]/g,
            "n"
        )

        // Replace !+[] with 1 (this is true coerced to number)
        batoPass = batoPass.replace(/!\+\[\]/g, "1")

        // Replace [+[]] with [0]
        batoPass = batoPass.replace(/\[\+\[\]\]/g, "[0]")

        // Replace sequences of 1+1+1... with their sum
        batoPass = batoPass.replace(/1(?:\+1)*/g, match => String((match.length + 1) / 2))

        // Replace [+1] at start of bracket with [1]
        batoPass = batoPass.replace(/\[\+(\d)\]/g, "[$1]")

        // Extract just the digits from [digit] patterns and concatenate
        batoPass = batoPass.replace(/\[(\d)\]/g, "$1")

        // Remove remaining + signs between digits
        batoPass = batoPass.replace(/\+/g, "")

        // Remove any remaining brackets
        batoPass = batoPass.replace(/[\[\]]/g, "")

        try {
            const crypto = this.mirrorHelper.crypto
            const decrypted = JSON.parse(
                crypto.AES.decrypt(batoWord, batoPass).toString(this.mirrorHelper.crypto.enc.Utf8)
            )
            return images.map((image, index) => image + "?" + decrypted[index])
        } catch (e) {
            debug.mirrors.error("Batoto decryption failed:", { error: e, batoPass })
            // Return images without tokens as fallback
            return images
        }
    }

    public async getImageUrlFromPage(urlImg: string) {
        return urlImg
    }

    public isCurrentPageAChapterPage(doc: string) {
        // Check for presence of imgHttps or batoWord variables which are only on chapter pages
        return doc.includes("const imgHttps =") || doc.includes("const batoWord =")
    }
}
