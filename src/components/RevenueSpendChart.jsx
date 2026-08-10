import { useTranslation } from 'react-i18next'
import { formatMoney } from '../utils/format'

// Dependency-free grouped SVG bar chart for the dashboard: monthly revenue (sales) next to spend
// (purchases). `data` is the backend `monthly` array: [{ month: 'YYYY-MM', revenue, spend }, ...].
// `showRevenue` / `showSpend` let the caller drop a series the user has no permission to see.
const W = 760
const H = 280
const PAD = { top: 16, right: 16, bottom: 36, left: 64 }

function formatMonth(ym) {
    const [y, m] = ym.split('-')
    const date = new Date(Number(y), Number(m) - 1, 1)
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

export default function RevenueSpendChart({ data = [], showRevenue = true, showSpend = true, bare = false }) {
    const { t } = useTranslation()
    const series = [
        showRevenue && { key: 'revenue', label: t('dashboard.chart.revenue'), bar: 'fill-teal-500', dot: 'bg-teal-500' },
        showSpend && { key: 'spend', label: t('dashboard.chart.spend'), bar: 'fill-secondary-300', dot: 'bg-secondary-300' },
    ].filter(Boolean)

    // The net line only means something when both sides of it are on the chart.
    const showNet = showRevenue && showSpend
    const nets = showNet ? data.map((d) => (Number(d.revenue) || 0) - (Number(d.spend) || 0)) : []

    const values = data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))
    // The scale spans the net line too, so a loss-making month pushes the baseline off the floor and
    // bars keep growing up from zero rather than from the bottom of the plot.
    const top = Math.max(1, ...values, ...nets)
    const floor = Math.min(0, ...nets)
    const span = top - floor
    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom
    const yOf = (v) => PAD.top + plotH * (1 - (v - floor) / span)
    const zeroY = yOf(0)
    const slot = data.length > 0 ? plotW / data.length : plotW
    const groupW = Math.min(slot * 0.7, 48)
    const barW = series.length > 0 ? groupW / series.length : groupW
    const labelEvery = Math.ceil(data.length / 12) || 1
    const gridLines = [0, 0.25, 0.5, 0.75, 1]
    const centerX = (i) => PAD.left + slot * i + slot / 2

    const hasData = data.length > 0 && series.length > 0

    return (
        <div className={bare ? 'flex h-full flex-col' : 'rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900'}>
            <div className={`flex flex-wrap items-center gap-3 ${bare ? 'mb-2 justify-end' : 'mb-4 justify-between'}`}>
                {!bare && <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('dashboard.chart.revenueVsSpend')}</h2>}
                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    {series.map((s) => (
                        <span key={s.key} className="inline-flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                            {s.label}
                        </span>
                    ))}
                    {showNet && (
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-0.5 w-4 rounded-full bg-amber-500" />
                            {t('dashboard.chart.net')}
                        </span>
                    )}
                </div>
            </div>

            {!hasData ? (
                <div className={`flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 ${bare ? 'min-h-0 flex-1' : 'h-56'}`}>
                    {t('dashboard.chart.noActivity')}
                </div>
            ) : (
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="xMidYMid meet"
                    className={bare ? 'min-h-0 w-full flex-1' : 'w-full'}
                    role="img"
                    aria-label="Revenue and spend per month"
                >
                    {gridLines.map((g) => {
                        const value = floor + span * g
                        const y = yOf(value)
                        return (
                            <g key={g}>
                                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
                                <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
                                    {formatMoney(value)}
                                </text>
                            </g>
                        )
                    })}

                    {/* Zero baseline, drawn only when the scale dips below it (a loss-making month). */}
                    {floor < 0 && (
                        <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1" />
                    )}

                    {data.map((d, i) => {
                        const groupX = PAD.left + slot * i + (slot - groupW) / 2
                        return (
                            <g key={d.month}>
                                {series.map((s, si) => {
                                    const v = Number(d[s.key]) || 0
                                    const y = yOf(v)
                                    const x = groupX + si * barW
                                    return (
                                        <rect key={s.key} x={x} y={y} width={Math.max(2, barW - 2)} height={Math.max(0, zeroY - y)} rx="2" className={s.bar}>
                                            <title>{`${formatMonth(d.month)} · ${s.label} ${formatMoney(v)}`}</title>
                                        </rect>
                                    )
                                })}
                                {i % labelEvery === 0 && (
                                    <text
                                        x={centerX(i)}
                                        y={H - PAD.bottom + 18}
                                        textAnchor="middle"
                                        className="fill-slate-400 text-[10px]"
                                    >
                                        {formatMonth(d.month)}
                                    </text>
                                )}
                            </g>
                        )
                    })}

                    {/* Net result (revenue − spend) tracked over the bars. */}
                    {showNet && nets.length > 1 && (
                        <polyline
                            points={nets.map((n, i) => `${centerX(i).toFixed(1)},${yOf(n).toFixed(1)}`).join(' ')}
                            fill="none"
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            className="stroke-amber-500"
                        />
                    )}
                    {showNet &&
                        nets.map((n, i) => (
                            <circle key={data[i].month} cx={centerX(i)} cy={yOf(n)} r="2.5" className="fill-amber-500">
                                <title>{`${formatMonth(data[i].month)} · ${t('dashboard.chart.net')} ${formatMoney(n)}`}</title>
                            </circle>
                        ))}
                </svg>
            )}
        </div>
    )
}
