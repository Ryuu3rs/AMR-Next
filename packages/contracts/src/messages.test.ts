import { describe, expect, it } from "vitest"

import { parseRuntimeMessageRequest, parseRuntimeMessageResponse, runtimeMessageRequestSchema } from "./messages"

describe("runtime message contracts", () => {
    it("parses a valid request and applies import defaults", () => {
        const request = parseRuntimeMessageRequest({
            requestId: "request-1",
            type: "data.import",
            envelope: {
                format: "all-mangas-reader",
                version: 1,
                exportedAt: 100,
                data: {
                    manga: [],
                    sourceLinks: [],
                    chapters: [],
                    pages: [],
                    progress: [],
                    preferences: {},
                    sourceHealth: []
                }
            }
        })

        expect(request.type).toBe("data.import")
        if (request.type === "data.import") {
            expect(request.mode).toBe("merge")
        }
    })

    it("rejects malformed and unknown requests", () => {
        expect(runtimeMessageRequestSchema.safeParse({ requestId: "", type: "library.list" }).success).toBe(false)
        expect(runtimeMessageRequestSchema.safeParse({ requestId: "request-1", type: "unknown" }).success).toBe(false)
        expect(
            runtimeMessageRequestSchema.safeParse({
                requestId: "request-1",
                type: "manga.remove",
                mangaId: "manga-1",
                extra: true
            }).success
        ).toBe(false)
    })

    it("parses typed success and error responses", () => {
        expect(
            parseRuntimeMessageResponse({
                requestId: "request-1",
                type: "chapter.list",
                ok: true,
                chapters: []
            })
        ).toMatchObject({ ok: true, type: "chapter.list" })

        expect(
            parseRuntimeMessageResponse({
                requestId: "request-2",
                type: "progress.save",
                ok: false,
                error: {
                    code: "NOT_FOUND",
                    message: "Chapter not found"
                }
            })
        ).toMatchObject({ ok: false, type: "progress.save" })
    })

    it("rejects a response payload for the wrong operation", () => {
        expect(() =>
            parseRuntimeMessageResponse({
                requestId: "request-1",
                type: "preferences.get",
                ok: true,
                chapters: []
            })
        ).toThrow()
    })
})
