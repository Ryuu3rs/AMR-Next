<script lang="ts">
    type Day = { date: string; count: number }

    let { data, weeks }: { data: Day[]; weeks?: number } = $props()

    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    function parseLocalDate(iso: string): Date | null {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
        if (!match) return null
        const year = Number(match[1])
        const month = Number(match[2])
        const day = Number(match[3])
        const date = new Date(year, month - 1, day)
        return Number.isNaN(date.getTime()) ? null : date
    }

    function addDays(date: Date, amount: number): Date {
        const next = new Date(date)
        next.setDate(next.getDate() + amount)
        return next
    }

    function toIso(date: Date): string {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, "0")
        const day = String(date.getDate()).padStart(2, "0")
        return `${year}-${month}-${day}`
    }

    function bucketOf(count: number): number {
        if (count <= 0) return 0
        if (count === 1) return 1
        if (count <= 3) return 2
        if (count <= 6) return 3
        return 4
    }

    const counts = $derived.by(() => {
        const map = new Map<string, number>()
        for (const entry of data) {
            const date = parseLocalDate(entry.date)
            if (!date) continue
            const key = toIso(date)
            map.set(key, (map.get(key) ?? 0) + Math.max(0, entry.count))
        }
        return map
    })

    type Cell = { date: string; count: number; bucket: number } | null

    const columns = $derived.by(() => {
        const dates: Date[] = []
        for (const entry of data) {
            const date = parseLocalDate(entry.date)
            if (date) dates.push(date)
        }
        if (dates.length === 0) return [] as Cell[][]

        dates.sort((a, b) => a.getTime() - b.getTime())
        const first = dates[0]
        const last = dates[dates.length - 1]
        if (!first || !last) return [] as Cell[][]

        const gridStart = addDays(first, -first.getDay())
        const gridEnd = addDays(last, 6 - last.getDay())
        const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1
        const totalWeeks = Math.ceil(totalDays / 7)

        const cap = weeks && weeks > 0 ? Math.min(weeks, totalWeeks) : totalWeeks
        const startWeek = totalWeeks - cap
        const renderStart = addDays(gridStart, startWeek * 7)

        const result: Cell[][] = []
        for (let week = 0; week < cap; week++) {
            const column: Cell[] = []
            for (let weekday = 0; weekday < 7; weekday++) {
                const cellDate = addDays(renderStart, week * 7 + weekday)
                const iso = toIso(cellDate)
                const inRange = cellDate.getTime() >= first.getTime() && cellDate.getTime() <= last.getTime()
                if (!inRange) {
                    column.push(null)
                    continue
                }
                const count = counts.get(iso) ?? 0
                column.push({ date: iso, count, bucket: bucketOf(count) })
            }
            result.push(column)
        }
        return result
    })

    const totals = $derived.by(() => {
        let sum = 0
        let activeDays = 0
        for (const count of counts.values()) {
            if (count > 0) {
                sum += count
                activeDays++
            }
        }
        return { sum, activeDays }
    })

    function cellTitle(cell: NonNullable<Cell>): string {
        if (cell.count <= 0) return `No activity on ${cell.date}`
        return `${cell.count} chapter${cell.count === 1 ? "" : "s"} on ${cell.date}`
    }
</script>

<div class="heatmap">
    {#if columns.length === 0}
        <p class="hm-empty">No reading activity yet.</p>
    {:else}
        <div class="hm-scroll">
            <div class="hm-grid" role="img" aria-label="Reading activity heatmap">
                {#each columns as column}
                    <div class="hm-col">
                        {#each column as cell, weekday}
                            {#if cell}
                                <div class="hm-cell bucket-{cell.bucket}" title={cellTitle(cell)}></div>
                            {:else}
                                <div class="hm-cell empty" title={`${WEEKDAYS[weekday]} (no data)`} aria-hidden="true">
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/each}
            </div>
        </div>
        <div class="hm-footer">
            <span class="hm-caption">
                {totals.sum} chapter{totals.sum === 1 ? "" : "s"} across {totals.activeDays}
                day{totals.activeDays === 1 ? "" : "s"}
            </span>
            <span class="hm-legend">
                Less
                <span class="hm-cell bucket-0"></span>
                <span class="hm-cell bucket-1"></span>
                <span class="hm-cell bucket-2"></span>
                <span class="hm-cell bucket-3"></span>
                <span class="hm-cell bucket-4"></span>
                More
            </span>
        </div>
    {/if}
</div>

<style>
    .heatmap {
        max-width: 700px;
    }

    .hm-scroll {
        overflow-x: auto;
        padding-bottom: 4px;
    }

    .hm-grid {
        display: inline-flex;
        gap: 3px;
    }

    .hm-col {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .hm-cell {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        background: var(--surface-2);
        border: 1px solid var(--border);
    }

    .hm-cell.empty {
        background: transparent;
        border-color: transparent;
    }

    .bucket-0 {
        background: var(--surface-2);
    }

    .bucket-1 {
        background: color-mix(in srgb, var(--accent) 25%, var(--surface-2));
        border-color: color-mix(in srgb, var(--accent) 25%, var(--border));
    }

    .bucket-2 {
        background: color-mix(in srgb, var(--accent) 50%, var(--surface-2));
        border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
    }

    .bucket-3 {
        background: color-mix(in srgb, var(--accent) 75%, var(--surface-2));
        border-color: color-mix(in srgb, var(--accent) 75%, var(--border));
    }

    .bucket-4 {
        background: var(--accent);
        border-color: var(--accent);
    }

    .hm-footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 10px;
        font-size: 12px;
        color: var(--muted);
    }

    .hm-legend {
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }

    .hm-legend .hm-cell {
        display: inline-block;
    }

    .hm-empty {
        color: var(--muted);
        margin: 0;
    }
</style>
