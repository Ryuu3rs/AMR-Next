// Must match the extension's normalizedTitle rule exactly (see apps/extension:
// title.toLocaleLowerCase("en").replace(/\s+/g, " ").trim()). Do not change this.
export function normalizeTitle(s: string): string {
    return s.toLocaleLowerCase("en").replace(/\s+/g, " ").trim()
}
