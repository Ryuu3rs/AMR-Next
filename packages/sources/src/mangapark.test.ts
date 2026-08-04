import { describe, expect, it } from "vitest"
import { extractMangaParkImages } from "./mangapark"

describe("mangapark extractMangaParkImages", () => {
    it("keeps short chapters/oneshots whose image array has only 1-2 pages", () => {
        // A hard >2 floor silently dropped every chapter with one or two pages. A two-page
        // oneshot embeds its pages under a normal "images" key, and both must survive.
        const pages = ["https://cdn.mangapark.io/a/1.webp", "https://cdn.mangapark.io/a/2.webp"]
        const data = { props: { pageProps: { chapter: { images: pages } } } }
        const html = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
            data
        )}</script></head><body></body></html>`

        expect(extractMangaParkImages(html)).toEqual(pages)
    })
})
