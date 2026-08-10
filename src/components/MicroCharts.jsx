// Small dependency-free SVG chart primitives used by the dashboard widgets: a donut for
// part-of-whole splits and a sparkline for a bare trend. Both are pure presentation — the caller
// supplies already-aggregated numbers.

// Palette-aligned accents (brand teal, secondary blue, amber, danger rose) — no off-palette hues.
const ACCENT = {
    teal: { stroke: 'stroke-teal-500', dot: 'bg-teal-500', fill: 'fill-teal-500', text: 'text-teal-600 dark:text-teal-400' },
    blue: { stroke: 'stroke-secondary-400', dot: 'bg-secondary-400', fill: 'fill-secondary-400', text: 'text-secondary-600 dark:text-secondary-300' },
    amber: { stroke: 'stroke-amber-500', dot: 'bg-amber-500', fill: 'fill-amber-500', text: 'text-amber-600 dark:text-amber-400' },
    rose: { stroke: 'stroke-rose-500', dot: 'bg-rose-500', fill: 'fill-rose-500', text: 'text-rose-600 dark:text-rose-400' },
    slate: { stroke: 'stroke-slate-300 dark:stroke-slate-600', dot: 'bg-slate-300 dark:bg-slate-600', fill: 'fill-slate-300', text: 'text-slate-500' },
}

/**
 * Donut chart with a legend. `segments` is [{ key, label, value, color }]; segments with a zero value
 * keep their legend row (so the chart doesn't reshuffle between refreshes) but draw no arc.
 * `formatValue` renders the legend figure — money for receivables, a plain count for stock.
 */
export function Donut({ segments = [], centerValue, centerLabel, emptyText, size = 116, thickness = 14, formatValue = (v) => v }) {
    const total = segments.reduce((sum, s) => sum + (Number(s.value) || 0), 0)
    const r = (size - thickness) / 2
    const circumference = 2 * Math.PI * r

    // Arcs are drawn as dashed circle strokes: one visible dash sized to the segment's share, offset by
    // everything already drawn. Rotating -90° puts the first segment at 12 o'clock.
    let drawn = 0

    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="relative shrink-0" style={{ width: size, height: size }}>
                <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-slate-100 dark:stroke-slate-800" />
                    {total > 0 &&
                        segments.map((s) => {
                            const value = Number(s.value) || 0
                            if (value <= 0) return null
                            const len = (value / total) * circumference
                            const offset = -drawn
                            drawn += len
                            return (
                                <circle
                                    key={s.key}
                                    cx={size / 2}
                                    cy={size / 2}
                                    r={r}
                                    fill="none"
                                    strokeWidth={thickness}
                                    strokeDasharray={`${len} ${circumference - len}`}
                                    strokeDashoffset={offset}
                                    className={(ACCENT[s.color] || ACCENT.slate).stroke}
                                >
                                    <title>{`${s.label} · ${formatValue(value)}`}</title>
                                </circle>
                            )
                        })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xl font-bold tabular-nums leading-none text-slate-900 dark:text-slate-50">{centerValue}</span>
                    {centerLabel && <span className="mt-1 px-2 text-[10px] uppercase tracking-wide text-slate-400">{centerLabel}</span>}
                </div>
            </div>

            <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                {total === 0 && emptyText ? (
                    <li className="text-slate-400 dark:text-slate-500">{emptyText}</li>
                ) : (
                    segments.map((s) => (
                        <li key={s.key} className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${(ACCENT[s.color] || ACCENT.slate).dot}`} />
                                <span className="truncate text-slate-600 dark:text-slate-300">{s.label}</span>
                            </span>
                            <span className="shrink-0 tabular-nums font-medium text-slate-700 dark:text-slate-200">{formatValue(s.value)}</span>
                        </li>
                    ))
                )}
            </ul>
        </div>
    )
}

/**
 * Bare trend line with a soft area beneath — no axes or labels, meant to sit inside a KPI card. The
 * vertical scale spans the series' own min..max so a flat-but-nonzero series still reads as flat.
 */
export function Sparkline({ values = [], color = 'teal', width = 96, height = 28 }) {
    const nums = values.map((v) => Number(v) || 0)
    if (nums.length < 2) return null

    const max = Math.max(...nums)
    const min = Math.min(...nums)
    const span = max - min || 1
    const step = width / (nums.length - 1)
    const y = (v) => height - 2 - ((v - min) / span) * (height - 4)
    const points = nums.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`)
    const accent = ACCENT[color] || ACCENT.teal

    return (
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="shrink-0 overflow-visible" aria-hidden="true">
            <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} className={`${accent.fill} opacity-10`} />
            <polyline points={points.join(' ')} fill="none" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" className={accent.stroke} />
            <circle cx={width} cy={y(nums[nums.length - 1])} r="2" className={accent.fill} />
        </svg>
    )
}
