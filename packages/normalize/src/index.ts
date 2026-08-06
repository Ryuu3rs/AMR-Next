// The canonical title-normalization rule shared by the extension and the metadata
// server. It MUST stay in lockstep with the extension's stored normalizedTitle so
// title-keyed lookups agree across the client, the catalog, and persisted records.
//
// Normalizes to NFC and strips Unicode format/control characters (\p{Cf}\p{Cc},
// which covers zero-width joiners/spaces and bidi overrides) before lowercasing
// and collapsing whitespace, so a source can't evade dedup by serving the same
// visible title in a different Unicode form (NFD vs NFC, an injected U+200B, a
// bidi-override wrapper). This is a pure function.
export function normalizeTitle(s: string): string {
    return s
        .normalize("NFC")
        .replace(/[\p{Cf}\p{Cc}]/gu, "")
        .toLocaleLowerCase("en")
        .replace(/\s+/g, " ")
        .trim()
}
