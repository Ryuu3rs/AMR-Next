// Registry of supported "import from another reader" formats. The import UI renders one dropdown
// entry per format here, and the import handler looks the chosen id up to get its parser. Adding a
// new reader = add an entry; nothing else in the UI/handler changes.

import { parseMihonBackup, type ImportedManga } from "./mihon"

export type { ImportedManga }

export type ImportFormatId = "mihon"

export type ImportFormat = {
    id: ImportFormatId
    // Shown in the dropdown.
    label: string
    // File-picker accept hint.
    accept: string
    // Parse a raw uploaded file (handles its own decompression) into normalized manga.
    parse: (file: Uint8Array) => Promise<ImportedManga[]>
}

// gzip-decompress when the file has the gzip magic (0x1f 0x8b); a `.tachibk` is gzipped protobuf,
// but some exports/tools hand over raw protobuf, so fall through to the bytes as-is.
async function maybeGunzip(bytes: Uint8Array): Promise<Uint8Array> {
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))
        return new Uint8Array(await new Response(stream).arrayBuffer())
    }
    return bytes
}

export const IMPORT_FORMATS: readonly ImportFormat[] = [
    {
        id: "mihon",
        label: "Mihon / Tachiyomi (.tachibk)",
        accept: ".tachibk,.gz,.proto.gz",
        parse: async file => parseMihonBackup(await maybeGunzip(file))
    }
    // Next slice: Mangayomi (its own backup format, not the Mihon protobuf).
]

export function getImportFormat(id: string): ImportFormat | undefined {
    return IMPORT_FORMATS.find(f => f.id === id)
}
