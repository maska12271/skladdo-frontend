import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Pencil, ImageOff, PackagePlus, Plus, Minus, ArrowRightLeft } from 'lucide-react'
import { apiGet } from '../api/client'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import DataTable from '../components/DataTable'
import ActionMenu from '../components/ActionMenu'
import LoadingBlock from '../components/LoadingBlock'
import TrendChart from '../components/TrendChart'
import AddStockModal from '../components/AddStockModal'
import LotAdjustModal from '../components/LotAdjustModal'
import EditLotModal from '../components/EditLotModal'
import TransferStockModal from '../components/TransferStockModal'
import CopyButton from '../components/CopyButton'
import { resolveImageUrl } from '../components/ImageUploadField.jsx'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useModal } from '../hooks/useModal'
import { formatMoney, formatDate } from '../utils/format'
import { stockStatusOf } from '../utils/stock'

const STOCK_COLOR = { out: 'rose', low: 'amber', ok: 'teal' }

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

// Cancelled orders are still listed in the tables, but never counted toward revenue/cost/profit.
const isCancelled = (line) => String(line.status || '').toUpperCase() === 'CANCELLED'

// Recompute the summary stats from a set of order lines. When the period has no purchases,
// fall back to the all-time weighted-average cost so profit isn't distorted to ~100% margin.
function summarize(salesLines, purchaseLines, allTimeAvgCost) {
    let totalUnitsSold = 0
    let totalRevenue = 0
    const salesIds = new Set()
    for (const l of salesLines) {
        if (isCancelled(l)) continue
        totalUnitsSold += l.quantity || 0
        totalRevenue += Number(l.lineTotal) || 0
        if (l.orderId != null) salesIds.add(l.orderId)
    }
    let totalUnitsPurchased = 0
    let totalPurchaseCost = 0
    const purchaseIds = new Set()
    for (const l of purchaseLines) {
        if (isCancelled(l)) continue
        totalUnitsPurchased += l.quantity || 0
        totalPurchaseCost += Number(l.lineTotal) || 0
        if (l.orderId != null) purchaseIds.add(l.orderId)
    }
    const weightedAvgPurchaseCost = totalUnitsPurchased > 0 ? totalPurchaseCost / totalUnitsPurchased : allTimeAvgCost
    return {
        totalUnitsSold,
        totalRevenue,
        salesOrderCount: salesIds.size,
        totalUnitsPurchased,
        totalPurchaseCost,
        purchaseOrderCount: purchaseIds.size,
        weightedAvgPurchaseCost,
        grossProfit: totalRevenue - weightedAvgPurchaseCost * totalUnitsSold,
        usedFallbackCost: totalUnitsPurchased === 0 && totalUnitsSold > 0,
    }
}

export default function ProductDetailPage() {
    const { t } = useTranslation()
    const { id } = useParams()
    const navigate = useNavigate()
    const { canEdit } = usePermissions('PRODUCTS')
    const { canCreate: canAdjustStock, canView: canViewInventory } = usePermissions('INVENTORY')
    const { canSeePrices } = useAuth()
    const { formatCurrency } = useSettings()
    const adjustModal = useModal()
    const addModal = useModal()
    const editModal = useModal()
    const transferModal = useModal()

    const [adjustBatches, setAdjustBatches] = useState([])
    const [editingBatch, setEditingBatch] = useState(null)
    const [product, setProduct] = useState(null)
    const [details, setDetails] = useState(null)
    const [adjustments, setAdjustments] = useState([])
    const [warehouseStock, setWarehouseStock] = useState([])
    const [batches, setBatches] = useState([])
    const [transfers, setTransfers] = useState([])
    const [activeImage, setActiveImage] = useState(0)
    const [period, setPeriod] = useState('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    const loadAdjustments = () => {
        apiGet(`/products/${id}/adjustments`)
            .then((res) => setAdjustments(Array.isArray(res) ? res : []))
            .catch(() => setAdjustments([]))
    }

    const loadWarehouseStock = () => {
        apiGet(`/products/${id}/warehouse-stock`)
            .then((res) => setWarehouseStock(Array.isArray(res) ? res : []))
            .catch(() => setWarehouseStock([]))
    }

    const loadBatches = () => {
        apiGet(`/products/${id}/batches`)
            .then((res) => setBatches(Array.isArray(res) ? res : []))
            .catch(() => setBatches([]))
    }

    const loadTransfers = () => {
        apiGet(`/products/${id}/transfers`)
            .then((res) => setTransfers(Array.isArray(res) ? res : []))
            .catch(() => setTransfers([]))
    }

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        Promise.all([apiGet(`/products/${id}`), apiGet(`/products/${id}/details`)])
            .then(([productRes, detailsRes]) => {
                if (cancelled) return
                setProduct(productRes)
                setDetails(detailsRes)
                setActiveImage(0)
            })
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        loadAdjustments()
        loadWarehouseStock()
        loadBatches()
        loadTransfers()
        return () => {
            cancelled = true
        }
    }, [id])

    // After an adjustment or transfer, refresh the product (for the new stock) and the history lists.
    const handleAdjusted = () => {
        apiGet(`/products/${id}`).then(setProduct).catch(() => {})
        loadAdjustments()
        loadWarehouseStock()
        loadBatches()
        loadTransfers()
    }

    const openLotAdjust = (list) => {
        setAdjustBatches(list)
        adjustModal.open()
    }
    const openEditLot = (batch) => {
        setEditingBatch(batch)
        editModal.open()
    }

    if (loading) return <LoadingBlock text={t('productDetail.loading')} />
    if (error || !product) {
        return (
            <div className="space-y-4">
                <BackButton onClick={() => navigate('/products')} label={t('productDetail.back')} />
                <LoadingBlock text={t('productDetail.notFound')} />
            </div>
        )
    }

    const images = product.imageUrls || []
    const stock = stockStatusOf(product)
    const audit = details?.audit

    // Period filtering (client-side, from the order lines the endpoint already returned).
    const range = periodRange(period)
    const inRange = (dateStr) => !range || (dateStr && dateStr >= range.start && dateStr <= range.end)
    const rangeCaption = range ? `${formatDate(range.start)} – ${formatDate(range.end)}` : t('common.allTime')

    const allSales = details?.salesOrders || []
    const allPurchases = details?.purchaseOrders || []
    const allTimeAvgCost = (() => {
        let u = 0
        let c = 0
        for (const l of allPurchases) {
            if (isCancelled(l)) continue
            u += l.quantity || 0
            c += Number(l.lineTotal) || 0
        }
        return u > 0 ? c / u : 0
    })()

    const filteredSales = allSales.filter((o) => inRange(o.orderDate))
    const filteredPurchases = allPurchases.filter((o) => inRange(o.orderDate))
    const summary = details ? summarize(filteredSales, filteredPurchases, allTimeAvgCost) : null
    const monthlyView = (details?.monthly || []).filter(
        (pt) => !range || (pt.month >= range.start.slice(0, 7) && pt.month <= range.end.slice(0, 7)),
    )

    const salesRows = filteredSales.map((o, i) => ({ ...o, _rid: `s-${o.orderId}-${i}` }))
    const purchaseRows = filteredPurchases.map((o, i) => ({ ...o, _rid: `p-${o.orderId}-${i}` }))

    const orderColumns = (counterpartyLabel) => [
        { key: 'orderNumber', label: t('productDetail.orderCols.orderNumber'), render: (r) => r.orderNumber || `#${r.orderId}` },
        { key: 'orderDate', label: t('common.date'), render: (r) => formatDate(r.orderDate) },
        { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
        { key: 'counterpartyName', label: counterpartyLabel, render: (r) => r.counterpartyName || '-' },
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
            <BackButton onClick={() => navigate(-1)} label={t('productDetail.back')} />

            {/* Header */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-start">
                <div className="space-y-3">
                    <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
                    <p className="flex flex-wrap items-center gap-x-1 text-sm text-slate-500 dark:text-slate-400">
                        <span>{product.sku ? `${t('common.sku')} ${product.sku}` : t('productDetail.noSku')}</span>
                        {product.sku && <CopyButton value={product.sku} />}
                        {product.manufacturer?.name ? <span>{` · ${product.manufacturer.name}`}</span> : null}
                        {product.category?.name ? <span>{` · ${product.category.name}`}</span> : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={product.active ? 'ACTIVE' : 'INACTIVE'} />
                        {stock === 'out' && <StatusBadge status="OUT_OF_STOCK" />}
                        {stock === 'low' && <StatusBadge status="LOW_STOCK" />}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {canAdjustStock && (
                        <button
                            onClick={addModal.open}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                            <PackagePlus className="h-4 w-4" /> {t('inventory.addStock')}
                        </button>
                    )}
                    {canAdjustStock && (
                        <button
                            onClick={() => openLotAdjust(batches)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <PackagePlus className="h-4 w-4" /> {t('inventory.adjustStock')}
                        </button>
                    )}
                    {canAdjustStock && warehouseStock.length > 0 && (
                        <button
                            onClick={transferModal.open}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <ArrowRightLeft className="h-4 w-4" /> {t('transfer.button')}
                        </button>
                    )}
                    {canEdit && (
                        <button
                            onClick={() => navigate(`/products?edit=${product.id}`)}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                        >
                            <Pencil className="h-4 w-4" /> {t('productDetail.edit')}
                        </button>
                    )}
                </div>
            </div>

            {/* Gallery + facts */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    {images.length > 0 ? (
                        <div className="space-y-3">
                            <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                                <img src={resolveImageUrl(images[activeImage])} alt={product.name} className="h-full w-full object-contain" />
                            </div>
                            {images.length > 1 && (
                                <div className="flex flex-wrap gap-2">
                                    {images.map((url, i) => (
                                        <button
                                            key={`${url}-${i}`}
                                            type="button"
                                            onClick={() => setActiveImage(i)}
                                            className={`h-16 w-16 overflow-hidden rounded-lg border-2 transition ${
                                                i === activeImage ? 'border-teal-500' : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                                            }`}
                                        >
                                            <img src={resolveImageUrl(url)} alt={`${product.name} ${i + 1}`} className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                            <ImageOff className="h-8 w-8" />
                            <span className="text-sm">{t('productDetail.noImages')}</span>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
                        {canSeePrices && <Fact label={t('productDetail.facts.price')} value={formatCurrency(product.price, product.currency)} />}
                        {canSeePrices && (
                            <Fact
                                label={t('productDetail.facts.stockValue')}
                                value={formatCurrency(Number(product.price || 0) * Number(product.stockQuantity || 0), product.currency)}
                            />
                        )}
                        <Fact label={t('productDetail.facts.unit')} value={product.unit || '—'} />
                        <Fact label={t('productDetail.facts.size')} value={product.size || '—'} />
                        <Fact
                            label={t('productDetail.facts.inStock')}
                            value={
                                <span className={stock === 'out' ? 'text-rose-600 dark:text-rose-400' : stock === 'low' ? 'text-amber-600 dark:text-amber-400' : ''}>
                                    {product.stockQuantity}
                                </span>
                            }
                        />
                        <Fact label={t('productDetail.facts.minimumStock')} value={product.minimumStock} />
                        <Fact label={t('productDetail.facts.warehouseMethod')} value={product.warehouseMethod || 'FEFO'} />
                    </dl>
                    {warehouseStock.length > 0 && (
                        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                            <dt className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{t('warehouses.warehouseStock')}</dt>
                            <div className="space-y-1">
                                {warehouseStock.map((ws) => (
                                    <div key={ws.warehouseId} className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-300">{ws.warehouseName}</span>
                                        <span className="font-semibold">{ws.quantity}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {product.description && (
                        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('productDetail.facts.description')}</dt>
                            <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{product.description}</dd>
                        </div>
                    )}
                </div>
            </div>

            {/* Stock by lot */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('productDetail.lots.title')}</h2>
                {batches.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        {t('productDetail.lots.empty')}
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/60">
                                    <th className="px-4 py-3 font-semibold">{t('productDetail.lots.lot')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('productDetail.lots.warehouse')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('productDetail.lots.qty')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('productDetail.lots.produced')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('productDetail.lots.expires')}</th>
                                    {canAdjustStock && <th className="px-4 py-3" />}
                                </tr>
                            </thead>
                            <tbody>
                                {batches.map((b) => {
                                    const expired = b.expiryDate && b.expiryDate < ymd(new Date())
                                    return (
                                        <tr key={b.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                            <td className="px-4 py-3 font-medium">{b.lotNumber}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.warehouseName}</td>
                                            <td className="px-4 py-3 font-semibold">{b.quantity}</td>
                                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{b.productionDate ? formatDate(b.productionDate) : '—'}</td>
                                            <td className={`px-4 py-3 ${expired ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                {b.expiryDate ? formatDate(b.expiryDate) : t('productDetail.lots.noExpiry')}
                                            </td>
                                            {canAdjustStock && (
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end">
                                                        <ActionMenu
                                                            actions={[
                                                                { key: 'adjust', label: t('inventory.adjustLotAction'), icon: PackagePlus, onClick: () => openLotAdjust([b]) },
                                                                { key: 'edit', label: t('common.edit'), icon: Pencil, onClick: () => openEditLot(b) },
                                                            ]}
                                                        />
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Stock transfers between warehouses */}
            {transfers.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold">{t('transfer.historyTitle')}</h2>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/60">
                                    <th className="px-4 py-3 font-semibold">{t('common.date')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('transfer.cols.from')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('transfer.cols.to')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('transfer.cols.lot')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('transfer.cols.qty')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('transfer.cols.by')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transfers.map((tr) => (
                                    <tr key={tr.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(tr.createdAt)}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{tr.fromWarehouseName}</td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                                                <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" /> {tr.toWarehouseName}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{tr.lotNumber || '—'}</td>
                                        <td className="px-4 py-3 font-semibold">{tr.quantity}</td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{tr.by?.name || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Analytics */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold">{t('productDetail.performance')}</h2>
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
                    {canSeePrices && <StatCard title={t('productDetail.stats.totalRevenue')} value={formatMoney(summary.totalRevenue)} hint={t('productDetail.stats.salesOrdersHint', { count: summary.salesOrderCount })} color="teal" />}
                    <StatCard title={t('productDetail.stats.unitsSold')} value={summary.totalUnitsSold} hint={t('common.inSelectedPeriod')} color="teal" />
                    {canSeePrices && (
                        <StatCard
                            title={t('productDetail.stats.grossProfit')}
                            value={formatMoney(summary.grossProfit)}
                            hint={summary.usedFallbackCost
                                ? t('productDetail.stats.avgCostAllTime', { cost: formatMoney(summary.weightedAvgPurchaseCost) })
                                : t('productDetail.stats.avgCostHint', { cost: formatMoney(summary.weightedAvgPurchaseCost) })}
                            color="blue"
                        />
                    )}
                    {canSeePrices && <StatCard title={t('productDetail.stats.totalPurchaseCost')} value={formatMoney(summary.totalPurchaseCost)} hint={t('productDetail.stats.purchaseOrdersHint', { count: summary.purchaseOrderCount })} color="amber" />}
                    <StatCard title={t('productDetail.stats.unitsPurchased')} value={summary.totalUnitsPurchased} hint={t('common.inSelectedPeriod')} color="amber" />
                    <StatCard title={t('productDetail.stats.inStock')} value={product.stockQuantity} hint={t('productDetail.stats.inStockHint', { min: product.minimumStock })} color={STOCK_COLOR[stock]} />
                </div>
            )}

            {canSeePrices && <TrendChart data={monthlyView} />}

            {/* Sales orders */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('productDetail.salesOrders', { count: salesRows.length })}</h2>
                <DataTable tableId="product-sales-orders" columns={orderColumns(t('productDetail.orderCols.client'))} rows={salesRows} getRowId={(r) => r._rid} onRowClick={(r) => r.orderId && navigate(`/sales-orders/${r.orderId}`)} initialPageSize={10} />
            </section>

            {/* Purchase orders */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('productDetail.purchaseOrders', { count: purchaseRows.length })}</h2>
                <DataTable tableId="product-purchase-orders" columns={orderColumns(t('productDetail.orderCols.manufacturer'))} rows={purchaseRows} getRowId={(r) => r._rid} onRowClick={(r) => r.orderId && navigate(`/purchase-orders/${r.orderId}`)} initialPageSize={10} />
            </section>

            {/* Inventory adjustment history */}
            {(adjustments.length > 0 || canAdjustStock || canViewInventory) && (
                <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-lg font-semibold">{t('inventory.historyTitle')}</h2>
                        {canAdjustStock && (
                            <button
                                onClick={() => openLotAdjust(batches)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                <PackagePlus className="h-4 w-4" /> {t('inventory.adjustStock')}
                            </button>
                        )}
                    </div>
                    {adjustments.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                            {t('inventory.noHistory')}
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/60">
                                        <th className="px-4 py-3 font-semibold">{t('common.date')}</th>
                                        <th className="px-4 py-3 font-semibold">{t('inventory.cols.change')}</th>
                                        <th className="px-4 py-3 font-semibold">{t('inventory.cols.resulting')}</th>
                                        <th className="px-4 py-3 font-semibold">{t('inventory.cols.reason')}</th>
                                        <th className="px-4 py-3 font-semibold">{t('inventory.cols.by')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {adjustments.map((a) => {
                                        const added = (a.quantityChange ?? 0) >= 0
                                        return (
                                            <tr key={a.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(a.createdAt)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 font-semibold ${added ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                        {added ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                                                        {Math.abs(a.quantityChange ?? 0)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-medium">{a.newQuantity}</td>
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{a.note || '—'}</td>
                                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{a.createdBy?.name || '—'}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

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

            <AddStockModal
                product={product}
                isOpen={addModal.isOpen}
                onClose={addModal.close}
                onSaved={handleAdjusted}
            />

            <LotAdjustModal
                product={product}
                batches={adjustBatches}
                isOpen={adjustModal.isOpen}
                onClose={adjustModal.close}
                onSaved={handleAdjusted}
            />

            <EditLotModal
                product={product}
                batch={editingBatch}
                isOpen={editModal.isOpen}
                onClose={editModal.close}
                onSaved={handleAdjusted}
            />

            <TransferStockModal
                product={product}
                warehouseStock={warehouseStock}
                batches={batches}
                isOpen={transferModal.isOpen}
                onClose={transferModal.close}
                onSaved={handleAdjusted}
            />
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
