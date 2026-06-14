export type LegacyMirrorDescriptor = {
    mirrorName: string
    canListFullMangas: boolean
    mirrorIcon?: string
    disabled?: boolean
    disabledForSearch?: boolean
}

export type MirrorCapability = {
    id: string
    name: string
    label: string
    mirrorIcon?: string
    supportsSearch: boolean
    supportsLatest: boolean
    supportsBatch: boolean
}

export function deriveCapabilitiesFromLegacyMirror(mirror: LegacyMirrorDescriptor): MirrorCapability {
    const id = mirror.mirrorName.toLowerCase().replace(/\s+/g, "-")
    const supportsSearch = !(mirror.disabled || mirror.disabledForSearch)

    return {
        id,
        name: mirror.mirrorName,
        label: mirror.mirrorName,
        mirrorIcon: mirror.mirrorIcon,
        supportsSearch,
        supportsLatest: mirror.canListFullMangas,
        supportsBatch: mirror.canListFullMangas
    }
}
