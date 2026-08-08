// The canonical title-normalization rule shared by the extension and the metadata
// server. It MUST stay in lockstep with the extension's stored normalizedTitle so
// title-keyed lookups agree across the client, the catalog, and persisted records.
//
// Normalizes to NFC and strips Unicode format characters (\p{Cf}: zero-width
// joiners/spaces, bidi overrides) before lowercasing and collapsing whitespace, so a
// source can't evade dedup by serving the same visible title in a different Unicode
// form (NFD vs NFC, an injected U+200B, a bidi-override wrapper). We deliberately do
// NOT strip \p{Cc} (control chars) here: it includes tab/newline/CR, and stripping
// those before the \s+ collapse would fuse two words ("a\tb" -> "ab") instead of
// joining them with a single space. This is a pure function.
export function normalizeTitle(s: string): string {
    return s
        .normalize("NFC")
        .replace(/\p{Cf}/gu, "")
        .toLocaleLowerCase("en")
        .replace(/\s+/g, " ")
        .trim()
}

// Canonical community-username normalization + validation, shared by the extension
// (client-side zod refinement) and the community server (register route) so both agree
// on exactly which names are legal. Unlike normalizeTitle this keeps the visible content
// intact: usernames are stored/displayed as the user typed them (NFC + trimmed), so we do
// NOT lowercase or strip emoji/marks here.

// NFC-normalize and trim only. Used for both storage/display and as the basis for validation.
export function normalizeUsername(s: string): string {
    return s.normalize("NFC").trim()
}

// Lowercased reserved names nobody may register. Checked against an ASCII-casefolded,
// separator-stripped form of the candidate (see validateUsername) so "Admin", "a d m i n"
// and "a_d_m_i_n" all collapse onto "admin".
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
    "admin",
    "administrator",
    "root",
    "superuser",
    "sysadmin",
    "mod",
    "mods",
    "moderator",
    "staff",
    "official",
    "support",
    "help",
    "system",
    "owner",
    "amr",
    "amrnext",
    "allmangasreader",
    "anonymous",
    "null",
    "undefined",
    "none",
    "me",
    "you",
    "everyone",
    "server",
    "bot"
])

// U+200D ZERO WIDTH JOINER: a \p{Cf} format char, but required between emoji in ZWJ
// sequences (e.g. the family emoji), so it is the one format char we tolerate (used as a
// literal in ALLOWED_CHARSET and FORBIDDEN_INVISIBLES below).

// Every code point must be a letter, number, combining mark (incl. VS16 U+FE0F), "_", "-",
// space, OR emoji (Extended_Pictographic, a ZWJ joiner, or a regional-indicator flag half).
const ALLOWED_CHARSET = /^(?:[\p{L}\p{N}\p{M}_\- ]|\p{Extended_Pictographic}|‍|[\u{1F1E6}-\u{1F1FF}])+$/u

// Control chars, or format chars other than ZWJ (bidi overrides, ZWSP/ZWNJ, BOM, ...).
const FORBIDDEN_INVISIBLES = /[\p{Cc}]|(?!‍)[\p{Cf}]/u

export function validateUsername(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
    const value = raw.normalize("NFC").trim()

    if (FORBIDDEN_INVISIBLES.test(value)) return { ok: false, reason: "invalid characters" }

    const cps = [...value]
    if (cps.length < 2 || cps.length > 30) return { ok: false, reason: "must be 2-30 characters" }

    if (!ALLOWED_CHARSET.test(value)) return { ok: false, reason: "invalid characters" }

    const bare = value.replace(/[\s_-]+/g, "")
    if (bare.length === 0) return { ok: false, reason: "must contain a letter, number, or emoji" }

    const key = value.toLocaleLowerCase("en")
    if (RESERVED_USERNAMES.has(key) || RESERVED_USERNAMES.has(key.replace(/[\s_-]+/g, ""))) {
        return { ok: false, reason: "that name is reserved" }
    }

    return { ok: true, value }
}
