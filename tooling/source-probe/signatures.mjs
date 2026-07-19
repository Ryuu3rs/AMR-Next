// Shared detection signatures for the source-probe and source-health tools.
// Extracted from probe.mjs so both the mirror-candidate probe and the adapter
// health checker classify anti-scrape posture, CMS template, and hijack/parking
// landers with the same regexes. Kept dependency-free (plain regex tables) so it
// imports cleanly into both the .mjs probe and the tsx-run health tool.

// Browser-like request identity. Reused verbatim by both tools so a site that
// only serves real HTML to a browser UA is probed the same way everywhere.
export const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

export const BROWSER_HEADERS = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
}

// Anti-scrape / bot-wall markers. Presence means the origin is alive but gated -
// informational, not dead: the extension has a tab-injection fallback for these.
export const SIGNATURES = {
    cloudflare: /just a moment|cf_chl|challenge-platform|attention required.*cloudflare|cf-mitigated/i,
    turnstile: /challenges\.cloudflare\.com\/turnstile|cf-turnstile/i,
    ddosGuard: /ddos-guard/i,
    captcha: /hcaptcha|g-recaptcha|recaptcha\/api|captcha-delivery/i
}

// CMS/template family markers. Used to confirm a site still runs the engine its
// adapter was written against; their ABSENCE (plus an SPA marker) is the tell for
// an engine migration (WordPress/Madara -> Next.js/Astro, etc.).
export const CMS = {
    madara: /wp-manga|madara|manga_get_chapter_img_list|wp-manga-chapter-img/i,
    mangastream: /ts_reader|reader-area|id=["']readerarea["']/i,
    mangabuddy: /mangabuddy|chapter-images|chapterimages|loadchapter/i,
    wordpress: /wp-content|wp-includes/i,
    spa: /<div id=["']root["']|__next_data__|window\.__nuxt__|_next\/static|astro-island|data-astro/i
}

export const IMAGE_HINTS =
    /wp-manga-chapter-img|id=["']image-\d+|chapter_preloaded_images|ts_reader\.run|class=["'][^"']*reader-area/i

// Hijack / domain-parking / redirect-farm markers. When a manga domain lapses it
// is routinely re-registered as a registrar parking lander, a "domain for sale"
// page, or a casino/adult redirect farm. These fire on the LANDER body so a 200
// response that is really a parked page is caught instead of being treated as a
// live site. Split into named buckets so the report can say WHY it flagged.
export const HIJACK = {
    // Registrar / marketplace parking templates and "for sale" landers.
    domainForSale:
        /this domain (?:name )?is for sale|buy this domain|domain (?:may be|is) for sale|the domain .{0,40} is for sale|inquire about this domain|the owner of this domain has|domain parking/i,
    parkingProvider:
        /sedoparking|sedo\.com\/(?:search|caf)|dan\.com|undeveloped\.com|hugedomains|afternic|bodis\.com|parkingcrew|above\.com\/park|domainmarket|namebright|cashparking|domainsponsor|skenzo|smartname/i,
    // OpenResty / bare-nginx welcome pages a lapsed origin falls back to.
    parkedServer:
        /welcome to openresty|welcome to nginx|apache2 (?:ubuntu|debian) default page|default web page|this site is under construction|future home of something|coming soon.{0,30}(?:godaddy|domain)/i,
    // Casino / adult / popunder redirect farms squatted lapsed manga domains land on.
    adultCasinoRedirect:
        /\b(?:casino|slot gacor|sportsbook|baccarat|situs togel|judi bola|pragmatic play)\b|popunder|propellerads|juicyads|exoclick|trafficjunky|adsterra|best porn|free porn|xvideos/i
}

// Bounded streaming body read (mirrors probe.mjs so both tools cap memory the
// same way). Reads at most maxBytes of decoded text, then cancels the stream.
export async function readBoundedBody(res, maxBytes) {
    const reader = res.body?.getReader?.()
    if (!reader) return (await res.text()).slice(0, maxBytes)
    const decoder = new TextDecoder()
    let body = ""
    while (body.length < maxBytes) {
        const { done, value } = await reader.read()
        if (done) break
        body += decoder.decode(value, { stream: true })
    }
    await reader.cancel().catch(() => {})
    return body
}
