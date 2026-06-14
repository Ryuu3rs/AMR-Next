import { BaseMirror } from "./abstract/BaseMirror"
import { MirrorImplementation } from "../../types/common"
import { MirrorHelper } from "../MirrorHelper"
import Dm5Icon from "../icons/dm5-optimized.png"
import { debug } from "../../core/debug"

export class Dm5 extends BaseMirror implements MirrorImplementation {
    constructor(amrLoader: MirrorHelper) {
        super(amrLoader)
    }

    mirrorName = "DM5"
    canListFullMangas = false
    mirrorIcon = Dm5Icon
    languages = "cn"
    domains = ["dm5.com"]
    home = "https://www.dm5.com"
    chapter_url = /^\/m[0-9]+\/$/g

    async getMangaList(search: string) {
        const doc = await this.mirrorHelper.loadPage(
            this.home + "/search.ashx?d=" + new Date().getTime() + "&t=" + search + "&language=1",
            {
                nocache: true,
                preventimages: true
            }
        )

        const res = []
        const _self = this
        const $ = this.parseHtml(doc)

        $("li").each(function () {
            let url = $(this).attr("onclick")
            const st = url.indexOf("'"),
                en = url.lastIndexOf("'")
            url = url.substring(st + 1, en)
            if ($(this).attr("value") !== "0") {
                res[res.length] = [$(".left", $(this)).text(), _self.home + url]
            }
        })
        return res
    }

    async getListChaps(urlManga) {
        let doc = await this.mirrorHelper.loadPage(urlManga, { nocache: true, preventimages: true })
        let $ = this.parseHtml(doc)
        if ($("#checkAdult", doc).length > 0) {
            // pass adult test
            this.mirrorHelper.setCookie({
                // set the cookie on dm5 domain
                name: "isAdult",
                value: "1",
                path: "/",
                url: urlManga,
                domain: "www.dm5.com",
                expirationDate: new Date().getTime() + 24 * 60 * 60 * 1000
            })
            doc = await this.mirrorHelper.loadPage(urlManga, {
                // and reload the page
                nocache: true,
                preventimages: true
            })
            $ = this.parseHtml(doc)
        }

        let res = []
        const _self = this

        $("#chapterlistload li > a").each(function (index) {
            $("span", $(this)).remove()
            let name = $(this).text()
            if ($(".title", $(this)).length > 0) name = $(".title", $(this)).text()
            res[res.length] = [name, _self.home + $(this).attr("href")]
        })
        if ($("#chapterlistload .cover", doc).length > 0) res = res.reverse()
        return res
    }

    async getCurrentPageInfo(doc, curUrl) {
        const $ = this.parseHtml(doc)
        const mg = $(".view-header-2 .title a[href!='/']")
        return {
            name: mg.attr("title"),
            currentMangaURL: this.home + mg.attr("href"),
            currentChapterURL: this.home + this.mirrorHelper.getVariableFromScript("DM5_CURL", doc)
        }
    }

    async getListImages(doc, curUrl) {
        const $ = this.parseHtml(doc)
        const res = []

        // First try to get images from the DOM (if they're already loaded)
        $("img.load-src").each(function () {
            const src = $(this).attr("data-src")
            if (src) res.push(src)
        })

        // If we found images in DOM, return them
        if (res.length > 0) {
            debug.mirrors.debug("Dm5 Found " + res.length + " images in DOM")
            return res
        }

        // Otherwise, use the chapterfun.ashx API to get images
        debug.mirrors.debug("Dm5 No images in DOM, using chapterfun.ashx API")

        const lastpage = parseInt(this.mirrorHelper.getVariableFromScript("DM5_IMAGE_COUNT", doc)) || 0
        const curl = this.mirrorHelper.getVariableFromScript("DM5_CURL", doc)
        const cid = this.mirrorHelper.getVariableFromScript("DM5_CID", doc)
        const mid = this.mirrorHelper.getVariableFromScript("DM5_MID", doc)
        const dt = this.mirrorHelper.getVariableFromScript("DM5_VIEWSIGN_DT", doc)
        const sign = this.mirrorHelper.getVariableFromScript("DM5_VIEWSIGN", doc)

        debug.mirrors.debug("Dm5 Chapter info:", { cid, mid, pages: lastpage })

        if (!cid || !lastpage) {
            debug.mirrors.error("Dm5 Missing required variables")
            return res
        }

        // Get the dm5_key from the page (may be empty)
        let mkey = ""
        if ($("#dm5_key").length > 0) {
            mkey = $("#dm5_key").val()?.toString() || ""
        }
        // Also try to extract from packed script
        if (!mkey) {
            const keyMatch = doc.match(/\$\("#dm5_key"\)\.val\(([^)]+)\)/)
            if (keyMatch) {
                // Try to extract from eval script
                const evalMatch = doc.match(/eval\(function\(p,a,c,k,e,d\)[^}]+\}[^']*'([^']+)'/)
                if (evalMatch) {
                    const packed = evalMatch[0]
                    mkey = this.extractKeyFromPacked(packed)
                }
            }
        }

        // Fetch all pages using the API
        for (let page = 1; page <= lastpage; page++) {
            const chapfunurl = this.home + curl + "chapterfun.ashx"
            const params = {
                cid: cid,
                page: page,
                key: mkey,
                language: 1,
                gtk: 6,
                _cid: cid,
                _mid: mid,
                _dt: dt,
                _sign: sign
            }

            try {
                const data = await this.mirrorHelper.loadJson(chapfunurl, {
                    data: params,
                    nocontenttype: true,
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    referrer: curUrl || this.home + curl
                })

                if (data) {
                    const imageUrl = this.unpackChapterFun(data.toString())
                    if (imageUrl) {
                        res.push(imageUrl)
                    }
                }
            } catch (e) {
                debug.mirrors.error("Dm5 Error fetching page " + page + ":", e)
            }

            // Small delay to avoid rate limiting
            if (page < lastpage) {
                await new Promise(resolve => setTimeout(resolve, 50))
            }
        }

        debug.mirrors.debug("Dm5 Fetched " + res.length + " images via API")
        return res
    }

    /**
     * Extract dm5_key from packed JavaScript
     */
    private extractKeyFromPacked(packed: string): string {
        try {
            const unpacked = this.unpackScript(packed)
            if (unpacked) {
                // Look for guidkey or wocgfd2r3gsg pattern
                const keyMatch =
                    unpacked.match(/guidkey\s*=\s*['"]([^'"]+)['"]/) ||
                    unpacked.match(/var\s+\w+\s*=\s*['"]([a-f0-9]{16,})['"]/)
                if (keyMatch) {
                    return keyMatch[1]
                }
            }
        } catch (e) {
            debug.mirrors.error("Dm5 Error extracting key:", e)
        }
        return ""
    }

    /**
     * Unpack the chapterfun.ashx response and extract image URL
     */
    private unpackChapterFun(data: string): string | null {
        try {
            const unpacked = this.unpackScript(data)
            if (!unpacked) return null

            // Extract variables from unpacked script
            const cidMatch = unpacked.match(/cid\s*=\s*(\d+)/)
            const keyMatch = unpacked.match(/key\s*=\s*['"]([^'"]+)['"]/)
            const pixMatch = unpacked.match(/pix\s*=\s*["']([^"']+)["']/)
            const pvalueMatch = unpacked.match(/pvalue\s*=\s*\[([^\]]+)\]/)

            if (pixMatch && pvalueMatch) {
                const pix = pixMatch[1]
                // Parse the pvalue array
                const pvalueStr = pvalueMatch[1]
                const imgMatch = pvalueStr.match(/["']([^"']+)["']/)
                if (imgMatch) {
                    const imgPath = imgMatch[1]
                    const cid = cidMatch ? cidMatch[1] : ""
                    const key = keyMatch ? keyMatch[1] : ""
                    return pix + imgPath + "?cid=" + cid + "&key=" + key
                }
            }
        } catch (e) {
            debug.mirrors.error("Dm5 Error unpacking chapterfun:", e)
        }
        return null
    }

    /**
     * Unpack p,a,c,k,e,d packed JavaScript
     */
    private unpackScript(packed: string): string | null {
        try {
            // Parse the packed script arguments
            const regexpargs = /'(([^\\']|\\')*)',\s*(\d+),\s*(\d+),\s*'(([^\\']|\\')*)'/
            const match = packed.match(regexpargs)
            if (!match) return null

            const p = match[1]
            const a = parseInt(match[3])
            const c = parseInt(match[4])
            const k = match[5].split("|")

            // Unpack function
            const unpack = (p: string, a: number, c: number, k: string[]): string => {
                const e = (c: number): string => {
                    return (
                        (c < a ? "" : e(Math.floor(c / a))) +
                        ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36))
                    )
                }

                const d: { [key: string]: string } = {}
                while (c--) {
                    d[e(c)] = k[c] || e(c)
                }

                return p.replace(/\b\w+\b/g, match => d[match] || match)
            }

            return unpack(p, a, c, k).replace(/\\'/g, "'")
        } catch (e) {
            debug.mirrors.error("Dm5 Error in unpackScript:", e)
            return null
        }
    }

    isCurrentPageAChapterPage(doc, curUrl) {
        //return this.queryHtml(doc, "#cp_img").length > 0
        // Reset lastIndex to avoid issues with global regex flag
        this.chapter_url.lastIndex = 0
        return this.chapter_url.test(new URL(curUrl).pathname)
    }

    async getImageUrlFromPage(urlImage: string): Promise<string> {
        // Images are now returned as full URLs from getListImages
        return urlImage
    }
}
