export interface SpreadView {
    indices: number[]
    nextStart: number
    prevStart: number
}

function alignedStart(page: number, offset: boolean): number {
    if (page <= 0) return 0
    if (offset) return page % 2 === 0 ? page - 1 : page
    return page - (page % 2)
}

export function spreadView(currentPage: number, spread: 1 | 2, offset: boolean, pageCount: number): SpreadView {
    const last = Math.max(0, pageCount - 1)
    const clamp = (n: number) => Math.max(0, Math.min(n, last))
    const cur = clamp(currentPage)
    if (spread !== 2 || pageCount <= 1) {
        return { indices: [cur], nextStart: clamp(cur + 1), prevStart: clamp(cur - 1) }
    }
    const start = alignedStart(cur, offset)
    const single = offset && start === 0
    const indices = !single && start + 1 <= last ? [start, start + 1] : [start]
    const maxShown = indices[indices.length - 1]!
    const nextStart = maxShown >= last ? start : offset && start === 0 ? 1 : clamp(start + 2)
    const prevStart = start === 0 ? 0 : offset && start <= 2 ? 0 : clamp(start - 2)
    return { indices, nextStart, prevStart }
}
