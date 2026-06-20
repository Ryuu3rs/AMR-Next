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
    lastReadAt: z.number().int().nonnegative().optional(),
    manualTracking: z.boolean().optional(),
    categories: z.array(z.string().trim().min(1)).optional(),
    nsfw: z.boolean().optional(),
    notes: z.string().optional(),
    genres: z.array(z.string()).optional()
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
// Accepts both strict v1 format and legacy loose format for backward compatibility.
export const exportEnvelopeSchema = z
    .object({
        format: z.literal("all-mangas-reader"),
        version: z.literal(1),
        exportedAt: z.number().int().nonnegative().optional(),
        data: z.object({
            manga: z.array(libraryMangaSchema).optional(),
            sourceLinks: z.array(sourceLinkRecordSchema).optional(),
            chapters: z.array(chapterRecordSchema).optional(),
            progress: z.array(readingProgressSchema).optional(),
            historyEvents: z.array(historyEventSchema).optional()
        })
    })
    .passthrough()
    .transform(envelope => ({
        ...envelope,
        data: {
            manga: envelope.data.manga ?? [],
            sourceLinks: envelope.data.sourceLinks ?? [],
            chapters: envelope.data.chapters ?? [],
            progress: envelope.data.progress ?? [],
            historyEvents: envelope.data.historyEvents ?? []
        }
    }))

export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>
