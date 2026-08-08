// Vendored copy of the community-username rules from @amr/normalize. The community
// server is built in an ISOLATED Docker context (see ../Dockerfile: it copies only this
// app's package.json + src and runs npm install), so it cannot resolve the private
// @amr/normalize workspace package at build time. Keep this in lockstep with
// packages/normalize/src/index.ts - the extension enforces the same rule client-side, and
// register.test.ts guards the server behaviour. If you change one, change both.

export function normalizeUsername(s: string): string {
    return s.normalize("NFC").trim()
}

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

// Every code point must be a letter, number, combining mark (incl. VS16 U+FE0F), "_", "-",
// space, OR emoji (Extended_Pictographic, a ZWJ joiner U+200D, or a regional-indicator flag half).
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
