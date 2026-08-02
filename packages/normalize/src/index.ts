// The canonical title-normalization rule shared by the extension and the metadata
// server. It MUST stay in lockstep with the extension's stored normalizedTitle
// (title.toLocaleLowerCase("en").replace(/\s+/g, " ").trim()) so title-keyed lookups
// agree across the client, the catalog, and persisted records. Do not change the rule
// without migrating every stored normalizedTitle.
export function normalizeTitle(s: string): string {
    return s.toLocaleLowerCase("en").replace(/\s+/g, " ").trim()
}
