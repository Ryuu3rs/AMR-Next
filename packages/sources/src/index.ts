import { SourceRegistry, type SourceAdapter } from "@amr/source-sdk"
import { mangadexAdapter } from "./mangadex"
import { mangareadAdapter } from "./mangaread"
import { mgekoAdapter } from "./mgeko"

export { mangadexAdapter } from "./mangadex"
export { mangareadAdapter } from "./mangaread"
export { mgekoAdapter } from "./mgeko"

export const sourceAdapters: readonly SourceAdapter[] = [mangadexAdapter, mangareadAdapter, mgekoAdapter]
export const sourceRegistry = new SourceRegistry(sourceAdapters)
