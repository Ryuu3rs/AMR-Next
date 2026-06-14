import { deriveCapabilitiesFromLegacyMirror, type MirrorCapability } from "./legacy-mirror-adapter"
import { getLegacyMirrorDescriptors, getLegacyMirrorDescriptorsWithSource, type MirrorSource } from "./runtime-bridge"

export type { MirrorCapability } from "./legacy-mirror-adapter"

export type MirrorCatalogDiagnostics = {
    source: MirrorSource
    total: number
    searchable: number
    latest: number
    disabled: number
}

export async function getMirrorCatalog(): Promise<MirrorCapability[]> {
    const mirrors = await getLegacyMirrorDescriptors()
    return mirrors.map(deriveCapabilitiesFromLegacyMirror)
}

export async function getMirrorCatalogWithDiagnostics(): Promise<{
    mirrors: MirrorCapability[]
    diagnostics: MirrorCatalogDiagnostics
}> {
    const result = await getLegacyMirrorDescriptorsWithSource()
    const mirrors = result.descriptors.map(deriveCapabilitiesFromLegacyMirror)

    return {
        mirrors,
        diagnostics: {
            source: result.source,
            total: mirrors.length,
            searchable: mirrors.filter(m => m.supportsSearch).length,
            latest: mirrors.filter(m => m.supportsLatest).length,
            disabled: mirrors.filter(m => !m.supportsSearch).length
        }
    }
}
