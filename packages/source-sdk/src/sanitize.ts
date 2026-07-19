import { decodeHtmlEntities } from "./html"

// Shared sanitizer for text scraped out of markup (chapter labels, titles,
// search-result names). Adapters run in the MV3 background service worker with no
// DOM, so they regex title text straight out of an anchor's inner HTML. Plain
// tag-stripping only removes the tags themselves, not the text that sits INSIDE
// <style>/<script>/<time> elements - so a chapter row whose <a> wraps an inline
// SVG `<style>.st0{fill:#d3d629}</style>` and a trailing `<time>ISO</time>` used
// to leak the raw CSS rule and the ISO timestamp straight into the title (the
// weebcentral bug, commits a663f062 / 2101ee96).
//
// The fix generalized: strip <style>/<script>/<time> blocks CONTENT AND ALL, then
// strip the remaining tags, decode HTML entities, and collapse whitespace. In a
// title/label context a <time> element only ever carries a machine timestamp and
// a <style>/<script> only ever carries CSS/JS, so removing their contents is
// always the right call.
export function sanitizeScrapedText(html: string): string {
    const withoutBlocks = html
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<time\b[^>]*>[\s\S]*?<\/time>/gi, " ")
    const withoutTags = withoutBlocks.replace(/<[^>]+>/g, " ")
    return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim()
}
