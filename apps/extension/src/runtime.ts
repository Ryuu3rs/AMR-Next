import { z } from "zod"

export const runtimeRequestSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("library:list") }),
    z.object({ type: z.literal("library:remove"), mangaId: z.string().min(1) }),
    z.object({ type: z.literal("library:rate"), mangaId: z.string().min(1), rating: z.number().int().min(0).max(5) }),
    z.object({ type: z.literal("stats:get") }),
    z.object({ type: z.literal("data:export") }),
    z.object({ type: z.literal("data:import"), envelope: z.unknown() }),
    z.object({ type: z.literal("data:seed") }),
    z.object({ type: z.literal("manga:search"), query: z.string().min(1) }),
    z.object({ type: z.literal("manga:chapters"), mangaId: z.string().min(1) }),
    z.object({ type: z.literal("source:permission:check") }),
    z.object({ type: z.literal("updates:check") }),
    z.object({ type: z.literal("updates:get") }),
    z.object({ type: z.literal("page:current") }),
    z.object({ type: z.literal("page:capture"), url: z.url() }),
    z.object({ type: z.literal("reader:resolve"), url: z.url() }),
    z.object({ type: z.literal("reader:progress:get"), chapterId: z.string().min(1) }),
    z.object({
        type: z.literal("reader:progress"),
        mangaId: z.string().min(1),
        chapterId: z.string().min(1),
        pageIndex: z.number().int().nonnegative(),
        pageCount: z.number().int().positive(),
        completed: z.boolean()
    }),
    z.object({ type: z.literal("settings:get") }),
    z.object({
        type: z.literal("settings:update"),
        settings: z.object({
            autoAdd: z.boolean().optional(),
            readingMode: z.enum(["continuous", "single"]).optional(),
            readingDirection: z.enum(["ltr", "rtl", "vertical"]).optional(),
            pageFit: z.enum(["width", "height", "contain", "original"]).optional(),
            showPageNumber: z.boolean().optional(),
            preloadPages: z.number().int().min(0).max(10).optional(),
            theme: z.enum(["dark", "light"]).optional(),
            updateIntervalHours: z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(24)]).optional()
        })
    })
])

export type RuntimeRequest = z.infer<typeof runtimeRequestSchema>

export type RuntimeResponse<T = unknown> =
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string } }

export async function sendRuntimeMessage<T>(request: RuntimeRequest): Promise<T> {
    const response = (await browser.runtime.sendMessage(request)) as RuntimeResponse<T>

    if (!response.ok) {
        throw new Error(response.error.message)
    }

    return response.data
}
