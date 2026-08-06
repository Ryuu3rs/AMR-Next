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
