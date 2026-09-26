import { describe, expect, it } from "vitest"
import { parseMihonBackup } from "./mihon"
import { repeatedVarints, decodeMessage } from "./protobuf"

// --- minimal protobuf encoder (test-only), mirroring the wire format the reader decodes ---
function varint(n: number): number[] {
    let v = BigInt(n)
    const out: number[] = []
    do {
        let b = Number(v & 0x7fn)
        v >>= 7n
        if (v) b |= 0x80
        out.push(b)
    } while (v)
    return out
}
const tag = (field: number, wire: number) => varint((field << 3) | wire)
const lenDelim = (field: number, bytes: number[]) => [...tag(field, 2), ...varint(bytes.length), ...bytes]
const strField = (field: number, s: string) => lenDelim(field, [...new TextEncoder().encode(s)])
const varField = (field: number, n: number) => [...tag(field, 0), ...varint(n)]
const msgField = lenDelim
function f32Field(field: number, n: number): number[] {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setFloat32(0, n, true)
    return [...tag(field, 5), ...b]
}

describe("protobuf reader", () => {
    it("reads packed and unpacked repeated varints the same", () => {
        // packed: one length-delimited entry of concatenated varints
        const packed = decodeMessage(new Uint8Array(lenDelim(17, [...varint(3), ...varint(7)])))
        expect(repeatedVarints(packed.get(17))).toEqual([3, 7])
        // unpacked: repeated wire-0 entries
        const unpacked = decodeMessage(new Uint8Array([...varField(17, 3), ...varField(17, 7)]))
        expect(repeatedVarints(unpacked.get(17))).toEqual([3, 7])
    })
})

describe("parseMihonBackup", () => {
    function backup(): Uint8Array {
        const category = [...strField(1, "Reading"), ...varField(2, 0)] // name, order 0
        const chRead5 = [...varField(4, 1), ...f32Field(9, 5)]
        const chRead12 = [...varField(4, 1), ...f32Field(9, 12)]
        const chUnread20 = [...varField(4, 0), ...f32Field(9, 20)]
        const anilistTrack = [...varField(1, 2), ...varField(100, 12345)] // syncId=AniList, mediaId
        const manga = [
            ...strField(3, "Solo Leveling"),
            ...strField(7, "Action"),
            ...strField(7, "Fantasy"),
            ...varField(8, 2), // status: completed
            ...strField(9, "https://cover.test/sl.jpg"),
            ...msgField(16, chRead5),
            ...msgField(16, chRead12),
            ...msgField(16, chUnread20),
            ...lenDelim(17, varint(0)), // categories (packed): [order 0]
            ...msgField(18, anilistTrack)
        ]
        const titleless = [...varField(8, 1)] // no title -> skipped
        const malOnly = [...strField(3, "Berserk"), ...msgField(18, [...varField(1, 1), ...varField(100, 999)])]
        return new Uint8Array([
            ...msgField(1, manga),
            ...msgField(1, titleless),
            ...msgField(1, malOnly),
            ...msgField(2, category)
        ])
    }

    it("extracts title, status, cover, genres, categories, max-read chapter and AniList id", () => {
        const out = parseMihonBackup(backup())
        const sl = out.find(m => m.title === "Solo Leveling")!
        expect(sl).toBeTruthy()
        expect(sl.status).toBe("completed")
        expect(sl.coverUrl).toBe("https://cover.test/sl.jpg")
        expect(sl.genres).toEqual(["Action", "Fantasy"])
        expect(sl.categories).toEqual(["Reading"])
        expect(sl.maxReadChapter).toBe(12) // highest READ chapter; the unread 20 is ignored
        expect(sl.anilistId).toBe(12345)
    })

    it("skips entries with no title", () => {
        const out = parseMihonBackup(backup())
        expect(out.map(m => m.title)).toEqual(["Solo Leveling", "Berserk"])
    })

    it("captures a MyAnimeList tracker id separately from AniList", () => {
        const out = parseMihonBackup(backup())
        const berserk = out.find(m => m.title === "Berserk")!
        expect(berserk.malId).toBe(999)
        expect(berserk.anilistId).toBeUndefined()
        expect(berserk.maxReadChapter).toBeUndefined()
    })
})
