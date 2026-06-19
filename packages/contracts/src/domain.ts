import { z } from "zod"

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
