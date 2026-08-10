import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Play, Trophy, Percent, Landmark, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { apiGet } from '../api/client'
import StatCard from './StatCard'
import StatusBadge from './StatusBadge'
import LoadingBlock from './LoadingBlock'
import RevenueSpendChart from './RevenueSpendChart'
import TenderCountChart from './TenderCountChart'
import { formatMoney, formatDate } from '../utils/format'

const RANGES = ['month', 'quarter', 'year', 'last12', 'all']
const DAY_MS = 86400000

// Preset range key → [from, to] ISO date strings (null = unbounded). Tenders are filtered by publishedAt.
function rangeDates(key) {
    const now = new Date()
    const iso = (d) => d.toISOString().slice(0, 10)
    const y = now.getFullYear()
    const m = now.getMonth()
    switch (key) {
        case 'month':
            return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))]
        case 'quarter': // last 3 months
            return [iso(new Date(y, m - 2, 1)), iso(now)]
        case 'year':
            return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))]
        case 'last12':
            return [iso(new Date(y, m - 11, 1)), iso(now)]
        case 'all':
        default:
            return [null, null]
    }
}

// Self-contained tenders analytics view: owns the range selector and its own fetch. Money cards and the
// money chart are only rendered when the current user can see prices (gated by the caller).
export default function TenderDashboard({ canSeePrices, baseCurrency }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [range, setRange] = useState('last12')
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        const [from, to] = rangeDates(range)
        const params = new URLSearchParams()
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        apiGet(`/tenders/dashboard?${params.toString()}`)
            .then((res) => !cancelled && setData(res))
            .catch(() => !cancelled && setData(null))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [range])

    const kpis = data?.kpis
    const money = (v) => formatMoney(v ?? 0, data?.baseCurrency || baseCurrency)

    return (
        <div className="space-y-6">
            {/* Range selector */}
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                {RANGES.map((r) => (
                    <button
                        key={r}
                        type="button"
                        onClick={() => setRange(r)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            range === r
                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                    >
                        {t(`tenders.dashboard.range.${r}`)}
                    </button>
                ))}
            </div>

            {loading ? (
                <LoadingBlock text={t('tenders.dashboard.loading')} />
            ) : !data ? (
                <LoadingBlock text={t('tenders.dashboard.noData')} />
            ) : (
                <>
                    {/* KPI cards */}
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                        <StatCard compact icon={Play} title={t('tenders.dashboard.kpi.running')} value={kpis.runningTenders} hint={t('tenders.dashboard.kpi.runningHint')} color="blue" />
                        <StatCard compact icon={FileText} title={t('tenders.dashboard.kpi.total')} value={kpis.totalTenders} hint={t('tenders.dashboard.kpi.totalHint')} color="teal" />
                        <StatCard compact icon={Trophy} title={t('tenders.dashboard.kpi.won')} value={kpis.wonTenders} hint={t('tenders.dashboard.kpi.wonHint', { count: kpis.participatingTenders })} color="amber" />
                        <StatCard compact icon={Percent} title={t('tenders.dashboard.kpi.winRate')} value={kpis.winRate != null ? `${kpis.winRate}%` : '—'} hint={t('tenders.dashboard.kpi.winRateHint', { won: kpis.wonParts, lost: kpis.lostParts })} color="teal" />
                        {canSeePrices && <StatCard compact icon={Landmark} title={t('tenders.dashboard.kpi.estimatedValue')} value={money(kpis.estimatedValueTotal)} hint={t('tenders.dashboard.kpi.estimatedValueHint')} color="blue" />}
                        {canSeePrices && <StatCard compact icon={TrendingUp} title={t('tenders.dashboard.kpi.revenue')} value={money(kpis.revenue)} hint={t('tenders.dashboard.kpi.fromSales')} color="teal" />}
                        {canSeePrices && <StatCard compact icon={TrendingDown} title={t('tenders.dashboard.kpi.spending')} value={money(kpis.spending)} hint={t('tenders.dashboard.kpi.fromPurchases')} color="amber" />}
                        {canSeePrices && <StatCard compact icon={Wallet} title={t('tenders.dashboard.kpi.profit')} value={money(kpis.profit)} hint={t('tenders.dashboard.kpi.profitHint')} color={Number(kpis.profit) >= 0 ? 'teal' : 'rose'} />}
                    </div>

                    {/* Charts */}
                    <div className={`grid gap-4 ${canSeePrices ? 'lg:grid-cols-2' : ''}`}>
                        <Panel title={t('tenders.dashboard.chart.tendersPerMonth')}>
                            <div className="h-64">
                                <TenderCountChart data={data.monthly || []} />
                            </div>
                        </Panel>
                        {canSeePrices && (
                            <Panel title={t('tenders.dashboard.chart.revenueVsSpend')}>
                                <div className="h-64">
                                    <RevenueSpendChart bare data={data.monthly || []} />
                                </div>
                                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{t('tenders.dashboard.chart.revenueSpendNote')}</p>
                            </Panel>
                        )}
                    </div>

                    {/* Status breakdown + top by value */}
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Panel title={t('tenders.dashboard.statusBreakdown')}>
                            <StatusBars rows={data.statusBreakdown || []} t={t} />
                        </Panel>
                        <Panel title={t('tenders.dashboard.topByValue')}>
                            <TopValueList rows={data.topByValue || []} canSeePrices={canSeePrices} money={money} navigate={navigate} t={t} />
                        </Panel>
                    </div>

                    {/* Upcoming deadlines */}
                    <Panel title={t('tenders.dashboard.upcomingDeadlines')}>
                        <DeadlineList rows={data.upcomingDeadlines || []} canSeePrices={canSeePrices} money={money} navigate={navigate} t={t} />
                    </Panel>
                </>
            )}
        </div>
    )
}

function Panel({ title, children }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
            {children}
        </div>
    )
}

function Empty({ t }) {
    return <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">{t('tenders.dashboard.empty')}</p>
}

// Status distribution as proportional horizontal bars (RankList-style), labelled with the status badge.
function StatusBars({ rows, t }) {
    if (!rows.length) return <Empty t={t} />
    const max = Math.max(1, ...rows.map((r) => r.count))
    return (
        <ul className="space-y-3">
            {rows.map((r) => {
                const pct = Math.round((r.count / max) * 100)
                return (
                    <li key={r.status}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <StatusBadge status={r.status} />
                            <span className="tabular-nums text-slate-600 dark:text-slate-300">{r.count}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" style={{ width: `${pct}%` }} />
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}

function TopValueList({ rows, canSeePrices, money, navigate, t }) {
    if (!rows.length) return <Empty t={t} />
    return (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
                <li key={r.id}>
                    <button type="button" onClick={() => navigate(`/tenders/${r.id}`)} className="flex w-full items-center gap-3 py-2.5 text-left transition hover:opacity-80">
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{r.title || `#${r.id}`}</span>
                            <span className="mt-0.5 block"><StatusBadge status={r.status} /></span>
                        </span>
                        <span className="shrink-0 text-right">
                            {canSeePrices && <span className="block text-sm font-semibold tabular-nums">{money(r.value)}</span>}
                            {r.wonCount > 0 && (
                                <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                    {t('tenders.dashboard.wonParts', { count: r.wonCount })}
                                </span>
                            )}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    )
}

function DeadlineList({ rows, canSeePrices, money, navigate, t }) {
    if (!rows.length) return <Empty t={t} />
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                        <th className="py-2 pr-3 font-semibold">{t('tenders.dashboard.cols.tender')}</th>
                        <th className="py-2 pr-3 font-semibold">{t('common.status')}</th>
                        <th className="py-2 pr-3 font-semibold">{t('tenders.dashboard.cols.deadline')}</th>
                        {canSeePrices && <th className="py-2 text-right font-semibold">{t('tenders.dashboard.cols.value')}</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => {
                        const dl = r.deadline ? new Date(r.deadline) : null
                        const daysLeft = dl ? Math.round((dl.getTime() - today.getTime()) / DAY_MS) : null
                        return (
                            <tr
                                key={r.id}
                                onClick={() => navigate(`/tenders/${r.id}`)}
                                className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                            >
                                <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">{r.title || `#${r.id}`}</td>
                                <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                                <td className="py-2 pr-3">
                                    <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                        {formatDate(r.deadline)}
                                        {daysLeft != null && (
                                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                {t('tenders.dashboard.daysLeft', { count: daysLeft })}
                                            </span>
                                        )}
                                    </span>
                                </td>
                                {canSeePrices && <td className="py-2 text-right tabular-nums">{money(r.value)}</td>}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
