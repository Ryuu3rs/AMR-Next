import type { LegacyMirrorDescriptor } from "./legacy-mirror-adapter"

/**
 * Snapshot-shaped data aligned with legacy mirror object fields used by the
 * current extension core (`mirrorName`, `canListFullMangas`, `disabled`, `disabledForSearch`).
 *
 * This is an adapter boundary: replace this list with real runtime data from
 * legacy mirror loader as soon as the rewrite bridge is wired.
 */
export const legacyMirrorSnapshot: LegacyMirrorDescriptor[] = [
    { mirrorName: "Mangadex", canListFullMangas: true },
    { mirrorName: "MangaFox", canListFullMangas: true },
    { mirrorName: "MangaHere", canListFullMangas: true },
    { mirrorName: "MangaHub", canListFullMangas: true },
    { mirrorName: "MangaPill", canListFullMangas: true },
    { mirrorName: "MangaKatana", canListFullMangas: true },
    { mirrorName: "MangaReaderTo", canListFullMangas: true },
    { mirrorName: "MangaBuddy", canListFullMangas: true },
    { mirrorName: "WeebCentral", canListFullMangas: true },
    { mirrorName: "DynastyScans", canListFullMangas: false, disabledForSearch: false },
    { mirrorName: "ReadComicOnline", canListFullMangas: false, disabledForSearch: false },
    { mirrorName: "NHentai", canListFullMangas: false, disabledForSearch: false }
]
