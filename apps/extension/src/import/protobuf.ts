// Minimal, dependency-free Protocol Buffers wire-format reader - just enough to decode a
// Mihon/Tachiyomi `.tachibk` backup (see mihon.ts for the field mapping). We only read; there is
// no schema and no codegen. Unknown fields and wire types we don't need are skipped safely, so a
// newer backup version with extra fields still parses.

export type WireEntry = {
    wire: number
    // wire 2 (length-delimited: string / bytes / embedded message / packed repeated)
    bytes?: Uint8Array
    // wire 0 (varint: int32/int64/bool/enum)
    num?: bigint
    // wire 5 (32-bit: float/fixed32)
    f32?: number
}

// field number -> every entry seen for it (repeated fields appear more than once)
export type Fields = Map<number, WireEntry[]>

function readVarint(buf: Uint8Array, p: number): [bigint, number] {
    let shift = 0n
    let result = 0n
    for (;;) {
        if (p >= buf.length) throw new Error("protobuf: varint overran buffer")
        const b = buf[p++]!
        result |= BigInt(b & 0x7f) << shift
        if ((b & 0x80) === 0) break
        shift += 7n
        if (shift > 70n) throw new Error("protobuf: varint too long")
    }
    return [result, p]
}

// Decode one message into a map of field number -> entries. Throws on a malformed/truncated
// buffer so the caller rejects the file rather than importing garbage.
export function decodeMessage(buf: Uint8Array): Fields {
    const fields: Fields = new Map()
    const push = (f: number, e: WireEntry) => {
        const a = fields.get(f)
        if (a) a.push(e)
        else fields.set(f, [e])
    }
    let p = 0
    while (p < buf.length) {
        const [tag, afterTag] = readVarint(buf, p)
        p = afterTag
        const field = Number(tag >> 3n)
        const wire = Number(tag & 7n)
        if (field <= 0) throw new Error("protobuf: bad field number")
        if (wire === 0) {
            const [v, n] = readVarint(buf, p)
            p = n
            push(field, { wire, num: v })
        } else if (wire === 2) {
            const [len, n] = readVarint(buf, p)
            const start = n
            const end = start + Number(len)
            if (end > buf.length) throw new Error("protobuf: length-delimited overruns buffer")
            push(field, { wire, bytes: buf.subarray(start, end) })
            p = end
        } else if (wire === 5) {
            if (p + 4 > buf.length) throw new Error("protobuf: fixed32 overruns buffer")
            const dv = new DataView(buf.buffer, buf.byteOffset + p, 4)
            push(field, { wire, f32: dv.getFloat32(0, true) })
            p += 4
        } else if (wire === 1) {
            if (p + 8 > buf.length) throw new Error("protobuf: fixed64 overruns buffer")
            p += 8 // fixed64 (unused by our mapping) - skip
            push(field, { wire })
        } else {
            throw new Error(`protobuf: unsupported wire type ${wire}`)
        }
    }
    return fields
}

const decoder = new TextDecoder()

export function fieldString(entries: WireEntry[] | undefined): string | undefined {
    const e = entries?.[0]
    return e?.bytes ? decoder.decode(e.bytes) : undefined
}

export function fieldMessage(entry: WireEntry | undefined): Fields | undefined {
    return entry?.bytes ? decodeMessage(entry.bytes) : undefined
}

export function fieldInt(entries: WireEntry[] | undefined): number | undefined {
    const e = entries?.[0]
    return e?.num !== undefined ? Number(e.num) : undefined
}

export function fieldFloat(entries: WireEntry[] | undefined): number | undefined {
    const e = entries?.[0]
    return e?.f32
}

export function fieldBool(entries: WireEntry[] | undefined): boolean {
    const e = entries?.[0]
    return e?.num !== undefined && e.num !== 0n
}

// Read every string of a repeated string field (each is its own length-delimited entry).
export function repeatedStrings(entries: WireEntry[] | undefined): string[] {
    if (!entries) return []
    const out: string[] = []
    for (const e of entries) if (e.bytes) out.push(decoder.decode(e.bytes))
    return out
}

// Read a repeated scalar (varint) field that may be either packed (one length-delimited entry of
// concatenated varints) or unpacked (many wire-0 entries). Covers BackupManga.categories.
export function repeatedVarints(entries: WireEntry[] | undefined): number[] {
    if (!entries) return []
    const out: number[] = []
    for (const e of entries) {
        if (e.num !== undefined) {
            out.push(Number(e.num))
        } else if (e.bytes) {
            let p = 0
            while (p < e.bytes.length) {
                const [v, n] = readVarint(e.bytes, p)
                p = n
                out.push(Number(v))
            }
        }
    }
    return out
}
