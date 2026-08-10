import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Package, ShoppingCart } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { Donut } from './MicroCharts'
import { formatMoney, formatDate } from '../utils/format'

// Day-thresholds offered by the expiring-lots widget's selector.
const EXPIRY_THRESHOLDS = [7, 30, 60, 90]
const DAY_MS = 86400000

// How many rows a dashboard list shows before deferring to its "view all" link. Short on purpose:
// the widgets are meant to be glanced at, and the list pages exist for the full set.
export const WIDGET_ROWS = 6

// The activity feed's rows carry an icon and two lines each, so they run about half again as tall as a
// table row — it shows one fewer to fit the same slot.
const ACTIVITY_ROWS = 5

/**
 * The "showing 6 of 23" line under a truncated dashboard list. Renders nothing when the widget is
 * already showing everything, so a short list carries no pointless footer.
 */
export function ShowingCount({ shown, total }) {
    const { t } = useTranslation()
    if (!total || total <= shown) return null
    return (
        <p className="mt-2 shrink-0 border-t border-slate-100 pt-2 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
            {t('dashboard.showingOf', { shown, total })}
        </p>
    )
}

const ACTIVITY_META = {
    SALE: { icon: ShoppingCart, tone: 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300', verbKey: 'sale', route: '/sales-orders' },
    PURCHASE: { icon: Package, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300', verbKey: 'purchase', route: '/purchase-orders' },
    TENDER: { icon: FileText, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300', verbKey: 'tender', route: '/tenders' },
}

// Unified recent-activity stream across sales, purchases and tenders. Rows link to the matching
// list page (there is no per-record detail route for orders/tenders).
export function ActivityFeed({ items = [], onNavigate }) {
    const { t } = useTranslation()
    if (items.length === 0) {
        return <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">{t('dashboard.activity.none')}</p>
    }
    const visible = items.slice(0, ACTIVITY_ROWS)
    return (
        <div className="flex h-full flex-col">
            <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                {visible.map((item) => {
                    const meta = ACTIVITY_META[item.type] || ACTIVITY_META.SALE
                    const Icon = meta.icon
                    const verb = t(`dashboard.activity.${meta.verbKey}`)
                    return (
                        <li key={`${item.type}-${item.id}`}>
                            <button
                                type="button"
                                onClick={() => onNavigate?.(meta.route)}
                                className="flex w-full items-center gap-3 py-2.5 text-left transition hover:opacity-80"
                            >
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}>
                                    <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.label || `${verb} #${item.id}`}</span>
                                    <span className="block text-xs text-slate-400 dark:text-slate-500">{verb} · {formatDate(item.date)}</span>
                                </span>
                                <span className="shrink-0 text-right">
                                    <span className="block text-sm font-semibold tabular-nums">{formatMoney(item.amount)}</span>
                                    <span className="mt-0.5 block"><StatusBadge status={item.status} /></span>
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ul>
            <ShowingCount shown={visible.length} total={items.length} />
        </div>
    )
}

// Lots that are already expired (red) or expiring within a user-chosen day window (amber). The
// backend ships every lot expiring within its horizon (90 days) plus all expired ones; the selector
// just narrows the "soon" set client-side. Rows link to the product detail page.
export function ExpiringLots({ rows = [], onNavigate }) {
    const { t } = useTranslation()
    const [days, setDays] = useState(30)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const classified = rows
        .map((r) => {
            const exp = r.expiryDate ? new Date(r.expiryDate) : null
            const daysLeft = exp ? Math.round((exp.getTime() - today.getTime()) / DAY_MS) : null
            return { ...r, daysLeft, expired: daysLeft != null && daysLeft < 0 }
        })
        .filter((r) => r.daysLeft != null)
    const expired = classified.filter((r) => r.expired)
    const soon = classified.filter((r) => !r.expired && r.daysLeft <= days)
    const matching = [...expired, ...soon] // backend already sorts by expiry asc, so expired leads
    const visible = matching.slice(0, WIDGET_ROWS)

    return (
        <div className="flex h-full flex-col">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-3 text-xs font-medium">
                    <span className="text-rose-600 dark:text-rose-400">{expired.length} {t('dashboard.expiry.expired')}</span>
                    <span className="text-amber-600 dark:text-amber-400">{soon.length} {t('dashboard.expiry.expiringSoon')}</span>
                </div>
                <div className="inline-flex gap-0.5 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                    {EXPIRY_THRESHOLDS.map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDays(d)}
                            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                                days === d
                                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {visible.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">{t('dashboard.expiry.none')}</p>
            ) : (
                <>
                <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                                <th className="py-2 pr-3 font-semibold">{t('dashboard.expiry.product')}</th>
                                <th className="py-2 pr-3 font-semibold">{t('dashboard.expiry.lot')}</th>
                                <th className="py-2 pr-3 font-semibold">{t('dashboard.expiry.warehouse')}</th>
                                <th className="py-2 pr-3 font-semibold">{t('dashboard.expiry.qty')}</th>
                                <th className="py-2 font-semibold">{t('dashboard.expiry.expires')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((r, i) => (
                                <tr
                                    key={`${r.productId}-${r.lotNumber}-${i}`}
                                    onClick={onNavigate && r.productId ? () => onNavigate(`/products/${r.productId}`) : undefined}
                                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                                        onNavigate && r.productId ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40' : ''
                                    }`}
                                >
                                    <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">{r.productName || '—'}</td>
                                    <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{r.lotNumber}</td>
                                    <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{r.warehouseName || '—'}</td>
                                    <td className="py-2 pr-3 tabular-nums">{r.quantity}</td>
                                    <td className="py-2">
                                        <span className={`inline-flex items-center gap-2 ${r.expired ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                            {formatDate(r.expiryDate)}
                                            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                                                r.expired
                                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                            }`}>
                                                {r.expired ? t('dashboard.expiry.expiredTag') : `${r.daysLeft}d`}
                                            </span>
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <ShowingCount shown={visible.length} total={matching.length} />
                </>
            )}
        </div>
    )
}

// Per-invoice amounts carry their own currency snapshot, unlike the EUR-only formatMoney helper.
function rowMoney(value, currency) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'EUR',
        minimumFractionDigits: 2,
    }).format(Number(value || 0))
}

function ReceivableStat({ label, value, sub, tone }) {
    const toneClass = {
        slate: 'text-slate-800 dark:text-slate-100',
        rose: 'text-rose-600 dark:text-rose-400',
        amber: 'text-amber-600 dark:text-amber-400',
    }[tone] || 'text-slate-800 dark:text-slate-100'
    return (
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${toneClass}`}>{value}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">{sub}</div>
        </div>
    )
}

// Outstanding customer invoices: unpaid / overdue / penalty totals, plus the largest overdue balances.
// Rows link to the related sales order (there is no standalone invoices page).
// How late the overdue money is, in the order the backend buckets it.
const AGING_COLORS = { D1_30: 'amber', D31_60: 'rose', D60_PLUS: 'slate' }

export function Receivables({ data, onNavigate }) {
    const { t } = useTranslation()
    if (!data) return null
    const rows = data.topOverdue || []
    const aging = (data.aging || []).map((b) => ({
        key: b.bucket,
        label: t(`dashboard.receivables.aging.${b.bucket}`),
        value: Number(b.amount) || 0,
        color: AGING_COLORS[b.bucket] || 'slate',
    }))
    return (
        <div className="flex h-full flex-col">
            {/* Totals beside the aging split, so the widget leads with one compact band rather than two.
                The donut covers every overdue invoice, not just the rows listed below it. */}
            <div className="flex flex-wrap items-start gap-4">
                <div className="grid min-w-[260px] flex-1 grid-cols-3 gap-3">
                    <ReceivableStat label={t('dashboard.receivables.unpaid')} value={formatMoney(data.unpaidTotal)} sub={t('dashboard.receivables.countInvoices', { count: data.unpaidCount })} tone="slate" />
                    <ReceivableStat label={t('dashboard.receivables.overdue')} value={formatMoney(data.overdueTotal)} sub={t('dashboard.receivables.countInvoices', { count: data.overdueCount })} tone="rose" />
                    <ReceivableStat label={t('dashboard.receivables.penalty')} value={formatMoney(data.penaltyAccruedTotal)} sub={t('dashboard.receivables.accrued')} tone="amber" />
                </div>
                {aging.length > 0 && (
                    <div className="shrink-0 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{t('dashboard.receivables.agingTitle')}</div>
                        <Donut
                            segments={aging}
                            centerValue={data.overdueCount ?? 0}
                            centerLabel={t('dashboard.receivables.overdue')}
                            emptyText={t('dashboard.receivables.none')}
                            formatValue={(v) => formatMoney(v)}
                            size={92}
                            thickness={12}
                        />
                    </div>
                )}
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-auto">
                {rows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">{t('dashboard.receivables.none')}</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                                <th className="py-2 pr-3 font-semibold">{t('dashboard.receivables.invoice')}</th>
                                <th className="py-2 pr-3 font-semibold">{t('dashboard.receivables.client')}</th>
                                <th className="py-2 pr-3 font-semibold">{t('dashboard.receivables.due')}</th>
                                <th className="py-2 text-right font-semibold">{t('dashboard.receivables.amountDue')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr
                                    key={r.invoiceId}
                                    onClick={onNavigate && r.salesOrderId ? () => onNavigate(`/sales-orders/${r.salesOrderId}`) : undefined}
                                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                                        onNavigate && r.salesOrderId ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40' : ''
                                    }`}
                                >
                                    <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">{r.invoiceNumber || `#${r.invoiceId}`}</td>
                                    <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{r.clientName || '—'}</td>
                                    <td className="py-2 pr-3">
                                        <span className="inline-flex items-center gap-2 text-rose-600 dark:text-rose-400">
                                            {formatDate(r.dueDate)}
                                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                                                {t('dashboard.receivables.daysOverdue', { count: r.daysOverdue })}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="py-2 text-right font-semibold tabular-nums">{rowMoney(r.amountDue, r.currency)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <ShowingCount shown={rows.length} total={data.overdueCount} />
        </div>
    )
}

// How much of the catalogue is below its minimum stock level, as a share of everything stocked.
export function StockHealth({ products }) {
    const { t } = useTranslation()
    const total = Number(products?.total) || 0
    // Guard the subtraction: the two figures come from the same snapshot, but a low count can never
    // sensibly exceed the total.
    const low = Math.min(total, Number(products?.lowStockCount) || 0)

    return (
        <Donut
            segments={[
                { key: 'low', label: t('dashboard.stock.belowMinimum'), value: low, color: 'rose' },
                { key: 'healthy', label: t('dashboard.stock.healthy'), value: total - low, color: 'teal' },
            ]}
            centerValue={total}
            centerLabel={t('dashboard.stock.products')}
            emptyText={t('dashboard.stock.none')}
        />
    )
}

// Top-N ranking list with a proportional bar. `unit` (e.g. "units") shows the secondary quantity.
export function RankList({ rows = [], emptyText, unit }) {
    if (rows.length === 0) {
        return <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">{emptyText}</p>
    }
    const max = Math.max(1, ...rows.map((r) => Number(r.amount) || 0))
    return (
        <ul className="space-y-3">
            {rows.map((row, i) => {
                const amount = Number(row.amount) || 0
                const pct = Math.round((amount / max) * 100)
                return (
                    <li key={row.id ?? i}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200">
                                <span className="mr-2 text-slate-400">{i + 1}.</span>
                                {row.name || '—'}
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
                                {formatMoney(amount)}
                                {unit ? <span className="ml-1 text-xs text-slate-400">· {row.quantity} {unit}</span> : null}
                            </span>
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
