import { z } from "zod"

const idSchema = z.string().trim().min(1)
const timestampSchema = z.number().int().nonnegative()
const httpUrlSchema = z
    .url()
    .refine(value => value.startsWith("http://") || value.startsWith("https://"), "Expected an HTTP(S) URL")

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
        coverUrl: httpUrlSchema.optional(),
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

export const pageRecordSchema = z
    .object({
        chapterId: chapterIdSchema,
        index: z.number().int().nonnegative(),
        imageUrl: httpUrlSchema,
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional()
    })
    .strict()

export type PageRecord = z.infer<typeof pageRecordSchema>

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

export const preferencesSchema = z
    .object({
        theme: z.enum(["system", "light", "dark"]).default("system"),
        readingDirection: z.enum(["left-to-right", "right-to-left", "vertical"]).default("left-to-right"),
        pageFit: z.enum(["width", "height", "contain", "original"]).default("width"),
        preloadPages: z.number().int().min(0).max(20).default(2),
        showPageNumber: z.boolean().default(true),
        autoMarkCompleted: z.boolean().default(true)
    })
    .strict()

export type Preferences = z.infer<typeof preferencesSchema>

export const sourceHealthSchema = z
    .object({
        sourceId: sourceIdSchema,
        status: z.enum(["unknown", "healthy", "degraded", "unavailable"]),
        checkedAt: timestampSchema,
        responseTimeMs: z.number().finite().nonnegative().optional(),
        message: z.string().trim().min(1).optional(),
        consecutiveFailures: z.number().int().nonnegative().default(0)
    })
    .strict()

export type SourceHealth = z.infer<typeof sourceHealthSchema>

export const importExportDataSchema = z
    .object({
        manga: z.array(mangaRecordSchema),
        sourceLinks: z.array(sourceLinkRecordSchema),
        chapters: z.array(chapterRecordSchema),
        pages: z.array(pageRecordSchema),
        progress: z.array(readingProgressSchema),
        preferences: preferencesSchema,
        sourceHealth: z.array(sourceHealthSchema)
    })
    .strict()

export type ImportExportData = z.infer<typeof importExportDataSchema>

export const importExportEnvelopeSchema = z
    .object({
        format: z.literal("all-mangas-reader"),
        version: z.literal(1),
        exportedAt: timestampSchema,
        data: importExportDataSchema
    })
    .strict()

export type ImportExportEnvelope = z.infer<typeof importExportEnvelopeSchema>
