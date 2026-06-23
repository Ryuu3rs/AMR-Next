type Def = { id: string; check: (chapters: number, sources: number) => boolean }

const DEFS: Def[] = [
    { id: "first_chapter", check: c => c >= 1 },
    { id: "chapters_10", check: c => c >= 10 },
    { id: "chapters_50", check: c => c >= 50 },
    { id: "chapters_100", check: c => c >= 100 },
    { id: "chapters_500", check: c => c >= 500 },
    { id: "multi_source_3", check: (_, s) => s >= 3 },
    { id: "multi_source_5", check: (_, s) => s >= 5 }
]

export function computeUnlocked(chapters: number, sources: number): string[] {
    return DEFS.filter(d => d.check(chapters, sources)).map(d => d.id)
}
