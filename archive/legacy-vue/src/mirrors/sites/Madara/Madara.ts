import { BaseMirror } from "../abstract/BaseMirror"
import { JsonOptions, MirrorHelper } from "../../MirrorHelper"
import { MirrorImplementation, MirrorObject } from "../../../types/common"
import { debug } from "../../../core/debug"

export const defaultOptions = {
    search_url: "",
    search_a_sel: "div.post-title > h4 > a",
    chapters_a_sel: "li.wp-manga-chapter > a",
    page_container_sel: "div.reading-content",
    img_sel: "div.reading-content img",
    path_length: 2,
    search_json: true,
    chapter_list_ajax: false,
    chapter_list_ajax_selctor: "manga",
    chapter_list_ajax_selctor_type: "variable",
    title_selector: "div.post-title > h1",
    img_src: "src",
    secondary_img_src: "data-src",
    add_list_to_chapter_url: true,
    sort_chapters: false,
    isekai_chapter_url: false,
    image_protection_plugin: false,
    urlProcessor: url => url,
    chapterInformationsSeriesName: (doc, url) => undefined,
    chapterInformationsSeriesUrl: (doc, url) => null,
    doBefore: () => {}
}

export class Madara extends BaseMirror implements MirrorImplementation {
    canListFullMangas = false

    chapter_url: RegExp
    domains: string[]
    home: string
    languages: string
    mirrorIcon: string
    mirrorName: string
    disabled: boolean | undefined
    disabledForSearch: boolean | undefined

    protected readonly options: typeof defaultOptions

    constructor(mirrorHelper: MirrorHelper, mirror: MirrorObject, options: Partial<typeof defaultOptions> = {}) {
        super(mirrorHelper)

        this.mirrorName = mirror.mirrorName
        this.mirrorIcon = mirror.mirrorIcon
        this.domains = mirror.domains
        this.home = mirror.home
        this.chapter_url = mirror.chapter_url
        this.languages = mirror.languages
        this.disabled = mirror.disabled
        this.disabledForSearch = mirror.disabledForSearch

        this.options = {
            ...defaultOptions,
            search_url: mirror.home,
            ...options
        }
    }

    async getMangaList(search) {
        const searchApiUrl = this.options.search_url + "wp-admin/admin-ajax.php"
        const res = []

        if (this.options.search_json) {
            const urlSearchParams = new URLSearchParams({
                action: "wp-manga-search-manga",
                title: search
            })

            const jsonData = await this.mirrorHelper.loadJson(searchApiUrl, {
                nocache: true,
                method: "POST",
                data: urlSearchParams
            } as JsonOptions)

            // Add null check - jsonData.data can be undefined if site returns error/HTML
            if (!jsonData?.data) {
                return res
            }
            return jsonData.data.map(item => [item.title, item.url])
        }

        // Load search page
        const urlManga = this.options.search_url + "?s=" + search + "&post_type=wp-manga"
        const doc = await this.mirrorHelper.loadPage(urlManga, { nocache: true, preventimages: true })
        const self = this

        const $ = this.parseHtml(doc)

        $(this.options.search_a_sel).each(function () {
            res[res.length] = [$(this).text(), self.options.urlProcessor($(this).attr("href"))]
        })
        return res
    }

    async getListChaps(urlManga, htmlContent?: string) {
        // Use provided HTML content if available (for Cloudflare-protected sites)
        // Otherwise, make a request (may fail on protected sites)
        let doc: string
        if (htmlContent) {
            debug.mirrors.debug("Madara getListChaps using provided htmlContent, length:", htmlContent.length)
            doc = htmlContent
        } else {
            debug.mirrors.debug("Madara getListChaps fetching page:", urlManga)
            doc = await this.mirrorHelper.loadPage(urlManga, { nocache: true, preventimages: true })
        }
        const _self = this

        let $ = this.parseHtml(doc)

        const mangaName = $(this.options.search_a_sel, doc).text().trim()

        if (this.options.chapter_list_ajax) {
            let searchApiUrl = this.options.search_url + "wp-admin/admin-ajax.php"
            let mangaVar

            if (this.options.isekai_chapter_url)
                searchApiUrl = (urlManga.endsWith("/") ? urlManga : urlManga + "/") + "ajax/chapters/"

            if (this.options.chapter_list_ajax_selctor_type == "variable") {
                mangaVar = this.getVariable({ variableName: this.options.chapter_list_ajax_selctor, doc }).manga_id
            } else {
                mangaVar = $(this.options.chapter_list_ajax_selctor).attr("data-id")
            }

            doc = await this.mirrorHelper.loadPage(searchApiUrl, {
                nocache: true,
                preventimages: true,
                post: true,
                data: new URLSearchParams({
                    action: "manga_get_chapters",
                    manga: mangaVar
                })
            })
        }

        $ = this.parseHtml(doc)

        const res = []
        $(this.options.chapters_a_sel).each(function () {
            let chapterName = $(this).text()
            const stringsToStrip = [
                mangaName,
                $(".chapter-release-date", this).text(),
                $(".view", this).text(),
                $(".chapterdate", this).text()
            ]

            stringsToStrip.forEach(x => (chapterName = chapterName.replace(x, "")))

            if (chapterName !== "") {
                res.push([
                    chapterName.trim(),
                    _self.options.urlProcessor(_self.makeChapterUrl($(this).attr("href"))) // add ?style=list to load chapter in long strip mode, remove it if it already there and add it again,
                ])
            }
        })

        if (this.options.sort_chapters) {
            res.sort((a, b) => {
                const aM = a[0]
                    .replace(/chapter/gi, "")
                    .replace(/volume/gi, "")
                    .replace(/chap/gi, "")
                    .replace(/volume/gi, "")
                const bM = b[0]
                    .replace(/chapter/gi, "")
                    .replace(/volume/gi, "")
                    .replace(/chap/gi, "")
                    .replace(/volume/gi, "")
                if (aM && bM) {
                    return parseFloat(aM) > parseFloat(bM) ? -1 : 1
                }
                return 0
            })
        }

        return res
    }

    async getCurrentPageInfo(doc, curUrl) {
        const url = new URL(this.options.urlProcessor(curUrl))
        const path = url.pathname
        const pathSplitted = path.split("/").filter(p => p != "")
        const mangaPath = pathSplitted.slice(0, this.options.path_length)
        const initialMangaUrl = url.origin + "/" + mangaPath.join("/") + "/"
        const mangaurl = this.options.chapterInformationsSeriesUrl(doc, curUrl) || initialMangaUrl
        let mgname = this.options.chapterInformationsSeriesName(doc, curUrl)

        let $ = this.parseHtml(doc)
        if (mgname === undefined || mgname.trim() === "") {
            const query = $(
                `a[href="${mangaurl}"]:not(:contains("Manga Info")):not(:contains("Novel Info")):not(:contains("Series Info"))`,
                doc
            )
            if (query.length > 0) {
                mgname = query.first().text().trim()
            }
        }

        if (mgname === undefined || mgname.trim() === "") {
            const docmg = await this.mirrorHelper.loadPage(mangaurl)
            $ = this.parseHtml(docmg)
            mgname = $("div.post-title > h3").text().trim()
            if (mgname === undefined || mgname.trim() === "") {
                mgname = $(this.options.title_selector).text().trim()
            }
        }
        return {
            name: mgname,
            currentMangaURL: mangaurl,
            currentChapterURL: this.options.urlProcessor(this.makeChapterUrl(curUrl))
        }
    }

    async getListImages(doc, curUrl): Promise<string[]> {
        if (this.options.image_protection_plugin) {
            const images = await this.protectedGetListImages(doc)
            if (images.length > 0) {
                return images
            }
        }
        const res = []
        const _self = this

        const preloadImages = await this.getVariable({ variableName: "chapter_preloaded_images", doc })
        if (preloadImages !== undefined) {
            return preloadImages
        }
        const $ = this.parseHtml(doc)

        // Try configured selector first
        $(this.options.img_sel).each(function () {
            let img = $(this).attr(_self.options.img_src)
            if (_self.options.hasOwnProperty("secondary_img_src") && img === undefined) {
                img = $(this).attr(_self.options.secondary_img_src)
            }
            // Trim whitespace from image URLs (tabs/newlines from HTML formatting)
            if (img) res.push(img.trim())
        })

        // If no images found, try alternative selectors common in Madara-based sites
        if (res.length === 0) {
            const alternativeSelectors = [
                "div.read-container img",
                "div.entry-content img",
                ".reading-content img",
                ".chapter-content img",
                "#chapter-content img",
                ".wp-manga-chapter-img",
                ".page-break img",
                "img.wp-manga-chapter-img"
            ]
            for (const selector of alternativeSelectors) {
                $(selector).each(function () {
                    let img = $(this).attr("src") || $(this).attr("data-src") || $(this).attr("data-lazy-src")
                    // Trim whitespace from image URLs
                    if (img) res.push(img.trim())
                })
                if (res.length > 0) break
            }
        }

        debug.mirrors.debug("Madara getListImages returning " + res.length + " images")
        return res
    }

    async protectedGetListImages(doc): Promise<string[]> {
        const chapter_data = await this.getVariable({ variableName: "chapter_data", doc })
        const wpmangaprotectornonce = await this.getVariable({ variableName: "wpmangaprotectornonce", doc })

        if (!chapter_data || !wpmangaprotectornonce) {
            return []
        }

        const crypto = this.mirrorHelper.crypto

        const CryptoJSAesJson = {
            stringify: function (_0x8f41x2) {
                const _0x8f41x3: Record<string, unknown> = { ct: _0x8f41x2.ciphertext.toString(crypto.enc.Base64) }
                if (_0x8f41x2.iv) {
                    _0x8f41x3.iv = _0x8f41x2.iv.toString()
                }
                if (_0x8f41x2.salt) {
                    _0x8f41x3.s = _0x8f41x2.salt.toString()
                }
                return JSON.stringify(_0x8f41x3)
            },
            parse: function (_0x8f41x4) {
                const _0x8f41x5 = JSON.parse(_0x8f41x4)
                const _0x8f41x2 = crypto.lib.CipherParams.create({
                    ciphertext: crypto.enc.Base64.parse(_0x8f41x5.ct)
                })
                if (_0x8f41x5.iv) {
                    _0x8f41x2.iv = crypto.enc.Hex.parse(_0x8f41x5.iv)
                }
                if (_0x8f41x5.s) {
                    _0x8f41x2.salt = crypto.enc.Hex.parse(_0x8f41x5.s)
                }
                return _0x8f41x2
            }
        }

        const chapter_data_2 = JSON.parse(
            JSON.parse(
                crypto.AES.decrypt(chapter_data, wpmangaprotectornonce, { format: CryptoJSAesJson }).toString(
                    crypto.enc.Utf8
                )
            )
        )

        // console.debug('Chapter Data', chapter_data)
        // console.debug('Chapter Data Parsed', chapter_data_2, typeof chapter_data_2)
        return chapter_data_2
    }

    async getImageUrlFromPage(urlImg) {
        return urlImg
    }

    isCurrentPageAChapterPage(doc, curUrl) {
        debug.mirrors.trace("Madara isCurrentPageAChapterPage called for:", curUrl)
        debug.mirrors.trace("Madara doc length:", doc?.length || 0)
        debug.mirrors.trace("Madara page_container_sel:", this.options.page_container_sel)

        // Check for configured selector first
        const configuredResult = this.queryHtml(doc, this.options.page_container_sel)
        debug.mirrors.trace("Madara configured selector result:", configuredResult.length)
        if (configuredResult.length > 0) {
            debug.mirrors.debug("Madara Found page container with configured selector")
            return true
        }
        // Also check for common alternative selectors used by Madara-based sites
        // as site structures often change over time
        const alternativeSelectors = [
            "div.read-container",
            "div.entry-content",
            "div.c-blog-post",
            ".reading-content",
            ".chapter-content",
            "#chapter-content",
            ".wp-manga-chapter-img",
            ".page-break img"
        ]
        for (const selector of alternativeSelectors) {
            const result = this.queryHtml(doc, selector)
            debug.mirrors.trace(`Madara selector "${selector}" result:`, result.length)
            if (result.length > 0) {
                debug.mirrors.debug("Madara Found page container with alternative selector:", selector)
                return true
            }
        }
        debug.mirrors.debug("Madara No page container found, returning false")
        // Log a snippet of the doc to help debug
        debug.mirrors.trace("Madara doc snippet (first 500 chars):", doc?.substring(0, 500))
        return false
    }

    makeChapterUrl(url) {
        const t = new URL(url)
        return this.stripLastSlash(t.origin + t.pathname) + (this.options.add_list_to_chapter_url ? "?style=list" : "")
    }

    stripLastSlash(url) {
        if (url.substring(url.length - 1) == "/") {
            url = url.substring(0, url.length - 1)
        }
        return url
    }
}
