import { SourceRegistry, type SourceAdapter } from "@amr/source-sdk"
import { mangadexAdapter } from "./mangadex"
import { mangareadAdapter } from "./mangaread"
import { mgekoAdapter } from "./mgeko"
import { manganatoAdapter } from "./manganato"
import { weebCentralAdapter } from "./weebcentral"
import { dynastyScansAdapter } from "./dynasty-scans"
import { asuraComicAdapter } from "./asuracomic"
import { asuraScansAdapter } from "./asurascans"
import { madaraAdapters } from "./madara-sites"
import { mangaStreamAdapters } from "./mangastream-sites"
import { mangaBuddyAdapters } from "./mangabuddy-sites"
// import { mangaparkAdapter } from "./mangapark" // retired: site down 2026-06 — re-enable when back
import { webtoonsAdapter } from "./webtoons"
import { mangahubAdapter } from "./mangahub"
import { fanfoxFamilyAdapters } from "./fanfox-sites"
import { olympusstaffAdapter } from "./olympustaff"
import { mangafreakAdapter } from "./mangafreak"
import { comixAdapter } from "./comix"

export { mangadexAdapter } from "./mangadex"
export { mangareadAdapter } from "./mangaread"
export { mgekoAdapter } from "./mgeko"
export { manganatoAdapter } from "./manganato"
export { weebCentralAdapter } from "./weebcentral"
export { dynastyScansAdapter } from "./dynasty-scans"
export { asuraComicAdapter } from "./asuracomic"
export { asuraScansAdapter } from "./asurascans"
export { createMadaraAdapter, type MadaraConfig } from "./madara"
export { madaraAdapters, madaraOrigins } from "./madara-sites"
export { createMangaStreamAdapter, type MangaStreamConfig } from "./mangastream"
export { mangaStreamAdapters, mangaStreamOrigins } from "./mangastream-sites"
export { createMangaBuddyAdapter, type MangaBuddyConfig } from "./mangabuddy"
export { mangaBuddyAdapters, mangaBuddyOrigins } from "./mangabuddy-sites"
// export { mangaparkAdapter } from "./mangapark" // retired: site down 2026-06
export { webtoonsAdapter } from "./webtoons"
export { mangahubAdapter } from "./mangahub"
export { createFanfoxFamilyAdapter, type FanfoxFamilyConfig } from "./fanfox"
export { fanfoxFamilyAdapters, fanfoxFamilyOrigins } from "./fanfox-sites"
export { olympusstaffAdapter } from "./olympustaff"
export { mangafreakAdapter } from "./mangafreak"
export { comixAdapter } from "./comix"

export const sourceAdapters: readonly SourceAdapter[] = [
    mangadexAdapter,
    mangareadAdapter,
    mgekoAdapter,
    manganatoAdapter,
    weebCentralAdapter,
    dynastyScansAdapter,
    asuraComicAdapter,
    asuraScansAdapter,
    ...madaraAdapters,
    ...mangaStreamAdapters,
    ...mangaBuddyAdapters,
    // mangaparkAdapter, // retired: site down 2026-06 — re-enable when back
    webtoonsAdapter,
    mangahubAdapter,
    ...fanfoxFamilyAdapters,
    olympusstaffAdapter,
    mangafreakAdapter,
    comixAdapter
]
export const sourceRegistry = new SourceRegistry(sourceAdapters)
