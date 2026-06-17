import { SourceRegistry, type SourceAdapter } from "@amr/source-sdk"
import { mangadexAdapter } from "./mangadex"
import { mangareadAdapter } from "./mangaread"
import { mgekoAdapter } from "./mgeko"
import { manganatoAdapter } from "./manganato"
import { weebCentralAdapter } from "./weebcentral"
import { madaraAdapters } from "./madara-sites"
import { mangaStreamAdapters } from "./mangastream-sites"
import { mangaBuddyAdapters } from "./mangabuddy-sites"

export { mangadexAdapter } from "./mangadex"
export { mangareadAdapter } from "./mangaread"
export { mgekoAdapter } from "./mgeko"
export { manganatoAdapter } from "./manganato"
export { weebCentralAdapter } from "./weebcentral"
export { createMadaraAdapter, type MadaraConfig } from "./madara"
export { madaraAdapters, madaraOrigins } from "./madara-sites"
export { createMangaStreamAdapter, type MangaStreamConfig } from "./mangastream"
export { mangaStreamAdapters, mangaStreamOrigins } from "./mangastream-sites"
export { createMangaBuddyAdapter, type MangaBuddyConfig } from "./mangabuddy"
export { mangaBuddyAdapters, mangaBuddyOrigins } from "./mangabuddy-sites"

export const sourceAdapters: readonly SourceAdapter[] = [
    mangadexAdapter,
    mangareadAdapter,
    mgekoAdapter,
    manganatoAdapter,
    weebCentralAdapter,
    ...madaraAdapters,
    ...mangaStreamAdapters,
    ...mangaBuddyAdapters
]
export const sourceRegistry = new SourceRegistry(sourceAdapters)
