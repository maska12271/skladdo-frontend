import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Pencil, Mail } from 'lucide-react'
import { apiGet } from '../api/client'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import PartnerContacts from '../components/PartnerContacts'
import DataTable from '../components/DataTable'
import LoadingBlock from '../components/LoadingBlock'
import TrendChart from '../components/TrendChart'
import CopyButton from '../components/CopyButton'
import ComposeEmailModal from '../components/ComposeEmailModal'
import SentEmailDetailModal from '../components/SentEmailDetailModal'
import { useModal } from '../hooks/useModal'
import { useAuth, usePermissions } from '../context/AuthContext'
import { formatMoney, formatDate, formatDateTime, safeArray } from '../utils/format'
import { PERIOD_KEYS, periodRange } from '../utils/period'
import { aggregateOrderLines } from '../utils/orderStats'

export default function ClientDetailPage() {
    const { t } = useTranslation()
    const { id } = useParams()
    const navigate = useNavigate()
    const { canEdit } = usePermissions('CLIENTS')
    // Emailing needs both halves - the company's add-on and this user's permission. Same pair as the
    // manufacturer page.
    const { hasAddon } = useAuth()
    const emailsSold = hasAddon('MANUFACTURER_EMAILS')
    const { canCreate: sendPerm, canView: viewPerm } = usePermissions('MANUFACTURER_EMAILS')
    const canSendEmail = sendPerm && emailsSold
    const canViewEmails = viewPerm && emailsSold
    const composeModal = useModal()

    // Clients are buyers: their activity is the sales orders we fulfil for them.
    const CHART_METRICS = {
        units: { label: t('clientDetail.chart.unitsSold'), bar: 'fill-teal-500', accent: 'text-teal-600 dark:text-teal-400', money: false },
        amount: { label: t('clientDetail.chart.revenue'), bar: 'fill-indigo-500', accent: 'text-indigo-600 dark:text-indigo-400', money: true },
    }

    const [client, setClient] = useState(null)
    const [details, setDetails] = useState(null)
    const [period, setPeriod] = useState('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [emailRows, setEmailRows] = useState([])
    const [emailDetailId, setEmailDetailId] = useState(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        Promise.all([apiGet(`/clients/${id}`), apiGet(`/clients/${id}/details`)])
            .then(([clientRes, detailsRes]) => {
                if (cancelled) return
                setClient(clientRes)
                setDetails(detailsRes)
            })
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [id])

    // Sent-email history for this client (only when the caller can view emails).
    const loadEmails = () => {
        if (!canViewEmails) return
        apiGet(`/sent-emails?clientId=${id}&size=100&sortBy=sentAt&sortDir=desc`)
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

    if (loading) return <LoadingBlock text={t('clientDetail.loading')} />
    if (error || !client) {
        return (
            <div className="space-y-4">
                <BackButton onClick={() => navigate('/clients')} label={t('clientDetail.back')} />
                <LoadingBlock text={t('clientDetail.notFound')} />
            </div>
        )
    }

    const orderRows = stats.orders.map((o, i) => ({ ...o, _rid: `o-${o.orderId}-${i}` }))
    const productRows = stats.products

    return (
        <div className="space-y-6">
            <BackButton onClick={() => navigate(-1)} label={t('clientDetail.back')} />

            {/* Header */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-start">
                <div className="space-y-3">
                    <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {client.registrationCode ? `${t('clients.regCode')} ${client.registrationCode}` : t('clientDetail.noRegCode')}
                    </p>
                    <StatusBadge status={client.active ? 'ACTIVE' : 'INACTIVE'} />
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
                            onClick={() => navigate(`/clients?edit=${client.id}`)}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                        >
                            <Pencil className="h-4 w-4" /> {t('clientDetail.edit')}
                        </button>
                    )}
                </div>
            </div>

            {/* Facts */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3">
                    <Fact label={t('clientDetail.facts.registrationCode')} value={client.registrationCode || '—'} copyValue={client.registrationCode} />
                    <Fact label={t('common.email')} value={client.email || '—'} copyValue={client.email} />
                    <Fact label={t('common.phone')} value={client.phone || '—'} copyValue={client.phone} />
                    <Fact label={t('common.country')} value={client.country || '—'} />
                    <Fact label={t('common.address')} value={client.address || '—'} />
                </dl>
                {client.notes && (
                    <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('common.notes')}</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{client.notes}</dd>
                    </div>
                )}
            </div>

            <PartnerContacts basePath={`/clients/${client.id}`} canEdit={canEdit} />

            {/* Analytics */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold">{t('clientDetail.sales')}</h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{rangeCaption}</p>
                </div>
                <PeriodToggle period={period} onChange={setPeriod} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard title={t('clientDetail.stats.totalRevenue')} value={formatMoney(stats.summary.totalAmount)} hint={t('clientDetail.stats.salesOrdersHint', { count: stats.summary.orderCount })} color="teal" />
                <StatCard title={t('clientDetail.stats.unitsSold')} value={stats.summary.totalUnits} hint={t('common.inSelectedPeriod')} color="teal" />
                <StatCard title={t('clientDetail.stats.avgOrderValue')} value={formatMoney(stats.summary.avgOrderValue)} hint={t('clientDetail.stats.perSalesOrder')} color="blue" />
                <StatCard title={t('clientDetail.stats.salesOrders')} value={stats.summary.orderCount} hint={t('common.inSelectedPeriod')} color="blue" />
                <StatCard title={t('clientDetail.stats.productsBought')} value={stats.summary.productCount} hint={t('clientDetail.stats.distinctProducts')} color="amber" />
            </div>

            <TrendChart data={stats.monthly} metrics={CHART_METRICS} initialMetric="units" />

            {/* Sales orders */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('clientDetail.salesOrders', { count: orderRows.length })}</h2>
                <DataTable tableId="client-sales-orders" columns={orderColumns(t)} rows={orderRows} getRowId={(r) => r._rid} initialPageSize={10} />
            </section>

            {/* Products bought */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('clientDetail.productsBought', { count: productRows.length })}</h2>
                <DataTable
                    tableId="client-products"
                    columns={productColumns(t)}
                    rows={productRows}
                    getRowId={(r) => r.productId}
                    onRowClick={(r) => navigate(`/products/${r.productId}`)}
                    initialPageSize={10}
                />
            </section>

            {canViewEmails && emailRows.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold">{t('emails.partnerSection', { count: emailRows.length })}</h2>
                    <DataTable
                        tableId="client-emails"
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
                recipientType="CLIENT"
                recipientIds={[Number(id)]}
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
    { key: 'orderNumber', label: t('clientDetail.cols.orderNumber'), render: (r) => r.orderNumber || `#${r.orderId}` },
    { key: 'orderDate', label: t('common.date'), render: (r) => formatDate(r.orderDate) },
    { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'itemCount', label: t('clientDetail.cols.items') },
    { key: 'quantity', label: t('common.qty') },
    { key: 'total', label: t('common.total'), render: (r) => formatMoney(r.total) },
]

const productColumns = (t) => [
    { key: 'name', label: t('clientDetail.cols.product') },
    { key: 'sku', label: t('common.sku'), render: (r) => r.sku || '—' },
    { key: 'quantity', label: t('clientDetail.cols.qtyBought') },
    { key: 'total', label: t('clientDetail.cols.revenue'), render: (r) => formatMoney(r.total) },
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
