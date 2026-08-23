import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Pencil, Mail } from 'lucide-react'
import { apiGet } from '../api/client'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import DataTable from '../components/DataTable'
import LoadingBlock from '../components/LoadingBlock'
import TrendChart from '../components/TrendChart'
import CopyButton from '../components/CopyButton'
import CategoryChips from '../components/CategoryChips'
import ComposeEmailModal from '../components/ComposeEmailModal'
import SentEmailDetailModal from '../components/SentEmailDetailModal'
import { usePermissions } from '../context/AuthContext'
import { useModal } from '../hooks/useModal'
import { formatMoney, formatDate, formatDateTime, safeArray } from '../utils/format'
import { PERIOD_KEYS, periodRange } from '../utils/period'
import { aggregateOrderLines } from '../utils/orderStats'

export default function ManufacturerDetailPage() {
    const { t } = useTranslation()
    const { id } = useParams()
    const navigate = useNavigate()
    const { canEdit } = usePermissions('MANUFACTURERS')
    const { canCreate: canSendEmail, canView: canViewEmails } = usePermissions('MANUFACTURER_EMAILS')
    const composeModal = useModal()
    const [emailRows, setEmailRows] = useState([])
    const [emailDetailId, setEmailDetailId] = useState(null)

    // Manufacturers are suppliers: their activity is the purchase orders we place with them.
    const CHART_METRICS = {
        units: { label: t('manufacturerDetail.chart.unitsPurchased'), bar: 'fill-amber-500', accent: 'text-amber-600 dark:text-amber-400', money: false },
        amount: { label: t('manufacturerDetail.chart.spend'), bar: 'fill-indigo-500', accent: 'text-indigo-600 dark:text-indigo-400', money: true },
    }

    const [manufacturer, setManufacturer] = useState(null)
    const [details, setDetails] = useState(null)
    const [period, setPeriod] = useState('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        Promise.all([apiGet(`/manufacturers/${id}`), apiGet(`/manufacturers/${id}/details`)])
            .then(([manufacturerRes, detailsRes]) => {
                if (cancelled) return
                setManufacturer(manufacturerRes)
                setDetails(detailsRes)
            })
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [id])

    // Sent-email history for this manufacturer (only when the caller can view emails).
    const loadEmails = () => {
        if (!canViewEmails) return
        apiGet(`/sent-emails?manufacturerId=${id}&size=100&sortBy=sentAt&sortDir=desc`)
            .then((res) => setEmailRows(safeArray(res)))
            .catch(() => {})
    }
    useEffect(() => {
        loadEmails()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, canViewEmails])

    // Period filtering (client-side, from the order lines the endpoint already returned).
    const range = periodRange(period)
    const rangeCaption = range ? `${formatDate(range.start)} – ${formatDate(range.end)}` : t('common.allTime')

    const stats = useMemo(() => {
        const lines = details?.lines || []
        const inRange = (dateStr) => !range || (dateStr && dateStr >= range.start && dateStr <= range.end)
        return aggregateOrderLines(lines.filter((l) => inRange(l.orderDate)))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [details, period])

    if (loading) return <LoadingBlock text={t('manufacturerDetail.loading')} />
    if (error || !manufacturer) {
        return (
            <div className="space-y-4">
                <BackButton onClick={() => navigate('/manufacturers')} label={t('manufacturerDetail.back')} />
                <LoadingBlock text={t('manufacturerDetail.notFound')} />
            </div>
        )
    }

    const orderRows = stats.orders.map((o, i) => ({ ...o, _rid: `o-${o.orderId}-${i}` }))
    const productRows = stats.products

    return (
        <div className="space-y-6">
            <BackButton onClick={() => navigate(-1)} label={t('manufacturerDetail.back')} />

            {/* Header */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-start">
                <div className="space-y-3">
                    <h1 className="text-2xl font-bold tracking-tight">{manufacturer.name}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {manufacturer.country || t('manufacturerDetail.noCountry')}
                        {manufacturer.website ? ` · ${manufacturer.website}` : ''}
                    </p>
                    <StatusBadge status={manufacturer.active ? 'ACTIVE' : 'INACTIVE'} />
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                    {canSendEmail && (
                        <button
                            onClick={composeModal.open}
                            className="inline-flex items-center gap-2 rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
                        >
                            <Mail className="h-4 w-4" /> {t('emails.sendEmail')}
                        </button>
                    )}
                    {canEdit && (
                        <button
                            onClick={() => navigate(`/manufacturers?edit=${manufacturer.id}`)}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                        >
                            <Pencil className="h-4 w-4" /> {t('manufacturerDetail.edit')}
                        </button>
                    )}
                </div>
            </div>

            {/* Facts */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3">
                    <Fact label={t('common.country')} value={manufacturer.country || '—'} />
                    <Fact label={t('common.email')} value={manufacturer.email || '—'} copyValue={manufacturer.email} />
                    <Fact label={t('common.phone')} value={manufacturer.phone || '—'} copyValue={manufacturer.phone} />
                    <Fact
                        label={t('common.website')}
                        copyValue={manufacturer.website}
                        value={
                            manufacturer.website ? (
                                <a href={manufacturer.website} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline dark:text-teal-400">
                                    {manufacturer.website}
                                </a>
                            ) : (
                                '—'
                            )
                        }
                    />
                    <Fact label={t('common.address')} value={manufacturer.address || '—'} />
                    <Fact label={t('partnerCategories.label')} value={<CategoryChips categories={manufacturer.categories} />} />
                    <Fact label={t('manufacturerDetail.facts.productsInCatalogue')} value={details?.catalogProductCount ?? 0} />
                </dl>
                {manufacturer.notes && (
                    <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('common.notes')}</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{manufacturer.notes}</dd>
                    </div>
                )}
            </div>

            {/* Analytics */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold">{t('manufacturerDetail.purchasing')}</h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{rangeCaption}</p>
                </div>
                <PeriodToggle period={period} onChange={setPeriod} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard title={t('manufacturerDetail.stats.totalSpend')} value={formatMoney(stats.summary.totalAmount)} hint={t('manufacturerDetail.stats.purchaseOrdersHint', { count: stats.summary.orderCount })} color="blue" />
                <StatCard title={t('manufacturerDetail.stats.unitsPurchased')} value={stats.summary.totalUnits} hint={t('common.inSelectedPeriod')} color="amber" />
                <StatCard title={t('manufacturerDetail.stats.avgOrderValue')} value={formatMoney(stats.summary.avgOrderValue)} hint={t('manufacturerDetail.stats.perPurchaseOrder')} color="teal" />
                <StatCard title={t('manufacturerDetail.stats.purchaseOrders')} value={stats.summary.orderCount} hint={t('common.inSelectedPeriod')} color="blue" />
                <StatCard title={t('manufacturerDetail.stats.productsPurchased')} value={stats.summary.productCount} hint={t('manufacturerDetail.stats.distinctProducts')} color="teal" />
                <StatCard title={t('manufacturerDetail.stats.productsInCatalogue')} value={details?.catalogProductCount ?? 0} hint={t('manufacturerDetail.stats.allTime')} color="amber" />
            </div>

            <TrendChart data={stats.monthly} metrics={CHART_METRICS} initialMetric="units" />

            {/* Purchase orders */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('manufacturerDetail.purchaseOrders', { count: orderRows.length })}</h2>
                <DataTable tableId="manufacturer-purchase-orders" columns={orderColumns(t)} rows={orderRows} getRowId={(r) => r._rid} initialPageSize={10} />
            </section>

            {/* Products supplied */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('manufacturerDetail.productsPurchased', { count: productRows.length })}</h2>
                <DataTable
                    tableId="manufacturer-products"
                    columns={productColumns(t)}
                    rows={productRows}
                    getRowId={(r) => r.productId}
                    onRowClick={(r) => navigate(`/products/${r.productId}`)}
                    initialPageSize={10}
                />
            </section>

            {/* Sent emails */}
            {canViewEmails && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold">{t('emails.manufacturerSection', { count: emailRows.length })}</h2>
                    <DataTable
                        tableId="manufacturer-emails"
                        columns={emailColumns(t)}
                        rows={emailRows}
                        getRowId={(r) => r.id}
                        onRowClick={(r) => setEmailDetailId(r.id)}
                        initialPageSize={10}
                    />
                </section>
            )}

            <ComposeEmailModal
                isOpen={composeModal.isOpen}
                manufacturerIds={[Number(id)]}
                onClose={composeModal.close}
                onSent={loadEmails}
            />
            <SentEmailDetailModal
                emailId={emailDetailId}
                isOpen={emailDetailId != null}
                onClose={() => setEmailDetailId(null)}
            />
        </div>
    )
}

const emailColumns = (t) => [
    { key: 'subject', label: t('emails.cols.subject'), render: (r) => <span className="line-clamp-1">{r.subject}</span> },
    { key: 'sentAt', label: t('emails.cols.sentAt'), render: (r) => formatDateTime(r.sentAt) },
    { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'viewed', label: t('emails.cols.viewed'), render: (r) => (r.viewed ? t('common.yes') : t('common.no')) },
    { key: 'replied', label: t('emails.cols.replied'), render: (r) => (r.replied ? t('common.yes') : t('common.no')) },
]

const orderColumns = (t) => [
    { key: 'orderNumber', label: t('manufacturerDetail.cols.orderNumber'), render: (r) => r.orderNumber || `#${r.orderId}` },
    { key: 'orderDate', label: t('common.date'), render: (r) => formatDate(r.orderDate) },
    { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'itemCount', label: t('manufacturerDetail.cols.items') },
    { key: 'quantity', label: t('common.qty') },
    { key: 'total', label: t('common.total'), render: (r) => formatMoney(r.total) },
]

const productColumns = (t) => [
    { key: 'name', label: t('manufacturerDetail.cols.product') },
    { key: 'sku', label: t('common.sku'), render: (r) => r.sku || '—' },
    { key: 'quantity', label: t('manufacturerDetail.cols.qtyPurchased') },
    { key: 'total', label: t('manufacturerDetail.cols.totalCost'), render: (r) => formatMoney(r.total) },
]

function PeriodToggle({ period, onChange }) {
    const { t } = useTranslation()
    return (
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
            {PERIOD_KEYS.map((key) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => onChange(key)}
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

function Fact({ label, value, copyValue }) {
    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
            {copyValue ? (
                <dd className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-slate-800 dark:text-slate-100">
                    <span className="min-w-0 truncate">{value}</span>
                    <CopyButton value={copyValue} />
                </dd>
            ) : (
                <dd className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{value}</dd>
            )}
        </div>
    )
}
