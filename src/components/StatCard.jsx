import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

// Optional month-over-month trend pill. `good` flags whether an increase is a good thing (revenue up
// is good, spend up is not), so the colour reflects business meaning rather than just direction.
function Trend({ pct, good = true }) {
    if (pct == null || !Number.isFinite(pct)) return null
    const up = pct >= 0
    const positive = up === good
    const color = positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
    const Arrow = up ? ArrowUpRight : ArrowDownRight
    return (
        <span className={`inline-flex shrink-0 items-center gap-0.5 font-medium ${color}`}>
            <Arrow className="h-3.5 w-3.5" />
            {Math.abs(pct).toFixed(0)}%
        </span>
    )
}

// Palette-aligned accents (brand teal, secondary blue, amber, danger rose) — no off-palette hues.
const ACCENT = {
    teal: { badge: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300', dot: 'bg-teal-500' },
    blue: { badge: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-500/15 dark:text-secondary-300', dot: 'bg-secondary-500' },
    amber: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', dot: 'bg-amber-500' },
    rose: { badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', dot: 'bg-rose-500' },
}

export default function StatCard({ title, value, hint, color = 'teal', trend, compact = false, icon: Icon }) {
    const accent = ACCENT[color] || ACCENT.teal

    return (
        <div className={`shadow-card rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-card-md dark:border-slate-800 dark:bg-slate-900 ${compact ? 'p-3 sm:p-4' : 'p-3 sm:p-5'}`}>
            <div className="flex items-start justify-between gap-3">
                <p className="truncate text-xs font-medium text-slate-500 sm:text-sm dark:text-slate-400">{title}</p>
                {Icon ? (
                    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl ${accent.badge} ${compact ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-8 w-8 sm:h-9 sm:w-9'}`}>
                        <Icon className={compact ? 'h-3.5 w-3.5 sm:h-4 sm:w-4' : 'h-4 w-4 sm:h-[18px] sm:w-[18px]'} />
                    </span>
                ) : (
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${accent.dot}`} />
                )}
            </div>
            <p className={`mt-2 truncate font-bold tracking-tight tabular-nums ${compact ? 'text-lg sm:text-2xl' : 'text-xl sm:text-3xl'}`}>{value}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 sm:mt-1.5 sm:gap-2 sm:text-xs dark:text-slate-400">
                {trend ? <Trend pct={trend.pct} good={trend.good} /> : null}
                {hint ? <span className="truncate">{hint}</span> : null}
            </p>
        </div>
    )
}
