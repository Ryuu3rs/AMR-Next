/**
 * Tests for sync-operations module
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
    shouldSkipSync,
    shouldSyncToLocal,
    processUpdatesToLocal,
    processUpdatesToRemote
} from "../../src/amr/sync/sync-operations.ts"

// Mock the utils module
vi.mock("../../src/amr/sync/utils", () => ({
    DELETED: 1,
    FAIL_KEY: "_no_key_"
}))

describe("sync-operations", () => {
    describe("shouldSkipSync", () => {
        it("should return true for deleted manga", () => {
            const manga = { key: "test-key", ts: 1000, deleted: 1 }
            expect(shouldSkipSync(manga)).toBe(true)
        })

        it("should return true for manga with FAIL_KEY", () => {
            const manga = { key: "_no_key_", ts: 1000 }
            expect(shouldSkipSync(manga)).toBe(true)
        })

        it("should return false for normal manga", () => {
            const manga = { key: "test-key", ts: 1000 }
            expect(shouldSkipSync(manga)).toBe(false)
        })
    })

    describe("shouldSyncToLocal", () => {
        it("should return false when no local manga and remote is deleted", () => {
            const remoteManga = { key: "test", ts: 1000, deleted: 1 }
            expect(shouldSyncToLocal(null, remoteManga)).toBe(false)
        })

        it("should return true when no local manga and remote is not deleted", () => {
            const remoteManga = { key: "test", ts: 1000 }
            expect(shouldSyncToLocal(null, remoteManga)).toBe(true)
        })

        it("should return true when remote has newer timestamp", () => {
            const localManga = { key: "test", ts: 1000 }
            const remoteManga = { key: "test", ts: 2000 }
            expect(shouldSyncToLocal(localManga, remoteManga)).toBe(true)
        })

        it("should return false when local has newer or equal timestamp", () => {
            const localManga = { key: "test", ts: 2000 }
            const remoteManga = { key: "test", ts: 1000 }
            expect(shouldSyncToLocal(localManga, remoteManga)).toBe(false)
        })
    })

    describe("processUpdatesToLocal", () => {
        let mockLocalStorage

        beforeEach(() => {
            mockLocalStorage = {
                dispatch: vi.fn().mockResolvedValue(undefined),
                syncLocal: vi.fn()
            }
        })

        it("should delete local manga when remote is deleted", async () => {
            const localList = [{ key: "test", ts: 1000 }]
            const remoteList = [{ key: "test", ts: 1000, deleted: 1 }]

            await processUpdatesToLocal(mockLocalStorage, localList, remoteList)

            expect(mockLocalStorage.dispatch).toHaveBeenCalledWith("deleteManga", { key: "test", ts: 1000 }, true)
        })

        it("should sync local when remote has newer timestamp", async () => {
            const localList = [{ key: "test", ts: 1000, tsOpts: 1000 }]
            const remoteList = [{ key: "test", ts: 2000, tsOpts: 1000 }]

            await processUpdatesToLocal(mockLocalStorage, localList, remoteList)

            expect(mockLocalStorage.syncLocal).toHaveBeenCalledWith(remoteList[0])
        })

        it("should add new manga from remote", async () => {
            const localList = []
            const remoteList = [{ key: "new-manga", ts: 1000 }]

            const result = await processUpdatesToLocal(mockLocalStorage, localList, remoteList)

            expect(mockLocalStorage.syncLocal).toHaveBeenCalledWith(remoteList[0])
            expect(result).toContain(remoteList[0])
        })

        it("should not add deleted manga from remote", async () => {
            const localList = []
            const remoteList = [{ key: "deleted-manga", ts: 1000, deleted: 1 }]

            const result = await processUpdatesToLocal(mockLocalStorage, localList, remoteList)

            expect(mockLocalStorage.syncLocal).not.toHaveBeenCalled()
            expect(result).not.toContain(remoteList[0])
        })
    })

    describe("processUpdatesToRemote", () => {
        let mockLogger
        let mockRemoteStorage

        beforeEach(() => {
            mockLogger = {
                debug: vi.fn()
            }
            mockRemoteStorage = {
                isdb: false,
                saveAll: vi.fn().mockResolvedValue(undefined),
                constructor: { name: "TestStorage" }
            }
        })

        it("should add new manga to remote", async () => {
            const localList = [{ key: "new-manga", ts: 1000, tsOpts: 1000, listChaps: ["ch1"] }]
            const remoteList = []

            const result = await processUpdatesToRemote(mockLogger, localList, remoteList, mockRemoteStorage)

            expect(result).toHaveLength(1)
            expect(result[0].key).toBe("new-manga")
            expect(result[0].listChaps).toEqual([]) // listChaps should be cleared
        })

        it("should update remote when local has newer timestamp", async () => {
            const localList = [
                {
                    key: "test",
                    ts: 2000,
                    tsOpts: 1000,
                    lastChapterReadURL: "new-url",
                    lastChapterReadName: "Chapter 2"
                }
            ]
            const remoteList = [
                {
                    key: "test",
                    ts: 1000,
                    tsOpts: 1000,
                    lastChapterReadURL: "old-url",
                    lastChapterReadName: "Chapter 1"
                }
            ]

            const result = await processUpdatesToRemote(mockLogger, localList, remoteList, mockRemoteStorage)

            expect(result).toHaveLength(1)
            expect(mockRemoteStorage.saveAll).toHaveBeenCalled()
        })

        it("should skip deleted manga", async () => {
            const localList = [{ key: "test", ts: 1000, deleted: 1 }]
            const remoteList = []

            const result = await processUpdatesToRemote(mockLogger, localList, remoteList, mockRemoteStorage)

            expect(result).toHaveLength(0)
            expect(mockRemoteStorage.saveAll).not.toHaveBeenCalled()
        })
    })
})
