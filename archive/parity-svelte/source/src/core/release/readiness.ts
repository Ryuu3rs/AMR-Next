import type { MirrorCatalogDiagnostics } from "../mirrors/catalog"
import type { SyncStatus } from "../sync/status"

export type ReleaseReadiness = {
    ready: boolean
    blockers: string[]
    notes: string[]
}

export function evaluateReleaseReadiness(args: {
    mirrorDiagnostics: MirrorCatalogDiagnostics
    syncStatus: SyncStatus
}): ReleaseReadiness {
    const blockers: string[] = []
    const notes: string[] = []

    if (args.mirrorDiagnostics.source !== "runtime-loader") {
        blockers.push(
            `Mirror source is '${args.mirrorDiagnostics.source}'. Expected 'runtime-loader' for packaged parity.`
        )
    }

    if ((args.syncStatus.lastRunStats?.usedLegacyArrayFormat ?? false) === true) {
        blockers.push(
            "Sync consumed legacy array payload format in last run; migrate remote payload to schema envelope."
        )
    }

    if ((args.syncStatus.lastRunStats?.usedLegacyLocalFallback ?? false) === true) {
        blockers.push("Sync used legacy local fallback store in last run; migrate local records to rewrite storage.")
    }

    if (!args.syncStatus.enabled) {
        notes.push("Sync is currently disabled.")
    }

    if (args.syncStatus.provider === "none") {
        notes.push("No sync provider selected.")
    }

    return {
        ready: blockers.length === 0,
        blockers,
        notes
    }
}
