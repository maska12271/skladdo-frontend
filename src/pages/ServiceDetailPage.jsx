import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Pencil } from 'lucide-react'
import { apiGet } from '../api/client'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import DataTable from '../components/DataTable'
import LoadingBlock from '../components/LoadingBlock'
import TrendChart from '../components/TrendChart'
import CopyButton from '../components/CopyButton'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { formatMoney, formatDate } from '../utils/format'

// Statistics period preset keys. Order dates are "YYYY-MM-DD" strings, so ranges are compared
// lexicographically (no timezone math). `all` means no bounds. Labels come from the i18n period.*.
const PERIOD_KEYS = ['all', 'thisMonth', 'lastMonth', 'last12', 'thisYear', 'lastYear']

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function periodRange(key, now = new Date()) {
    const y = now.getFullYear()
    const m = now.getMonth()
    switch (key) {
        case 'thisMonth':
            return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)) }
        case 'lastMonth':
            return { start: ymd(new Date(y, m - 1, 1)), end: ymd(new Date(y, m, 0)) }
        case 'last12':
            return { start: ymd(new Date(y, m - 11, 1)), end: ymd(new Date(y, m + 1, 0)) }
        case 'thisYear':
            return { start: `${y}-01-01`, end: `${y}-12-31` }
        case 'lastYear':
            return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
        default:
            return null
    }
}

// Cancelled orders are still listed in the table, but never counted toward revenue.
const isCancelled = (line) => String(line.status || '').toUpperCase() === 'CANCELLED'

/**
 * Recompute the summary from the sales lines in the selected period. The sales-only counterpart of
 * the product page's `summarize` - a service is never purchased into stock, so there is no cost basis
 * and therefore no gross-profit figure to derive.
 */
function summarize(salesLines) {
    let totalUnitsSold = 0
    let totalRevenue = 0
    const salesIds = new Set()
    for (const l of salesLines) {
        if (isCancelled(l)) continue
        totalUnitsSold += l.quantity || 0
        totalRevenue += Number(l.lineTotal) || 0
        if (l.orderId != null) salesIds.add(l.orderId)
    }
    return { totalUnitsSold, totalRevenue, salesOrderCount: salesIds.size }
}

export default function ServiceDetailPage() {
    const { t } = useTranslation()
    const { id } = useParams()
    const navigate = useNavigate()
    const { canEdit } = usePermissions('SERVICES')
    const { canSeePrices } = useAuth()
    const { formatCurrency } = useSettings()

    const [service, setService] = useState(null)
    const [details, setDetails] = useState(null)
    const [period, setPeriod] = useState('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        Promise.all([apiGet(`/services/${id}`), apiGet(`/services/${id}/details`)])
            .then(([serviceRes, detailsRes]) => {
                if (cancelled) return
                setService(serviceRes)
                setDetails(detailsRes)
            })
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [id])

    if (loading) return <LoadingBlock text={t('serviceDetail.loading')} />
    if (error || !service) {
        return (
            <div className="space-y-4">
                <BackButton onClick={() => navigate('/services')} label={t('serviceDetail.back')} />
                <LoadingBlock text={t('serviceDetail.notFound')} />
            </div>
        )
    }

    const audit = details?.audit

    // Period filtering (client-side, from the order lines the endpoint already returned).
    const range = periodRange(period)
    const inRange = (dateStr) => !range || (dateStr && dateStr >= range.start && dateStr <= range.end)
    const rangeCaption = range ? `${formatDate(range.start)} – ${formatDate(range.end)}` : t('common.allTime')

    const allSales = details?.salesOrders || []
    const filteredSales = allSales.filter((o) => inRange(o.orderDate))
    const summary = details ? summarize(filteredSales) : null
    const monthlyView = (details?.monthly || []).filter(
        (pt) => !range || (pt.month >= range.start.slice(0, 7) && pt.month <= range.end.slice(0, 7)),
    )

    const salesRows = filteredSales.map((o, i) => ({ ...o, _rid: `s-${o.orderId}-${i}` }))

    const orderColumns = [
        { key: 'orderNumber', label: t('productDetail.orderCols.orderNumber'), render: (r) => r.orderNumber || `#${r.orderId}` },
        { key: 'orderDate', label: t('common.date'), render: (r) => formatDate(r.orderDate) },
        { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
        { key: 'counterpartyName', label: t('productDetail.orderCols.client'), render: (r) => r.counterpartyName || '-' },
        { key: 'quantity', label: t('common.qty') },
        ...(canSeePrices
            ? [
                { key: 'unitPrice', label: t('productDetail.orderCols.unitPrice'), render: (r) => formatMoney(r.unitPrice) },
                { key: 'lineTotal', label: t('productDetail.orderCols.lineTotal'), render: (r) => formatMoney(r.lineTotal) },
            ]
            : []),
    ]

    return (
        <div className="space-y-6">
            <BackButton onClick={() => navigate(-1)} label={t('serviceDetail.back')} />

            {/* Header */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-start">
                <div className="space-y-3">
                    <h1 className="text-2xl font-bold tracking-tight">{service.name}</h1>
                    <p className="flex flex-wrap items-center gap-x-1 text-sm text-slate-500 dark:text-slate-400">
                        <span>{service.code ? `${t('common.code')} ${service.code}` : t('serviceDetail.noCode')}</span>
                        {service.code && <CopyButton value={service.code} />}
                        {service.category?.name ? <span>{` · ${service.category.name}`}</span> : null}
                    </p>
                    <StatusBadge status={service.active ? 'ACTIVE' : 'INACTIVE'} />
                </div>
                {canEdit && (
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <button
                            onClick={() => navigate(`/services?edit=${service.id}`)}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                        >
                            <Pencil className="h-4 w-4" /> {t('serviceDetail.edit')}
                        </button>
                    </div>
                )}
            </div>

            {/* Facts */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <dl className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                    {canSeePrices && <Fact label={t('serviceDetail.facts.price')} value={formatCurrency(service.price, service.currency)} />}
                    <Fact label={t('serviceDetail.facts.category')} value={service.category?.name || '—'} />
                    <Fact
                        label={t('serviceDetail.facts.taxRate')}
                        value={service.taxRate ? `${service.taxRate.name} (${Number(service.taxRate.percentage)}%)` : '—'}
                    />
                </dl>
                {service.description && (
                    <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('serviceDetail.facts.description')}</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{service.description}</dd>
                    </div>
                )}
            </div>

            {/* Analytics */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold">{t('serviceDetail.performance')}</h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{rangeCaption}</p>
                </div>
                <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
                    {PERIOD_KEYS.map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setPeriod(key)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                period === key
                                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            {t(`period.${key}`)}
                        </button>
                    ))}
                </div>
            </div>

            {summary && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {canSeePrices && <StatCard title={t('serviceDetail.stats.totalRevenue')} value={formatMoney(summary.totalRevenue)} hint={t('productDetail.stats.salesOrdersHint', { count: summary.salesOrderCount })} color="teal" />}
                    <StatCard title={t('serviceDetail.stats.unitsSold')} value={summary.totalUnitsSold} hint={t('common.inSelectedPeriod')} color="teal" />
                </div>
            )}

            {/* Purchases are not a thing for a service, so the chart offers only the two sales metrics. */}
            {canSeePrices && <TrendChart data={monthlyView} metrics={['revenue', 'unitsSold']} />}

            {/* Sales orders */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('productDetail.salesOrders', { count: salesRows.length })}</h2>
                <DataTable
                    tableId="service-sales-orders"
                    columns={orderColumns}
                    rows={salesRows}
                    getRowId={(r) => r._rid}
                    onRowClick={(r) => r.orderId && navigate(`/sales-orders/${r.orderId}`)}
                    initialPageSize={10}
                />
            </section>

            {/* Audit */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <div className="flex flex-col gap-1 sm:flex-row sm:gap-8">
                    <span>
                        {t('productDetail.audit.createdBy')} <span className="font-medium text-slate-700 dark:text-slate-200">{audit?.createdBy?.name || '—'}</span>
                        {audit?.createdAt ? ` · ${formatDate(audit.createdAt)}` : ''}
                    </span>
                    <span>
                        {t('productDetail.audit.lastEditedBy')} <span className="font-medium text-slate-700 dark:text-slate-200">{audit?.updatedBy?.name || '—'}</span>
                        {audit?.updatedAt ? ` · ${formatDate(audit.updatedAt)}` : ''}
                    </span>
                </div>
            </div>
        </div>
    )
}

function BackButton({ onClick, label }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
            <ChevronLeft className="h-4 w-4" /> {label}
        </button>
    )
}

function Fact({ label, value }) {
    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{value}</dd>
        </div>
    )
}
