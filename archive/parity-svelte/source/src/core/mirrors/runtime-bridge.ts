import type { LegacyMirrorDescriptor } from "./legacy-mirror-adapter"
import { legacyMirrorSnapshot } from "./legacy-mirror-snapshot"

const LEGACY_DB_NAME = "AllMangasReader"
const LEGACY_DB_VERSION = 4
const LEGACY_MIRRORS_STORE = "mirrors"

type LegacyMirrorLoaderModule = {
    getMirrorLoader: (mirrorHelper: unknown) => {
        getAll: () => Array<{
            mirrorName: string
            canListFullMangas: boolean
            disabled?: boolean
            disabledForSearch?: boolean
        }>
    }
}

type MirrorHelperModule = {
    MirrorHelper: new (options: Record<string, unknown>) => unknown
}

export type MirrorSource = "runtime-loader" | "indexeddb" | "snapshot"

export type MirrorDescriptorResult = {
    source: MirrorSource
    descriptors: LegacyMirrorDescriptor[]
}

function normalizeLegacyMirror(value: unknown): LegacyMirrorDescriptor | null {
    if (!value || typeof value !== "object") {
        return null
    }

    const raw = value as Record<string, unknown>

    if (typeof raw.mirrorName !== "string") {
        return null
    }

    return {
        mirrorName: raw.mirrorName,
        canListFullMangas: Boolean(raw.canListFullMangas),
        mirrorIcon: typeof raw.mirrorIcon === "string" ? raw.mirrorIcon : undefined,
        disabled: typeof raw.disabled === "boolean" ? raw.disabled : undefined,
        disabledForSearch: typeof raw.disabledForSearch === "boolean" ? raw.disabledForSearch : undefined
    }
}

async function getDescriptorsFromMirrorLoader(): Promise<LegacyMirrorDescriptor[]> {
    try {
        const [{ getMirrorLoader }, { MirrorHelper }] = (await Promise.all([
            import("../../../../src/mirrors/MirrorLoader") as Promise<LegacyMirrorLoaderModule>,
            import("../../../../src/mirrors/MirrorHelper") as Promise<MirrorHelperModule>
        ])) as [LegacyMirrorLoaderModule, MirrorHelperModule]

        const helper = new MirrorHelper({
            deactivateunreadable: false,
            readlanguages: ["en", "gb"],
            komgaUrl: "http://localhost:8080",
            tachideskUrl: "http://localhost:4567"
        })

        const mirrors = getMirrorLoader(helper).getAll()
        return mirrors.map(normalizeLegacyMirror).filter((m): m is LegacyMirrorDescriptor => m !== null)
    } catch {
        return []
    }
}

async function getDescriptorsFromLegacyIndexedDb(): Promise<LegacyMirrorDescriptor[]> {
    if (typeof indexedDB === "undefined") {
        return []
    }

    try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })

        const mirrors = await new Promise<LegacyMirrorDescriptor[]>((resolve, reject) => {
            const tx = db.transaction([LEGACY_MIRRORS_STORE], "readonly")
            const store = tx.objectStore(LEGACY_MIRRORS_STORE)
            const request = store.getAll()

            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                const records = Array.isArray(request.result) ? request.result : []
                resolve(records.map(normalizeLegacyMirror).filter((m): m is LegacyMirrorDescriptor => m !== null))
            }
        })

        db.close()
        return mirrors
    } catch {
        return []
    }
}

export async function getLegacyMirrorDescriptorsWithSource(): Promise<MirrorDescriptorResult> {
    const fromLoader = await getDescriptorsFromMirrorLoader()
    if (fromLoader.length) {
        return {
            source: "runtime-loader",
            descriptors: fromLoader
        }
    }

    const fromIndexedDb = await getDescriptorsFromLegacyIndexedDb()
    if (fromIndexedDb.length) {
        return {
            source: "indexeddb",
            descriptors: fromIndexedDb
        }
    }

    return {
        source: "snapshot",
        descriptors: legacyMirrorSnapshot
    }
}

export async function getLegacyMirrorDescriptors(): Promise<LegacyMirrorDescriptor[]> {
    const result = await getLegacyMirrorDescriptorsWithSource()
    return result.descriptors
}
