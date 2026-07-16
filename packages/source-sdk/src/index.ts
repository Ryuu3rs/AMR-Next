export * from "./errors"
export * from "./registry"
export * from "./request"
export * from "./types"

export function matchesSourceDomain(hostname: string, domains: readonly string[]): boolean {
    const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "")

    return domains.some(domain => {
        const normalizedDomain = domain.toLowerCase().replace(/\.$/, "")

        if (normalizedDomain.startsWith("*.")) {
            return normalizedHostname.endsWith(`.${normalizedDomain.slice(2)}`)
        }

        return normalizedHostname === normalizedDomain
    })
}

// Named HTML entities beyond the handful (amp/lt/gt/quot/apos/nbsp) every adapter used
// to hand-roll. This is the full HTML4/ISO-8859-1 "Latin-1 supplement" block plus the
// common typographic entities - a small, stable, well-known table (unchanged since
// HTML 2.0) that covers the accented characters that actually show up in real
// manga/manhwa/manhua titles (e.g. "Fianc&eacute;e" -> "Fiancée"). It is intentionally
// NOT the full HTML5 named-entity set (2000+ entries, includes MathML/emoji symbols
// that never appear in scraped titles) - this is a deliberately incomplete-but-much-
// improved fix, not a claim of exhaustive HTML5 coverage.
const NAMED_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    iexcl: "¡",
    cent: "¢",
    pound: "£",
    curren: "¤",
    yen: "¥",
    brvbar: "¦",
    sect: "§",
    uml: "¨",
    copy: "©",
    ordf: "ª",
    laquo: "«",
    not: "¬",
    shy: "­",
    reg: "®",
    macr: "¯",
    deg: "°",
    plusmn: "±",
    sup2: "²",
    sup3: "³",
    acute: "´",
    micro: "µ",
    para: "¶",
    middot: "·",
    cedil: "¸",
    sup1: "¹",
    ordm: "º",
    raquo: "»",
    frac14: "¼",
    frac12: "½",
    frac34: "¾",
    iquest: "¿",
    Agrave: "À",
    Aacute: "Á",
    Acirc: "Â",
    Atilde: "Ã",
    Auml: "Ä",
    Aring: "Å",
    AElig: "Æ",
    Ccedil: "Ç",
    Egrave: "È",
    Eacute: "É",
    Ecirc: "Ê",
    Euml: "Ë",
    Igrave: "Ì",
    Iacute: "Í",
    Icirc: "Î",
    Iuml: "Ï",
    ETH: "Ð",
    Ntilde: "Ñ",
    Ograve: "Ò",
    Oacute: "Ó",
    Ocirc: "Ô",
    Otilde: "Õ",
    Ouml: "Ö",
    times: "×",
    Oslash: "Ø",
    Ugrave: "Ù",
    Uacute: "Ú",
    Ucirc: "Û",
    Uuml: "Ü",
    Yacute: "Ý",
    THORN: "Þ",
    szlig: "ß",
    agrave: "à",
    aacute: "á",
    acirc: "â",
    atilde: "ã",
    auml: "ä",
    aring: "å",
    aelig: "æ",
    ccedil: "ç",
    egrave: "è",
    eacute: "é",
    ecirc: "ê",
    euml: "ë",
    igrave: "ì",
    iacute: "í",
    icirc: "î",
    iuml: "ï",
    eth: "ð",
    ntilde: "ñ",
    ograve: "ò",
    oacute: "ó",
    ocirc: "ô",
    otilde: "õ",
    ouml: "ö",
    divide: "÷",
    oslash: "ø",
    ugrave: "ù",
    uacute: "ú",
    ucirc: "û",
    uuml: "ü",
    yacute: "ý",
    thorn: "þ",
    yuml: "ÿ",
    OElig: "Œ",
    oelig: "œ",
    Scaron: "Š",
    scaron: "š",
    Yuml: "Ÿ",
    fnof: "ƒ",
    circ: "ˆ",
    tilde: "˜",
    ensp: " ",
    emsp: " ",
    thinsp: " ",
    zwnj: "‌",
    zwj: "‍",
    lrm: "‎",
    rlm: "‏",
    ndash: "–",
    mdash: "—",
    lsquo: "‘",
    rsquo: "’",
    sbquo: "‚",
    ldquo: "“",
    rdquo: "”",
    bdquo: "„",
    dagger: "†",
    Dagger: "‡",
    bull: "•",
    hellip: "…",
    permil: "‰",
    prime: "′",
    Prime: "″",
    lsaquo: "‹",
    rsaquo: "›",
    oline: "‾",
    euro: "€",
    trade: "™",
    larr: "←",
    uarr: "↑",
    rarr: "→",
    darr: "↓"
}

// Decode HTML entities in scraped text (titles, descriptions) with no DOM available -
// adapters run in the MV3 background service worker, which has no `document`, so the
// usual detached-<textarea> decoding trick doesn't work here. Numeric entities
// (&#39; / &#x27;) are decoded programmatically; named entities are looked up in
// NAMED_ENTITIES above. This is the single shared decoder - source adapters should
// import this instead of hand-rolling their own regex chain.
export function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#0*(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&([a-zA-Z]+);/g, (full: string, name: string) => NAMED_ENTITIES[name] ?? full)
        .trim()
}
