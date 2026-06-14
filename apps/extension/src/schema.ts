// Validation schema for the import/export envelope as the extension actually
// stores it. This mirrors the runtime Dexie shape (LibraryManga + historyEvents),
// which is leaner than the aspirational contracts ImportExportEnvelope (no
// pages/preferences/sourceHealth tables here). Built from the contract record
// schemas so record-level rules stay shared.
import { chapterRecordSchema, mangaRecordSchema, readingProgressSchema, sourceLinkRecordSchema } from "@amr/contracts"
import { z } from "zod"

export const libraryMangaSchema = mangaRecordSchema.extend({
    sourceId: z.string().trim().min(1),
    sourceUrl: z.string(),
    sourceMangaId: z.string().trim().min(1).optional(),
    mangaUrl: z.string().optional(),
    latestChapterId: z.string().optional(),
    lastReadChapterId: z.string().optional(),
    latestChapterNumber: z.number().finite().optional(),
    lastReadChapterNumber: z.number().finite().optional(),
    lastReadAt: z.number().int().nonnegative().optional()
})

export const historyEventSchema = z.object({
    id: z.number().int().nonnegative().optional(),
    mangaId: z.string().trim().min(1),
    chapterId: z.string().trim().min(1),
    type: z.enum(["started", "completed"]),
    occurredAt: z.number().int().nonnegative()
})

// Envelope is intentionally non-strict on the data object so a future export with
// extra tables still imports (unknown keys are dropped, known tables validated).
export const exportEnvelopeSchema = z.object({
    format: z.literal("all-mangas-reader"),
    version: z.literal(1),
    exportedAt: z.number().int().nonnegative(),
    data: z.object({
        manga: z.array(libraryMangaSchema),
        sourceLinks: z.array(sourceLinkRecordSchema),
        chapters: z.array(chapterRecordSchema),
        progress: z.array(readingProgressSchema),
        historyEvents: z.array(historyEventSchema)
    })
})

export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>
