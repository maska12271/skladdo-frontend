import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Clock, Receipt, Download, CheckCircle2, RotateCcw, FileText, Upload, X, Plus, Ban } from 'lucide-react'
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, apiDownload, apiUpload } from '../api/client'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import DataTable from '../components/DataTable'
import LoadingBlock from '../components/LoadingBlock'
import CopyButton from '../components/CopyButton'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import OrderFulfilmentPanel from '../components/OrderFulfilmentPanel'
import { FormField, FormSelect, TextareaField } from '../components/FormField.jsx'
import { useModal } from '../hooks/useModal'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatDate, toCompanyAmount } from '../utils/format'
import { triggerDownload } from '../utils/download'
import ModalActions from '../components/ModalActions'

// Invoices carry their own currency snapshot; format per-invoice rather than with the EUR-only helper.
function invoiceMoney(value, currency) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'EUR',
        minimumFractionDigits: 2,
    }).format(Number(value || 0))
}

function invoiceDisplayStatus(inv) {
    return inv.status === 'UNPAID' && inv.overdue ? 'OVERDUE' : inv.status
}

const INVOICE_PENALTY_PERIODS = ['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY']
const invToday = () => new Date().toISOString().slice(0, 10)
// Add a day count to an ISO date without pulling in a date library (used for the due-date preview).
const invAddDays = (iso, days) => {
    if (!iso) return ''
    const d = new Date(iso)
    d.setDate(d.getDate() + Number(days || 0))
    return d.toISOString().slice(0, 10)
}

// Sales vs purchase differ only in labels, the endpoint, and which money cards make sense.
const CONFIG = {
    sales: { base: 'sales-orders', module: 'SALES_ORDERS', titleKey: 'orderDetail.salesTitle', backKey: 'orderDetail.backToSales', listPath: '/sales-orders' },
    purchase: { base: 'purchase-orders', module: 'PURCHASE_ORDERS', titleKey: 'orderDetail.purchaseTitle', backKey: 'orderDetail.backToPurchases', listPath: '/purchase-orders' },
}

function formatDateTime(value) {
    if (!value) return '-'
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function OrderDetailPage({ type = 'sales' }) {
    const { t } = useTranslation()
    const cfg = CONFIG[type]
    const { id } = useParams()
    const navigate = useNavigate()
    const orderPerms = usePermissions(cfg.module) // gates the page + the invoice attach actions
    const { canSeePrices } = useAuth()
    const { currency: baseCurrency } = useSettings()
    const isSales = type === 'sales'
    const invoicePerms = usePermissions('INVOICES')
    // Warehouse staff fulfil orders without necessarily being able to edit them, so picking/receiving is
    // open to the inventory permission too — matching the backend's gate on these endpoints.
    const inventoryPerms = usePermissions('INVENTORY')

    const [details, setDetails] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [invoices, setInvoices] = useState([])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        apiGet(`/${cfg.base}/${id}/details`)
            .then((res) => !cancelled && setDetails(res))
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [cfg.base, id])

    // Invoices live on sales orders only, and only when the user has invoice access.
    useEffect(() => {
        if (!isSales || !invoicePerms.canView) return
        let cancelled = false
        apiGet(`/sales-orders/${id}/invoices`)
            .then((res) => !cancelled && setInvoices(Array.isArray(res) ? res : []))
            .catch(() => !cancelled && setInvoices([]))
        return () => {
            cancelled = true
        }
    }, [isSales, invoicePerms.canView, id])

    if (loading) return <LoadingBlock text={t('orderDetail.loading')} />
    if (error || !details) {
        return (
            <div className="space-y-4">
                <BackButton label={t(cfg.backKey)} onClick={() => navigate(cfg.listPath)} />
                <LoadingBlock text={t('orderDetail.notFound')} />
            </div>
        )
    }

    const tot = details.totals || {}
    const audit = details.audit
    // This order's own currency; falls back to the company base currency handled inside formatMoney.
    const orderCurrency = details.currency
    // Company-currency equivalent of the order total, shown when the order is in a foreign currency.
    const isForeign = orderCurrency && baseCurrency && orderCurrency.toUpperCase() !== baseCurrency.toUpperCase()
    const companyTotal = isForeign ? toCompanyAmount(tot.total, details.exchangeRate) : null

    const counterpartyPath = details.counterpartyId
        ? isSales
            ? `/clients/${details.counterpartyId}`
            : `/manufacturers/${details.counterpartyId}`
        : null

    const itemColumns = [
        // A line is either a product or a service; the column shows whichever it is.
        { key: 'productName', label: t('orderDetail.cols.product'), render: (r) => r.productName || r.serviceName || '-' },
        { key: 'sku', label: t('common.sku'), render: (r) => r.sku || '—' },
        // The unit qualifies the number, so it belongs beside it: "3" alone does not say 3 of what.
        // Only products carry one; a service line shows the bare count.
        {
            key: 'quantity',
            label: t('common.qty'),
            render: (r) => (r.unit ? `${r.quantity} ${r.unit}` : r.quantity),
        },
        ...(canSeePrices
            ? [
                { key: 'unitPrice', label: t('orderDetail.cols.unitPrice'), render: (r) => formatMoney(r.unitPrice, orderCurrency) },
                { key: 'lineTotal', label: t('orderDetail.cols.lineTotal'), render: (r) => formatMoney(r.lineTotal, orderCurrency) },
                ...(isSales
                    ? [{ key: 'estUnitCost', label: t('orderDetail.cols.avgCostPerUnit'), render: (r) => (r.estUnitCost != null ? formatMoney(r.estUnitCost) : '—') }]
                    : []),
            ]
            : []),
        // Which lots each line was filled from (sales only). Several chips when the quantity was split.
        ...(isSales
            ? [{
                key: 'lots',
                label: t('orderDetail.cols.lots'),
                render: (r) => {
                    const lots = r.lots || []
                    if (lots.length === 0) return '—'
                    return (
                        <div className="flex flex-wrap gap-1">
                            {lots.map((l, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800"
                                >
                                    <span className="font-medium">{l.lotNumber}</span>
                                    <span className="text-slate-500 dark:text-slate-400">×{l.quantityUsed}</span>
                                    {l.expiryDate && (
                                        <span className="text-slate-400 dark:text-slate-500">· {t('orderDetail.lotExp')} {formatDate(l.expiryDate)}</span>
                                    )}
                                </span>
                            ))}
                        </div>
                    )
                },
            }]
            : []),
    ]
    const itemRows = (details.items || []).map((it, i) => ({ ...it, _rid: `${it.productId ?? `s${it.serviceId}`}-${i}` }))

    return (
        <div className="space-y-6">
            <BackButton label={t(cfg.backKey)} onClick={() => navigate(-1)} />

            {/* Header */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-start">
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight">{details.orderNumber || `#${details.id}`}</h1>
                        <CopyButton value={details.orderNumber || `#${details.id}`} />
                        <StatusBadge status={details.status} />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t(cfg.titleKey)} · {isSales ? t('orderDetail.client') : t('orderDetail.manufacturer')}:{' '}
                        {counterpartyPath ? (
                            <button onClick={() => navigate(counterpartyPath)} className="font-medium text-teal-600 hover:underline dark:text-teal-400">
                                {details.counterpartyName || '—'}
                            </button>
                        ) : (
                            details.counterpartyName || '—'
                        )}
                    </p>
                </div>
            </div>

            {/* Money / quantity summary */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                {canSeePrices && (
                    <StatCard
                        title={isSales ? t('orderDetail.stats.totalEarned') : t('orderDetail.stats.totalSpend')}
                        value={formatMoney(tot.total, orderCurrency)}
                        hint={companyTotal != null ? t('currency.approxIn', { amount: formatMoney(companyTotal, baseCurrency) }) : t('orderDetail.stats.inclDelivery')}
                        color={isSales ? 'teal' : 'amber'}
                    />
                )}
                {canSeePrices && <StatCard title={t('orderDetail.stats.subtotal')} value={formatMoney(tot.subtotal, orderCurrency)} hint={t('orderDetail.stats.itemsOnly')} color="blue" />}
                {canSeePrices && <StatCard title={t('orderDetail.stats.deliveryPrice')} value={formatMoney(tot.deliveryPrice, orderCurrency)} hint={t('orderDetail.stats.perUnit', { value: formatMoney(tot.deliveryPerUnit, orderCurrency) })} color="slate" />}
                <StatCard title={t('orderDetail.stats.units')} value={tot.totalUnits ?? 0} hint={t('orderDetail.stats.productsCount', { count: tot.productCount ?? 0 })} color="blue" />
                {isSales ? (
                    canSeePrices && (
                        <>
                            <StatCard title={t('orderDetail.stats.estCost')} value={formatMoney(tot.estCost)} hint={t('orderDetail.stats.avgPurchaseCost')} color="amber" />
                            <StatCard title={t('orderDetail.stats.estProfit')} value={formatMoney(tot.estProfit)} hint={t('orderDetail.stats.estProfitHint')} color="teal" />
                        </>
                    )
                ) : (
                    <StatCard title={t('orderDetail.stats.items')} value={itemRows.length} hint={t('orderDetail.stats.lineItems')} color="slate" />
                )}
            </div>

            {/* Invoice (sales orders only, requires invoice access) */}
            {isSales && invoicePerms.canView && (
                <InvoiceSection
                    orderId={id}
                    orderStatus={details.status}
                    invoices={invoices}
                    setInvoices={setInvoices}
                    perms={invoicePerms}
                    canSeePrices={canSeePrices}
                    orderGross={Number(tot.totalInclTax) || 0}
                    orderCurrency={orderCurrency}
                />
            )}

            {/* Attached supplier invoice (purchase orders only) */}
            {!isSales && (details.hasInvoiceFile || orderPerms.canEdit) && (
                <PurchaseInvoiceSection
                    orderId={id}
                    fileName={details.invoiceFileName}
                    hasFile={!!details.hasInvoiceFile}
                    canEdit={orderPerms.canEdit}
                    onChanged={(patch) => setDetails((prev) => ({ ...prev, ...patch }))}
                />
            )}

            {/* Line items */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('orderDetail.items', { count: itemRows.length })}</h2>
                <DataTable
                    tableId={`${cfg.base}-detail-items`}
                    columns={itemColumns}
                    rows={itemRows}
                    getRowId={(r) => r._rid}
                    onRowClick={(r) => {
                        if (r.productId) navigate(`/products/${r.productId}`)
                        else if (r.serviceId) navigate(`/services/${r.serviceId}`)
                    }}
                    paginate={false}
                />
            </section>

            {/* Picking / goods-receipt progress (never moves stock — see OrderFulfilmentPanel) */}
            <OrderFulfilmentPanel
                orderId={details.id}
                type={type}
                lines={details.items}
                canFulfil={orderPerms.canEdit || inventoryPerms.canCreate}
                onUpdated={setDetails}
            />

            {/* Facts + timeline */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="mb-4 text-lg font-semibold">{t('orderDetail.details')}</h2>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                        <Fact label={t('orderDetail.facts.orderDate')} value={formatDate(details.orderDate)} />
                        <Fact label={t('orderDetail.facts.closingDate')} value={formatDate(details.closingDate)} />
                        {!isSales && <Fact label={t('orderDetail.facts.expectedDelivery')} value={formatDate(details.expectedDeliveryDate)} />}
                        <Fact label={t(isSales ? 'orderDetail.facts.shipsFrom' : 'orderDetail.facts.receivesInto')} value={details.warehouseName || '—'} />
                        <Fact label={t('orderDetail.facts.deliveryAddress')} value={details.deliveryAddress || '—'} copyValue={details.deliveryAddress} />
                    </dl>
                    {details.notes && (
                        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('common.notes')}</dt>
                            <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{details.notes}</dd>
                        </div>
                    )}
                    <div className="mt-5 flex flex-col gap-1 border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <span>
                            {t('orderDetail.createdBy')} <span className="font-medium text-slate-700 dark:text-slate-200">{audit?.createdBy?.name || '—'}</span>
                            {audit?.createdAt ? ` · ${formatDateTime(audit.createdAt)}` : ''}
                        </span>
                        <span>
                            {t('orderDetail.lastEditedBy')} <span className="font-medium text-slate-700 dark:text-slate-200">{audit?.updatedBy?.name || '—'}</span>
                            {audit?.updatedAt ? ` · ${formatDateTime(audit.updatedAt)}` : ''}
                        </span>
                    </div>
                </div>

                <StatusTimeline events={details.statusHistory || []} />
            </div>
        </div>
    )
}

function StatusTimeline({ events }) {
    const { t } = useTranslation()
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Clock className="h-4 w-4 text-slate-400" /> {t('orderDetail.statusHistory')}
            </h2>
            {events.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">{t('orderDetail.noStatusChanges')}</p>
            ) : (
                <ol className="space-y-4">
                    {events.map((e, i) => (
                        <li key={i} className="relative flex gap-3 pl-1">
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                                    {e.fromStatus ? (
                                        <>
                                            <StatusBadge status={e.fromStatus} />
                                            <span className="text-slate-400">→</span>
                                            <StatusBadge status={e.toStatus} />
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-slate-500 dark:text-slate-400">{t('orderDetail.createdAs')}</span>
                                            <StatusBadge status={e.toStatus} />
                                        </>
                                    )}
                                </div>
                                <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                    {formatDateTime(e.changedAt)}
                                    {e.changedBy?.name ? ` · ${e.changedBy.name}` : ''}
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    )
}

/**
 * Invoice panel on the sales order detail page. Lists the order's active (non-voided) invoices - a
 * prepayment and/or a final invoice - each with its payment status, amounts and Download / Mark Paid /
 * Mark Unpaid / Void actions. A "Create invoice" dialog captures the type, dates, terms and (for a
 * prepayment) the deposit up front, so nothing is generated with silent defaults. Voided invoices are
 * counted below for history.
 */
function InvoiceSection({ orderId, orderStatus, invoices, setInvoices, perms, canSeePrices, orderGross, orderCurrency }) {
    const { t } = useTranslation()
    const toast = useToast()
    const [busy, setBusy] = useState(false)
    const createModal = useModal()
    const paidModal = useModal()
    const voidModal = useModal()
    const [payingInvoice, setPayingInvoice] = useState(null)
    const [voidingInvoice, setVoidingInvoice] = useState(null)

    // Prepayment reads before the final invoice.
    const active = invoices
        .filter((inv) => inv.status !== 'VOID')
        .sort((a, b) => Number(b.type === 'PREPAYMENT') - Number(a.type === 'PREPAYMENT'))
    const voided = invoices.filter((inv) => inv.status === 'VOID')
    const activeTypes = new Set(active.map((inv) => inv.type || 'FINAL'))
    const canCreateMore = perms.canCreate && orderStatus !== 'CANCELLED' && activeTypes.size < 2

    const replace = (updated) => setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)))

    const download = async (inv) => {
        setBusy(true)
        try {
            const blob = await apiDownload(`/invoices/${inv.id}/pdf`)
            triggerDownload(blob, `${inv.invoiceNumber}.pdf`)
        } finally {
            setBusy(false)
        }
    }

    const markUnpaid = async (inv) => {
        setBusy(true)
        try {
            const updated = await apiPatch(`/invoices/${inv.id}/payment`, { status: 'UNPAID' })
            replace(updated)
            toast.success(t('invoices.markedUnpaid'))
        } finally {
            setBusy(false)
        }
    }

    const confirmVoid = (inv) => {
        setVoidingInvoice(inv)
        voidModal.open()
    }

    const handleVoid = async () => {
        if (!voidingInvoice) return
        setBusy(true)
        try {
            const updated = await apiPatch(`/invoices/${voidingInvoice.id}/void`, {})
            replace(updated)
            toast.success(t('invoices.voided'))
            voidModal.close()
            setVoidingInvoice(null)
        } finally {
            setBusy(false)
        }
    }

    const openPaid = (inv) => {
        setPayingInvoice(inv)
        paidModal.open()
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Receipt className="h-4 w-4 text-slate-400" /> {t('invoices.cardTitle')}
                </h2>
                {canCreateMore && (
                    <button
                        onClick={createModal.open}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                        <Plus className="h-4 w-4" /> {t('invoices.create.button')}
                    </button>
                )}
            </div>

            {active.length === 0 ? (
                <div className="flex flex-col items-start gap-2">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('invoices.none')}</p>
                    {orderStatus === 'CANCELLED' && <p className="text-xs text-rose-500">{t('invoices.cancelledOrder')}</p>}
                </div>
            ) : (
                <div className="space-y-4">
                    {active.map((inv) => (
                        <InvoiceCard
                            key={inv.id}
                            inv={inv}
                            perms={perms}
                            canSeePrices={canSeePrices}
                            busy={busy}
                            onDownload={() => download(inv)}
                            onMarkPaid={() => openPaid(inv)}
                            onMarkUnpaid={() => markUnpaid(inv)}
                            onVoid={() => confirmVoid(inv)}
                        />
                    ))}
                </div>
            )}

            {voided.length > 0 && (
                <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-400 dark:border-slate-800">
                    {t('invoices.voidedCount', { count: voided.length })}
                </p>
            )}

            <CreateInvoiceModal
                isOpen={createModal.isOpen}
                onClose={createModal.close}
                orderId={orderId}
                activeTypes={activeTypes}
                orderGross={orderGross}
                currency={orderCurrency}
                onCreated={(created) => {
                    setInvoices((prev) => [created, ...prev])
                    createModal.close()
                    toast.success(t('invoices.generated'))
                }}
            />

            <MarkPaidModal
                isOpen={paidModal.isOpen}
                onClose={() => {
                    paidModal.close()
                    setPayingInvoice(null)
                }}
                invoice={payingInvoice}
                onPaid={(updated) => {
                    replace(updated)
                    paidModal.close()
                    setPayingInvoice(null)
                    toast.success(t('invoices.markedPaid'))
                }}
            />

            <ConfirmModal
                isOpen={voidModal.isOpen}
                title={t('invoices.voidTitle')}
                message={t('invoices.voidConfirm', { number: voidingInvoice?.invoiceNumber || '' })}
                onClose={() => {
                    voidModal.close()
                    setVoidingInvoice(null)
                }}
                onConfirm={handleVoid}
                loading={busy}
            />
        </section>
    )
}

/** A single active invoice: its type, status, dates, amounts and per-invoice actions. */
function InvoiceCard({ inv, perms, canSeePrices, busy, onDownload, onMarkPaid, onMarkUnpaid, onVoid }) {
    const { t } = useTranslation()
    const isPrepayment = (inv.type || 'FINAL') === 'PREPAYMENT'
    return (
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{inv.invoiceNumber}</span>
                    <StatusBadge status={invoiceDisplayStatus(inv)} />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {isPrepayment ? t('invoices.type.PREPAYMENT') : t('invoices.type.FINAL')}
                    </span>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        onClick={onDownload}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                        <Download className="h-4 w-4" /> {t('invoices.download')}
                    </button>
                    {perms.canEdit && inv.status === 'UNPAID' && (
                        <button
                            onClick={onMarkPaid}
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                            <CheckCircle2 className="h-4 w-4" /> {t('invoices.markPaid')}
                        </button>
                    )}
                    {perms.canEdit && inv.status === 'PAID' && (
                        <button
                            onClick={onMarkUnpaid}
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                            <RotateCcw className="h-4 w-4" /> {t('invoices.markUnpaid')}
                        </button>
                    )}
                    {perms.canEdit && (
                        <button
                            onClick={onVoid}
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                            <Ban className="h-4 w-4" /> {t('invoices.void')}
                        </button>
                    )}
                </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Fact label={t('invoices.cols.issueDate')} value={formatDate(inv.issueDate)} />
                <Fact label={t('invoices.cols.dueDate')} value={formatDate(inv.dueDate)} />
                {inv.paidDate && <Fact label={t('invoices.paidOn')} value={formatDate(inv.paidDate)} />}
                {canSeePrices && <Fact label={t('invoices.cols.total')} value={invoiceMoney(inv.totalAmount, inv.currency)} />}
                {canSeePrices && Number(inv.appliedPrepaymentAmount) > 0 && (
                    <Fact
                        label={t('invoices.prepaymentApplied', { number: inv.appliedPrepaymentNumber || '' })}
                        value={`-${invoiceMoney(inv.appliedPrepaymentAmount, inv.currency)}`}
                    />
                )}
                {canSeePrices && inv.status !== 'PAID' && (
                    <Fact label={t('invoices.cols.amountDue')} value={invoiceMoney(inv.amountDue, inv.currency)} />
                )}
                {canSeePrices && Number(inv.penaltyAmount) > 0 && (
                    <Fact label={t('invoices.penalty')} value={invoiceMoney(inv.penaltyAmount, inv.currency)} />
                )}
            </dl>

            {inv.overdue && <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-400">{t('invoices.overdueNote')}</p>}
        </div>
    )
}

/**
 * "Create invoice" dialog. Captures the type (final or prepayment - already-active types are removed),
 * the issue and due dates (a term in days keeps the due date in sync, or it can be set directly), the
 * penalty override, the deposit for a prepayment, and notes. Blank term/penalty fields fall back to the
 * order's or company's defaults on the server.
 */
function CreateInvoiceModal({ isOpen, onClose, orderId, activeTypes, orderGross, currency, onCreated }) {
    const { t } = useTranslation()
    const settings = useSettings()
    const invoiceCurrency = currency || settings.currency
    const finalTaken = activeTypes.has('FINAL')
    const prepaymentTaken = activeTypes.has('PREPAYMENT')
    const gross = Number(orderGross) || 0
    const [form, setForm] = useState(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        // Prefill every field from the company invoicing settings so the user sees the effective terms and
        // only edits what they need. The prepayment starts populated on both the % and the amount.
        const dp = Number(settings.defaultPrepaymentPercent) || 0
        const term = settings.invoicePaymentTermDays != null ? String(settings.invoicePaymentTermDays) : ''
        const issueDate = invToday()
        setForm({
            type: finalTaken ? 'PREPAYMENT' : 'FINAL',
            issueDate,
            termDays: term,
            dueDate: term !== '' ? invAddDays(issueDate, term) : '',
            penaltyPercent: settings.latePaymentPenaltyPercent != null ? String(settings.latePaymentPenaltyPercent) : '',
            penaltyPeriod: settings.penaltyPeriod || 'DAILY',
            prepaymentPercent: dp > 0 ? String(dp) : '',
            prepaymentAmount: dp > 0 && gross > 0 ? String(Math.round(gross * dp) / 100) : '',
            prepaySource: 'percent', // which of the two the user last set, so it stays authoritative
            notes: '',
        })
        // Reset whenever the dialog re-opens; taken-types are read from the same open.
    }, [isOpen])

    if (!isOpen || !form) return null

    const set = (patch) => setForm((prev) => ({ ...prev, ...patch }))
    // Editing the term recomputes the due date; editing the due date directly overrides it.
    const onIssueChange = (v) => set({ issueDate: v, dueDate: form.termDays !== '' ? invAddDays(v, form.termDays) : form.dueDate })
    const onTermChange = (v) => set({ termDays: v, dueDate: v !== '' ? invAddDays(form.issueDate, v) : form.dueDate })

    // Prepayment % and amount are two views of the same deposit against the order's gross total, so
    // editing one recomputes the other.
    const round2 = (n) => String(Math.round(n * 100) / 100)
    const onPrepayPercentChange = (v) =>
        set({ prepaymentPercent: v, prepaymentAmount: v !== '' && gross > 0 ? round2((gross * Number(v)) / 100) : '', prepaySource: 'percent' })
    const onPrepayAmountChange = (v) =>
        set({ prepaymentAmount: v, prepaymentPercent: v !== '' && gross > 0 ? round2((Number(v) / gross) * 100) : '', prepaySource: 'amount' })

    const typeOptions = [
        { value: 'FINAL', label: t('invoices.type.FINAL'), disabled: finalTaken },
        { value: 'PREPAYMENT', label: t('invoices.type.PREPAYMENT'), disabled: prepaymentTaken },
    ].filter((o) => !o.disabled)

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        const isPrepayment = form.type === 'PREPAYMENT'
        // Send only the field the user last set; the other is its derived mirror.
        const sendPct = isPrepayment && form.prepaySource === 'percent' && form.prepaymentPercent !== ''
        const sendAmt = isPrepayment && form.prepaySource === 'amount' && form.prepaymentAmount !== ''
        const payload = {
            type: form.type,
            issueDate: form.issueDate || null,
            paymentTermDays: form.termDays !== '' ? Number(form.termDays) : null,
            dueDate: form.dueDate || null,
            penaltyPercent: form.penaltyPercent !== '' ? Number(form.penaltyPercent) : null,
            penaltyPeriod: form.penaltyPeriod !== '' ? form.penaltyPeriod : null,
            prepaymentPercent: sendPct ? Number(form.prepaymentPercent) : null,
            prepaymentAmount: sendAmt ? Number(form.prepaymentAmount) : null,
            notes: form.notes || null,
        }
        try {
            const created = await apiPost(`/sales-orders/${orderId}/invoice`, payload)
            onCreated(created)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('invoices.create.title')} width="max-w-2xl">
            <form onSubmit={submit} className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                    <FormSelect
                        id="inv-type"
                        label={t('invoices.create.type')}
                        name="type"
                        value={form.type}
                        onChange={(e) => set({ type: e.target.value })}
                        options={typeOptions}
                    />
                    <div className="hidden md:block" />
                    {/* Issue date and payment term derive the due date between them, so they read as one
                        setting; `md:contents` leaves the two-column desktop grid exactly as it was. */}
                    <div className="grid grid-cols-2 gap-4 md:contents">
                        <FormField id="inv-issue" label={t('invoices.create.issueDate')} type="date" name="issueDate" value={form.issueDate} onChange={(e) => onIssueChange(e.target.value)} />
                        <FormField id="inv-term" label={t('invoices.create.termDays')} type="number" min={0} name="termDays" value={form.termDays} onChange={(e) => onTermChange(e.target.value)} placeholder={t('invoices.create.optionalDefault')} />
                    </div>
                    <FormField id="inv-due" label={t('invoices.create.dueDate')} type="date" name="dueDate" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
                    <div className="hidden md:block" />
                    {form.type === 'PREPAYMENT' && (
                        <>
                            {/* The same prepayment, expressed two ways - each edit rewrites the other, so
                                they belong on one row. */}
                            <div className="grid grid-cols-2 gap-4 md:contents">
                                <FormField id="inv-pre-pct" label={t('invoices.create.prepaymentPercent')} type="number" step="0.01" min={0} max={100} name="prepaymentPercent" value={form.prepaymentPercent} onChange={(e) => onPrepayPercentChange(e.target.value)} placeholder="0" />
                                <FormField id="inv-pre-amt" label={`${t('invoices.create.prepaymentAmount')} (${settings.currencySymbol(invoiceCurrency)})`} type="number" step="0.01" min={0} name="prepaymentAmount" value={form.prepaymentAmount} onChange={(e) => onPrepayAmountChange(e.target.value)} placeholder="0.00" />
                            </div>
                        </>
                    )}
                    <FormField id="inv-penalty" label={t('invoices.create.penaltyPercent')} type="number" step="0.01" min={0} name="penaltyPercent" value={form.penaltyPercent} onChange={(e) => set({ penaltyPercent: e.target.value })} placeholder={t('invoices.create.optionalDefault')} />
                    <FormSelect
                        id="inv-penalty-period"
                        label={t('invoices.create.penaltyPeriod')}
                        name="penaltyPeriod"
                        value={form.penaltyPeriod}
                        onChange={(e) => set({ penaltyPeriod: e.target.value })}
                        options={[{ value: '', label: t('invoices.create.useDefault') }, ...INVOICE_PENALTY_PERIODS.map((p) => ({ value: p, label: t(`settings.invoicing.period.${p}`) }))]}
                    />
                </div>

                <TextareaField id="inv-notes" label={t('invoices.create.notes')} name="notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />

                {form.type === 'PREPAYMENT' && <p className="text-xs text-slate-500 dark:text-slate-400">{t('invoices.create.prepaymentHint')}</p>}

                <ModalActions>
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                        {t('common.cancel')}
                    </button>
                    <button type="submit" disabled={saving} className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                        {saving ? t('common.saving') : t('invoices.create.submit')}
                    </button>
                </ModalActions>
            </form>
        </Modal>
    )
}

/** Confirms marking an invoice paid, capturing the date the payment was actually received. */
function MarkPaidModal({ isOpen, onClose, invoice, onPaid }) {
    const { t } = useTranslation()
    const [date, setDate] = useState(invToday())
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (isOpen) setDate(invToday())
    }, [isOpen])

    if (!isOpen || !invoice) return null

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const updated = await apiPatch(`/invoices/${invoice.id}/payment`, { status: 'PAID', paidDate: date || null })
            onPaid(updated)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('invoices.markPaidTitle')} width="max-w-md">
            <form onSubmit={submit} className="space-y-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('invoices.markPaidPrompt', { number: invoice.invoiceNumber })}</p>
                <FormField id="paid-date" label={t('invoices.paymentDate')} type="date" name="paidDate" value={date} onChange={(e) => setDate(e.target.value)} min={invoice.issueDate || undefined} max={invToday()} />
                <ModalActions>
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                        {t('common.cancel')}
                    </button>
                    <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                        {saving ? t('common.saving') : t('invoices.confirmPaid')}
                    </button>
                </ModalActions>
            </form>
        </Modal>
    )
}

/**
 * Supplier invoice panel on the purchase order detail page. Lets users with edit rights attach, replace
 * or remove the manufacturer's invoice document after the order exists, and download it when present.
 */
function PurchaseInvoiceSection({ orderId, fileName, hasFile, canEdit, onChanged }) {
    const { t } = useTranslation()
    const toast = useToast()
    const [busy, setBusy] = useState(false)
    const inputRef = useRef(null)

    const download = async () => {
        setBusy(true)
        try {
            const blob = await apiDownload(`/purchase-orders/${orderId}/invoice-file`)
            triggerDownload(blob, fileName || 'invoice')
        } finally {
            setBusy(false)
        }
    }

    const upload = async (file) => {
        if (!file) return
        setBusy(true)
        try {
            const data = new FormData()
            data.append('file', file)
            const uploaded = await apiUpload('/upload/document', data)
            const name = uploaded.name || file.name
            await apiPut(`/purchase-orders/${orderId}/invoice-file`, { invoiceFileKey: uploaded.key, invoiceFileName: name })
            onChanged({ hasInvoiceFile: true, invoiceFileName: name })
            toast.success(t('purchaseOrders.invoice.uploaded'))
        } finally {
            setBusy(false)
            if (inputRef.current) inputRef.current.value = ''
        }
    }

    const remove = async () => {
        setBusy(true)
        try {
            await apiDelete(`/purchase-orders/${orderId}/invoice-file`)
            onChanged({ hasInvoiceFile: false, invoiceFileName: null })
            toast.success(t('purchaseOrders.invoice.removed'))
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Receipt className="h-4 w-4 text-slate-400" /> {t('purchaseOrders.invoice.cardTitle')}
            </h2>

            <input
                ref={inputRef}
                type="file"
                accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={(e) => upload(e.target.files?.[0])}
                className="hidden"
            />

            {hasFile ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 truncate">{fileName}</span>
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            onClick={download}
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                            <Download className="h-4 w-4" /> {t('invoices.download')}
                        </button>
                        {canEdit && (
                            <button
                                onClick={() => inputRef.current?.click()}
                                disabled={busy}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                                <Upload className="h-4 w-4" /> {t('purchaseOrders.invoice.replace')}
                            </button>
                        )}
                        {canEdit && (
                            <button
                                onClick={remove}
                                disabled={busy}
                                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                            >
                                <X className="h-4 w-4" /> {t('common.remove')}
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('purchaseOrders.invoice.none')}</p>
                    {canEdit && (
                        <button
                            onClick={() => inputRef.current?.click()}
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                        >
                            <Upload className="h-4 w-4" /> {busy ? t('common.saving') : t('purchaseOrders.invoice.upload')}
                        </button>
                    )}
                </div>
            )}
        </section>
    )
}

function BackButton({ label, onClick }) {
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
