import { useTranslation } from 'react-i18next'

// Dependency-free grouped SVG bar chart: per month, tenders published next to their parts (lots), with the
// won subset overlaid in a darker shade on each bar. `data` is the analytics `monthly` array:
// [{ month: 'YYYY-MM', count, won, parts, wonParts, ... }, ...]. Mirrors RevenueSpendChart's sizing.
const W = 760
const H = 240
const PAD = { top: 16, right: 16, bottom: 36, left: 36 }

function formatMonth(ym) {
    const [y, m] = ym.split('-')
    const date = new Date(Number(y), Number(m) - 1, 1)
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

export default function TenderCountChart({ data = [] }) {
    const { t } = useTranslation()
    const series = [
        { key: 'count', wonKey: 'won', label: t('tenders.dashboard.chart.tenders'), base: 'fill-teal-300 dark:fill-teal-500/40', won: 'fill-teal-600', dot: 'bg-teal-400' },
        { key: 'parts', wonKey: 'wonParts', label: t('tenders.dashboard.chart.parts'), base: 'fill-secondary-300 dark:fill-secondary-500/40', won: 'fill-secondary-600', dot: 'bg-secondary-400' },
    ]

    const values = data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))
    const max = Math.max(1, ...values)
    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom
    const slot = data.length > 0 ? plotW / data.length : plotW
    const groupW = Math.min(slot * 0.7, 44)
    const barW = groupW / series.length
    const labelEvery = Math.ceil(data.length / 12) || 1
    const gridLines = [0, 0.5, 1]
    const hasData = data.length > 0 && values.some((v) => v > 0)

    return (
        <div className="flex h-full flex-col">
            <div className="mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                {series.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} /> {s.label}</span>
                ))}
                <span className="text-slate-400 dark:text-slate-500">{t('tenders.dashboard.chart.darkerWon')}</span>
            </div>

            {!hasData ? (
                <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                    {t('tenders.dashboard.chart.noData')}
                </div>
            ) : (
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="min-h-0 w-full flex-1" role="img" aria-label="Tenders and parts per month">
                    {gridLines.map((g) => {
                        const y = PAD.top + plotH * (1 - g)
                        return (
                            <g key={g}>
                                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
                                <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{Math.round(max * g)}</text>
                            </g>
                        )
                    })}

                    {data.map((d, i) => {
                        const groupX = PAD.left + slot * i + (slot - groupW) / 2
                        return (
                            <g key={d.month}>
                                {series.map((s, si) => {
                                    const total = Number(d[s.key]) || 0
                                    const won = Number(d[s.wonKey]) || 0
                                    const x = groupX + si * barW
                                    const w = Math.max(2, barW - 2)
                                    const totalH = (total / max) * plotH
                                    const wonH = (won / max) * plotH
                                    return (
                                        <g key={s.key}>
                                            <rect x={x} y={PAD.top + plotH - totalH} width={w} height={totalH} rx="2" className={s.base}>
                                                <title>{`${formatMonth(d.month)} · ${s.label} ${total}`}</title>
                                            </rect>
                                            {won > 0 && (
                                                <rect x={x} y={PAD.top + plotH - wonH} width={w} height={wonH} rx="2" className={s.won}>
                                                    <title>{`${formatMonth(d.month)} · ${s.label} · ${t('tenders.dashboard.chart.won')} ${won}`}</title>
                                                </rect>
                                            )}
                                        </g>
                                    )
                                })}
                                {i % labelEvery === 0 && (
                                    <text x={PAD.left + slot * i + slot / 2} y={H - PAD.bottom + 18} textAnchor="middle" className="fill-slate-400 text-[10px]">{formatMonth(d.month)}</text>
                                )}
                            </g>
                        )
                    })}
                </svg>
            )}
        </div>
    )
}
