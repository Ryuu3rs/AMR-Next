import { z } from "zod"

// Disable zod's JIT fastpass so its `allowsEval` capability probe (a swallowed
// `new Function("")` call) never runs. Under MV3's `script-src 'self'` CSP the
// probe throws (harmlessly, caught internally) but Chrome still logs a CSP
// violation to the console. Must run before any schema below is constructed —
// zod caches the probe result the first time an object schema is built.
// @amr/contracts sits at the root of the import graph (contracts -> source-sdk
// -> sources -> extension), so this is the earliest point every consumer
// passes through.
//
// Mutates `globalThis.__zod_globalConfig` directly instead of calling
// `z.config(...)`: zod's package.json declares `"sideEffects": false`, and
// bundlers (Vite/Rollup/Rolldown) tree-shake bare calls into that package
// whose return value is unused — verified empirically, `z.config({ jitless:
// true })` placed here was silently dropped from every built bundle. A direct
// assignment to a `globalThis` property can never be tree-shaken. See
// zod/src/v4/core/core.ts's `GlobalThisWithConfig` comment: this is the
// documented mechanism for pre-populating config before Zod's own module
// evaluates its `globalConfig` export.
//
// Exported (rather than an inline top-level statement only) so entrypoints
// that reach zod schemas without otherwise importing @amr/contracts first —
// currently only apps/extension/entrypoints/background.ts, which imports
// "@amr/contracts" for this side effect ahead of "@amr/sources" (whose
// packages/sources/src/mangadex.ts builds zod schemas directly) and
// "../src/runtime" (whose runtimeRequestSchema is only ever .parse()'d in the
// background context) — can rely on it running first via plain ES module
// import-evaluation order. apps/extension's app/popup/reader entrypoints
// don't need their own belt-and-braces call: their App.svelte components
// reach this module transitively through src/schema.ts before constructing
// any schema of their own, and apps/extension/src/runtime.ts's schema export
// is tree-shaken out of those bundles entirely since only the unrelated
// sendRuntimeMessage export is used there.
//
// Do NOT duplicate this statement body inline elsewhere. An earlier version
// repeated the raw `globalThis.__zod_globalConfig...jitless = true`
// assignment verbatim in another file. When both copies landed in the same
// bundle, the minifier's dead-store elimination treated the earlier write as
// a redundant no-op shadowed by the later identical one and dropped it —
// even though zod's `allowsEval` probe reads `.jitless` in between, via a
// cached closure the minifier doesn't trace into. That silently left the
// earlier schema construction unprotected. A second, separate experiment
// also found that adding an *extra* static import of this module into
// apps/extension/src/runtime.ts (even just to call this function) caused the
// bundler to drop this module's real, used content from the app/popup/reader
// bundles entirely — so runtime.ts intentionally does not import this file.
export function disableZodEvalProbe(): void {
    const zodConfigHost = globalThis as { __zod_globalConfig?: { jitless?: boolean } }
    zodConfigHost.__zod_globalConfig ??= {}
    zodConfigHost.__zod_globalConfig.jitless = true
}
disableZodEvalProbe()

const idSchema = z.string().trim().min(1)
const timestampSchema = z.number().int().nonnegative()
const httpUrlSchema = z
    .url()
    .refine(value => value.startsWith("http://") || value.startsWith("https://"), "Expected an HTTP(S) URL")

// Covers may be a remote HTTP(S) URL or an inlined data: image (cached locally to
// dodge hotlink/referer blocks that break <img> loads from the extension origin).
const coverUrlSchema = z
    .string()
    .trim()
    .min(1)
    .refine(
        value =>
            value.startsWith("http://") ||
            value.startsWith("https://") ||
            value.startsWith("data:image/") ||
            value.startsWith("/"),
        "Expected an HTTP(S), data:, or bundled image URL"
    )

export const mangaIdSchema = idSchema
export type MangaId = z.infer<typeof mangaIdSchema>

export const chapterIdSchema = idSchema
export type ChapterId = z.infer<typeof chapterIdSchema>

export const sourceIdSchema = idSchema
export type SourceId = z.infer<typeof sourceIdSchema>

export const mangaRecordSchema = z
    .object({
        id: mangaIdSchema,
        title: z.string().trim().min(1),
        normalizedTitle: z.string().trim().min(1),
        coverUrl: coverUrlSchema.optional(),
        description: z.string().optional(),
        rating: z.number().int().min(1).max(5).optional(),
        authors: z.array(z.string().trim().min(1)).default([]),
        status: z.enum(["unknown", "ongoing", "completed", "hiatus", "cancelled"]).default("unknown"),
        addedAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .strict()

export type MangaRecord = z.infer<typeof mangaRecordSchema>

export const sourceLinkRecordSchema = z
    .object({
        mangaId: mangaIdSchema,
        sourceId: sourceIdSchema,
        url: httpUrlSchema,
        sourceMangaId: z.string().trim().min(1).optional(),
        title: z.string().trim().min(1).optional(),
        language: z.string().trim().min(1).optional(),
        addedAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .strict()

export type SourceLinkRecord = z.infer<typeof sourceLinkRecordSchema>

export const chapterRecordSchema = z
    .object({
        id: chapterIdSchema,
        mangaId: mangaIdSchema,
        sourceId: sourceIdSchema,
        title: z.string().trim().min(1),
        url: httpUrlSchema,
        sortKey: z.number().finite(),
        chapterNumber: z.number().finite().nonnegative().optional(),
        volumeNumber: z.number().finite().nonnegative().optional(),
        language: z.string().trim().min(1).optional(),
        publishedAt: timestampSchema.optional(),
        fetchedAt: timestampSchema.optional()
    })
    .strict()

export type ChapterRecord = z.infer<typeof chapterRecordSchema>

export const readingProgressSchema = z
    .object({
        mangaId: mangaIdSchema,
        chapterId: chapterIdSchema,
        pageIndex: z.number().int().nonnegative(),
        pageCount: z.number().int().nonnegative(),
        completed: z.boolean(),
        updatedAt: timestampSchema
    })
    .strict()
    .refine(value => value.pageCount === 0 || value.pageIndex < value.pageCount, {
        message: "pageIndex must be within pageCount",
        path: ["pageIndex"]
    })

export type ReadingProgress = z.infer<typeof readingProgressSchema>
