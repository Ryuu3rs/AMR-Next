import { SourceRegistry, type SourceAdapter } from "@amr/source-sdk"
import { mangadexAdapter } from "./mangadex"
import { mangareadAdapter } from "./mangaread"
import { mgekoAdapter } from "./mgeko"
import { madaraAdapters } from "./madara-sites"

export { mangadexAdapter } from "./mangadex"
export { mangareadAdapter } from "./mangaread"
export { mgekoAdapter } from "./mgeko"
export { createMadaraAdapter, type MadaraConfig } from "./madara"
export { madaraAdapters, madaraOrigins } from "./madara-sites"

export const sourceAdapters: readonly SourceAdapter[] = [
    mangadexAdapter,
    mangareadAdapter,
    mgekoAdapter,
    ...madaraAdapters
]
export const sourceRegistry = new SourceRegistry(sourceAdapters)
