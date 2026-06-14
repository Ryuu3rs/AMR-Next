import { z } from "zod"

import {
    chapterIdSchema,
    chapterRecordSchema,
    importExportEnvelopeSchema,
    mangaIdSchema,
    mangaRecordSchema,
    preferencesSchema,
    readingProgressSchema,
    sourceHealthSchema,
    sourceIdSchema,
    sourceLinkRecordSchema
} from "./domain"

const requestIdSchema = z.string().trim().min(1)

const requestBase = {
    requestId: requestIdSchema
}

export const runtimeMessageRequestSchema = z.discriminatedUnion("type", [
    z.object({ ...requestBase, type: z.literal("library.list") }).strict(),
    z.object({ ...requestBase, type: z.literal("manga.upsert"), manga: mangaRecordSchema }).strict(),
    z.object({ ...requestBase, type: z.literal("manga.remove"), mangaId: mangaIdSchema }).strict(),
    z
        .object({
            ...requestBase,
            type: z.literal("source-link.upsert"),
            sourceLink: sourceLinkRecordSchema
        })
        .strict(),
    z.object({ ...requestBase, type: z.literal("chapter.list"), mangaId: mangaIdSchema }).strict(),
    z.object({ ...requestBase, type: z.literal("progress.get"), mangaId: mangaIdSchema }).strict(),
    z.object({ ...requestBase, type: z.literal("progress.save"), progress: readingProgressSchema }).strict(),
    z.object({ ...requestBase, type: z.literal("preferences.get") }).strict(),
    z
        .object({
            ...requestBase,
            type: z.literal("preferences.update"),
            preferences: preferencesSchema.partial()
        })
        .strict(),
    z
        .object({
            ...requestBase,
            type: z.literal("source-health.get"),
            sourceId: sourceIdSchema.optional()
        })
        .strict(),
    z.object({ ...requestBase, type: z.literal("data.export") }).strict(),
    z
        .object({
            ...requestBase,
            type: z.literal("data.import"),
            envelope: importExportEnvelopeSchema,
            mode: z.enum(["merge", "replace"]).default("merge")
        })
        .strict()
])

export type RuntimeMessageRequest = z.infer<typeof runtimeMessageRequestSchema>
export type RuntimeMessageType = RuntimeMessageRequest["type"]

const successBase = {
    requestId: requestIdSchema,
    ok: z.literal(true)
}

const successfulResponseSchema = z.discriminatedUnion("type", [
    z
        .object({
            ...successBase,
            type: z.literal("library.list"),
            manga: z.array(mangaRecordSchema),
            sourceLinks: z.array(sourceLinkRecordSchema)
        })
        .strict(),
    z.object({ ...successBase, type: z.literal("manga.upsert"), manga: mangaRecordSchema }).strict(),
    z.object({ ...successBase, type: z.literal("manga.remove") }).strict(),
    z
        .object({
            ...successBase,
            type: z.literal("source-link.upsert"),
            sourceLink: sourceLinkRecordSchema
        })
        .strict(),
    z.object({ ...successBase, type: z.literal("chapter.list"), chapters: z.array(chapterRecordSchema) }).strict(),
    z
        .object({
            ...successBase,
            type: z.literal("progress.get"),
            progress: readingProgressSchema.nullable()
        })
        .strict(),
    z.object({ ...successBase, type: z.literal("progress.save"), progress: readingProgressSchema }).strict(),
    z.object({ ...successBase, type: z.literal("preferences.get"), preferences: preferencesSchema }).strict(),
    z.object({ ...successBase, type: z.literal("preferences.update"), preferences: preferencesSchema }).strict(),
    z
        .object({
            ...successBase,
            type: z.literal("source-health.get"),
            health: z.array(sourceHealthSchema)
        })
        .strict(),
    z.object({ ...successBase, type: z.literal("data.export"), envelope: importExportEnvelopeSchema }).strict(),
    z
        .object({
            ...successBase,
            type: z.literal("data.import"),
            imported: z
                .object({ manga: z.number().int().nonnegative(), chapters: z.number().int().nonnegative() })
                .strict()
        })
        .strict()
])

export const runtimeMessageErrorSchema = z
    .object({
        requestId: requestIdSchema,
        type: z.enum([
            "library.list",
            "manga.upsert",
            "manga.remove",
            "source-link.upsert",
            "chapter.list",
            "progress.get",
            "progress.save",
            "preferences.get",
            "preferences.update",
            "source-health.get",
            "data.export",
            "data.import"
        ]),
        ok: z.literal(false),
        error: z
            .object({
                code: z.enum(["INVALID_REQUEST", "NOT_FOUND", "CONFLICT", "SOURCE_UNAVAILABLE", "INTERNAL_ERROR"]),
                message: z.string().trim().min(1),
                details: z.record(z.string(), z.unknown()).optional()
            })
            .strict()
    })
    .strict()

export const runtimeMessageResponseSchema = z.union([successfulResponseSchema, runtimeMessageErrorSchema])

export type RuntimeMessageResponse = z.infer<typeof runtimeMessageResponseSchema>
export type RuntimeMessageError = z.infer<typeof runtimeMessageErrorSchema>
export type RuntimeMessageResponseFor<T extends RuntimeMessageType> = Extract<RuntimeMessageResponse, { type: T }>

export function parseRuntimeMessageRequest(value: unknown): RuntimeMessageRequest {
    return runtimeMessageRequestSchema.parse(value)
}

export function parseRuntimeMessageResponse(value: unknown): RuntimeMessageResponse {
    return runtimeMessageResponseSchema.parse(value)
}
