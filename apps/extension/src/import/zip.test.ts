import { describe, expect, it } from "vitest"
import { unzipFirst } from "./zip"

const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff]
const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]

// Build a minimal single-entry STORED (uncompressed) zip. crc is left 0 - the reader doesn't
// validate it. `encrypted` sets general-purpose bit 0 to exercise the rejection path.
function storedZip(name: string, data: Uint8Array, encrypted = false): Uint8Array {
    const nameBytes = [...new TextEncoder().encode(name)]
    const flag = encrypted ? 0x0001 : 0
    const len = data.length
    const local = [
        ...u32(0x04034b50),
        ...u16(20),
        ...u16(flag),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(len),
        ...u32(len),
        ...u16(nameBytes.length),
        ...u16(0),
        ...nameBytes,
        ...data
    ]
    const cdOffset = local.length
    const central = [
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(flag),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(len),
        ...u32(len),
        ...u16(nameBytes.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(0),
        ...nameBytes
    ]
    const eocd = [
        ...u32(0x06054b50),
        ...u16(0),
        ...u16(0),
        ...u16(1),
        ...u16(1),
        ...u32(central.length),
        ...u32(cdOffset),
        ...u16(0)
    ]
    return new Uint8Array([...local, ...central, ...eocd])
}

describe("unzipFirst", () => {
    it("extracts a stored entry by name match", async () => {
        const payload = new TextEncoder().encode('{"version":"2"}')
        const zip = storedZip("mangayomi_2026.backup.db", payload)
        const out = await unzipFirst(zip, n => n.endsWith(".db"))
        expect(new TextDecoder().decode(out)).toBe('{"version":"2"}')
    })

    it("rejects an encrypted entry with a clear message", async () => {
        const zip = storedZip("secret.backup.db", new TextEncoder().encode("x"), true)
        await expect(unzipFirst(zip, n => n.endsWith(".db"))).rejects.toThrow(/encrypted/i)
    })

    it("throws when nothing is a zip", async () => {
        await expect(unzipFirst(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/valid zip/i)
    })
})
