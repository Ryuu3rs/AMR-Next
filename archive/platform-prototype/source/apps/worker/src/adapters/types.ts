import type { IngestCatalogItem, IngestChapterPagesItem } from "@amr-next/contracts"

export interface AdapterContext {
    nowIso: string
}

export interface SourceAdapter {
    id: string
    pullSnapshot(context: AdapterContext): Promise<IngestCatalogItem[]>
    pullChapterPages?(context: AdapterContext, snapshot: IngestCatalogItem[]): Promise<IngestChapterPagesItem[]>
}
