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
import { mangaparkAdapter } from "./mangapark"
import { webtoonsAdapter } from "./webtoons"
import { mangahubAdapter } from "./mangahub"
import { fanfoxAdapter } from "./fanfox"

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
export { mangaparkAdapter } from "./mangapark"
export { webtoonsAdapter } from "./webtoons"
export { mangahubAdapter } from "./mangahub"
export { fanfoxAdapter } from "./fanfox"

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
    mangaparkAdapter,
    webtoonsAdapter,
    mangahubAdapter,
    fanfoxAdapter
]
export const sourceRegistry = new SourceRegistry(sourceAdapters)
