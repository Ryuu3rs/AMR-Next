import { BaseMirror } from "./abstract/BaseMirror"
import { CurrentPageInfo, InfoResult, MirrorImplementation } from "../../types/common"
import { MirrorHelper } from "../MirrorHelper"
import MangaHereIcon from "../icons/mangahere-optimized.png"
import { extractListOfImages } from "../zjcdn"
import { debug } from "../../core/debug"

export class MangaHere extends BaseMirror implements MirrorImplementation {
    constructor(amrLoader: MirrorHelper) {
        super(amrLoader)
    }

    mirrorName = "Manga Here"
    canListFullMangas = false
    mirrorIcon = MangaHereIcon
    languages = "en"
    domains = ["www.mangahere.cc", "m.mangahere.cc", "www.mangahere.co", "mangahere.cc"]
    home = "https://www.mangahere.cc/"
    chapter_url = /\/manga\/.*\/.+\/.*/

    private baseUrl = "https://www.mangahere.cc"

    // Rate limiting to prevent server from returning empty responses
    // Using a proper queue pattern - each request waits for ALL previous requests to complete
    private static requestQueue: Promise<unknown> = Promise.resolve()
    private static readonly REQUEST_DELAY_MS = 250 // 250ms delay between requests

    async getMangaList(search: string) {
        const doc = await this.mirrorHelper.loadPage("https://www.mangahere.cc/search?title=" + search, {
            nocache: true,
            preventimages: true
        })

        const $ = this.parseHtml(doc)

        const res: InfoResult[] = []

        $(".line-list ul .manga-list-4-item-title > a").each(function () {
            res.push([$(this).text().trim(), "https://www.mangahere.cc" + $(this).attr("href")])
        })
        return res
    }

    async getListChaps(urlManga: string) {
        let doc = await this.mirrorHelper.loadPage(urlManga, { nocache: true, preventimages: true })

        let $ = this.parseHtml(doc)
        if ($("#checkAdult").length > 0) {
            this.mirrorHelper.setCookie({
                // set the cookie on fanfox domain
                name: "isAdult",
                value: "1",
                path: "/",
                url: urlManga,
                domain: "www.mangahere.cc",
                expirationDate: new Date().getTime() + 24 * 60 * 60 * 1000
            })
            doc = await this.mirrorHelper.loadPage(urlManga, { nocache: true, preventimages: true })
            $ = this.parseHtml(doc)
        }
        const res = []
        $(".detail-main-list a").each(function () {
            let url = "https://www.mangahere.cc" + $(this).attr("href")
            url = url.substr(0, url.lastIndexOf("/") + 1)
            res.push([$(".title3", $(this)).text(), url])
        })
        return res
    }

    async getCurrentPageInfo(doc: string, curUrl: string): Promise<CurrentPageInfo> {
        const mga = this.queryHtml(doc, ".reader-header-title-1 a")
        return {
            name: mga.text(),
            currentMangaURL: this.baseUrl + mga.attr("href"),
            currentChapterURL: curUrl.substr(0, curUrl.lastIndexOf("/") + 1)
        }
    }

    async getListImages(doc: string, curUrl: string) {
        // Check if we have embedded list of images - look for the specific pattern with newImgs array
        // The pattern is: eval(function...) containing 'newImgs' and 'zjcdn' URLs
        // We need to be careful not to match the dm5_key eval which only contains the key
        if (doc.includes("eval(function") && doc.includes("newImgs") && doc.includes("zjcdn")) {
            const result = await extractListOfImages(doc)
            // Only use extracted images if we got valid URLs, not garbage
            if (result && result.length > 0 && result[0].includes("//")) {
                return result
            }
        }

        const lastpage = this.getVariable({ variableName: "imagecount", doc }),
            curl = curUrl.substr(0, curUrl.lastIndexOf("/") + 1),
            res = []
        for (let i = 1; i <= lastpage; i++) {
            res.push(curl + i + ".html")
        }
        return res
    }

    async getImageUrlFromPage(urlImg: string) {
        // Relative schema url, pass it back.
        if (urlImg.startsWith("//") || urlImg.startsWith("https://zjcdn")) {
            return urlImg
        }

        // CRITICAL FIX: Add overall timeout to prevent indefinite hanging
        const TIMEOUT_MS = 20000 // 20 seconds per image URL extraction

        // Queue this request - wait for all previous requests to complete, then add delay
        // This serializes all requests to prevent rate limiting
        const previousRequest = MangaHere.requestQueue

        // Create the actual work function
        const doRequest = async (): Promise<string> => {
            // Wait for previous request to complete, but with timeout
            const waitTimeout = new Promise<void>(resolve => setTimeout(resolve, 5000))
            await Promise.race([previousRequest, waitTimeout])

            // Add delay between requests
            await new Promise(resolve => setTimeout(resolve, MangaHere.REQUEST_DELAY_MS))

            try {
                // loads the page containing the current scan
                const doc = await this.mirrorHelper.loadPage(urlImg, {
                    crossdomain: true,
                    redirect: "follow",
                    timeoutInMs: 15000 // 15 second timeout for page load
                })

                // Extract dm5_key from the HTML page
                // The key is embedded as a concatenated string like: \'\'+\'c\'+\'a\'+\'6\'+...+\'d\'
                let mkey = ""
                try {
                    // Method 1: Extract guidkey from concatenated string pattern
                    const keyRegex = /(?:\\'\w{0,1}\\'\+{0,1}){10,}/
                    const keyMatch = doc.match(keyRegex)
                    if (keyMatch) {
                        const unparsedKey = keyMatch[0]
                        mkey = unparsedKey.replace(/[\\'\+]/g, "")
                    }

                    // Method 2: If that fails, try to find the key in a script variable
                    if (!mkey) {
                        const guidkeyMatch = doc.match(/guidkey\s*=\s*['"]([a-f0-9]+)['"]/i)
                        if (guidkeyMatch) {
                            mkey = guidkeyMatch[1]
                        }
                    }

                    // Method 3: Try reading from #dm5_key input if it exists and has value
                    if (!mkey) {
                        const $ = this.parseHtml(doc)
                        const dm5KeyVal = $("#dm5_key").val()
                        if (dm5KeyVal && typeof dm5KeyVal === "string" && dm5KeyVal.length > 0) {
                            mkey = dm5KeyVal
                        }
                    }
                } catch (e) {
                    // Silent fail - key extraction is best-effort
                }

                const curl = urlImg.substr(0, urlImg.lastIndexOf("/") + 1)
                let cid, curpage
                try {
                    cid = this.getVariable({ doc, variableName: "chapterid" })
                    curpage = this.getVariable({ doc, variableName: "imagepage" })
                } catch (e) {
                    return "error"
                }

                const chapfunurl = curl + "chapterfun.ashx"
                const queryParams = new URLSearchParams({
                    cid: cid,
                    page: curpage,
                    key: mkey
                })

                const url = `${chapfunurl}?${queryParams}`
                const data = await this.mirrorHelper.loadPage(url, {
                    nocontenttype: true,
                    credentials: "include",
                    timeoutInMs: 10000 // 10 second timeout for chapterfun.ashx
                })

                // the retrieved data is packed through an obfuscator
                const unpack = function (p, a, c, k, e, d) {
                    e = function (c) {
                        return (
                            // @ts-ignore
                            (c < a ? "" : e(parseInt(c / a))) +
                            ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36))
                        )
                    }
                    if (!"".replace(/^/, String)) {
                        while (c--) d[e(c)] = k[c] || e(c)
                        k = [
                            function (e) {
                                return d[e]
                            }
                        ]
                        e = function () {
                            return "\\w+"
                        }
                        c = 1
                    }
                    while (c--) if (k[c]) p = p.replace(new RegExp("\\b" + e(c) + "\\b", "g"), k[c])
                    return p
                }

                // regexp to parse the arguments to pass to the unpack function
                const regexpargs = /'(([^\\']|\\')*)',([0-9]+),([0-9]+),'(([^\\']|\\')*)'/g
                const match = regexpargs.exec(data)

                if (match) {
                    let sc = unpack(match[1], match[3], match[4], match[5].split("|"), 0, {})
                    sc = sc.replace(/\\'/g, "'")

                    const pix = this.mirrorHelper.getVariableFromScript("pix", sc)
                    let pvalue = this.mirrorHelper.getVariableFromScript("pvalue", sc)

                    pvalue = pvalue.map(img => pix + img)
                    return pvalue[0]
                }
                return "error"
            } catch (e) {
                return "error"
            }
        }

        // Chain this request to the queue and return its result
        // Wrap in overall timeout to prevent indefinite hanging
        const requestPromise = doRequest()
        MangaHere.requestQueue = requestPromise.catch(() => {})

        const timeoutPromise = new Promise<string>(resolve => {
            setTimeout(() => {
                debug.mirrors.error("MangaHere getImageUrlFromPage timeout for:", urlImg?.substring(0, 60))
                resolve("error")
            }, TIMEOUT_MS)
        })

        return Promise.race([requestPromise, timeoutPromise])
    }

    isCurrentPageAChapterPage(doc, curUrl) {
        return this.queryHtml(doc, ".reader-main").length > 0
    }
}
