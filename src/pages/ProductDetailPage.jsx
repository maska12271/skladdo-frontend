import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Pencil, PackagePlus, Plus, Minus, ArrowRightLeft } from 'lucide-react'
import { apiGet, apiPut } from '../api/client'
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
import CustomSelect from '../components/CustomSelect'
import ProductGalleryCard from '../components/ProductGalleryCard'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
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

// Lot list controls (search + expiry filter) only appear past this many lots — see the section below.
const LOT_FILTER_THRESHOLD = 10

// Expiry buckets a lot can be filtered by. `expiringSoon` is the next 30 days, which is the window the
// reorder and warning views already treat as "act on this now".
const EXPIRY_BUCKETS = ['expired', 'expiringSoon', 'valid', 'noExpiry']
const EXPIRING_SOON_DAYS = 30

/** Today and the end of the "expiring soon" window, as the "YYYY-MM-DD" strings the API returns. */
function expiryWindow(now = new Date()) {
    return {
        today: ymd(now),
        soonCutoff: ymd(new Date(now.getTime() + EXPIRING_SOON_DAYS * 86400000)),
    }
}

/** Which bucket a lot falls into. Dates are "YYYY-MM-DD" strings, compared lexicographically. */
function expiryBucketOf(batch, today, soonCutoff) {
    if (!batch.expiryDate) return 'noExpiry'
    if (batch.expiryDate < today) return 'expired'
    return batch.expiryDate <= soonCutoff ? 'expiringSoon' : 'valid'
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
    const toast = useToast()
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
    const [lotSearch, setLotSearch] = useState('')
    const [expiryFilter, setExpiryFilter] = useState([])
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

    // Images are edited straight from the gallery, so the change is shown at once and rolled back if the
    // save fails (the request itself has already raised an error toast by then).
    const handleImagesChange = async (imageKeys) => {
        const previous = product.imageKeys || []
        setProduct((prev) => ({ ...prev, imageKeys }))
        try {
            await apiPut(`/products/${product.id}/images`, { imageKeys })
            toast.success(t('productDetail.imagesUpdated'))
        } catch {
            setProduct((prev) => ({ ...prev, imageKeys: previous }))
        }
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

    const images = product.imageKeys || []
    const stock = stockStatusOf(product)
    const audit = details?.audit

    // Lots, filtered client-side: the endpoint returns every in-stock lot of this product in one go,
    // already in FEFO order (expiry first, no-expiry last), which is the order stock is consumed in —
    // so the list is filtered and paged but never re-sorted.
    const { today, soonCutoff } = expiryWindow()
    const lotQuery = lotSearch.trim().toLowerCase()
    const lotFiltersActive = lotQuery !== '' || expiryFilter.length > 0
    const lotRows = batches.filter((b) => {
        if (lotQuery && !String(b.lotNumber || '').toLowerCase().includes(lotQuery)) return false
        if (expiryFilter.length > 0 && !expiryFilter.includes(expiryBucketOf(b, today, soonCutoff))) return false
        return true
    })

    const lotColumns = [
        { key: 'lotNumber', label: t('productDetail.lots.lot'), render: (b) => <span className="font-medium">{b.lotNumber}</span> },
        { key: 'warehouseName', label: t('productDetail.lots.warehouse') },
        { key: 'quantity', label: t('productDetail.lots.qty'), render: (b) => <span className="font-semibold">{b.quantity}</span> },
        { key: 'productionDate', label: t('productDetail.lots.produced'), render: (b) => b.productionDate ? formatDate(b.productionDate) : '—' },
        {
            key: 'expiryDate',
            label: t('productDetail.lots.expires'),
            render: (b) => {
                const bucket = expiryBucketOf(b, today, soonCutoff)
                if (bucket === 'noExpiry') return <span className="text-slate-400">{t('productDetail.lots.noExpiry')}</span>
                const tone = bucket === 'expired'
                    ? 'font-medium text-rose-600 dark:text-rose-400'
                    : bucket === 'expiringSoon' ? 'font-medium text-amber-600 dark:text-amber-400' : ''
                return <span className={tone}>{formatDate(b.expiryDate)}</span>
            },
        },
        ...(canAdjustStock
            ? [{
                key: 'actions',
                label: '',
                hideable: false,
                render: (b) => (
                    <div className="flex justify-end">
                        <ActionMenu
                            actions={[
                                { key: 'adjust', label: t('inventory.adjustLotAction'), icon: PackagePlus, onClick: () => openLotAdjust([b]) },
                                { key: 'edit', label: t('common.edit'), icon: Pencil, onClick: () => openEditLot(b) },
                            ]}
                        />
                    </div>
                ),
            }]
            : []),
    ]

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
                {/* Two buttons, then an overflow: four labelled actions overflowed the header in Estonian
                    and Russian, where these labels run 40-70% wider than in English. Adjusting and
                    transferring stock are the rarer pair, and adjusting is also offered on the history
                    section below, so they are the ones that move into the menu. */}
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {canAdjustStock && (
                        <button
                            onClick={addModal.open}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                            <PackagePlus className="h-4 w-4" /> {t('inventory.addStock')}
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
                    <ActionMenu
                        actions={[
                            canAdjustStock && {
                                key: 'adjust',
                                label: t('inventory.adjustStock'),
                                icon: PackagePlus,
                                onClick: () => openLotAdjust(batches),
                            },
                            canAdjustStock && warehouseStock.length > 0 && {
                                key: 'transfer',
                                label: t('transfer.button'),
                                icon: ArrowRightLeft,
                                onClick: transferModal.open,
                            },
                        ]}
                    />
                </div>
            </div>

            {/* Gallery + facts */}
            <div className="grid gap-6 lg:grid-cols-2">
                <ProductGalleryCard
                    key={product.id}
                    images={images}
                    alt={product.name}
                    editable={canEdit}
                    onChange={handleImagesChange}
                />

                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
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
                    <>
                        {/* Only worth the space once there are enough lots that scanning the list by eye stops
                            working; a product with a handful of lots keeps the plain table it always had. */}
                        {batches.length > LOT_FILTER_THRESHOLD && (
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <input
                                    value={lotSearch}
                                    onChange={(e) => setLotSearch(e.target.value)}
                                    placeholder={t('productDetail.lots.searchPlaceholder')}
                                    aria-label={t('productDetail.lots.searchPlaceholder')}
                                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950 sm:max-w-xs"
                                />
                                <CustomSelect
                                    multiple
                                    options={EXPIRY_BUCKETS.map((key) => ({ value: key, label: t(`productDetail.lots.expiry.${key}`) }))}
                                    value={expiryFilter}
                                    onChange={setExpiryFilter}
                                    placeholder={t('productDetail.lots.allExpiry')}
                                    ariaLabel={t('productDetail.lots.allExpiry')}
                                    className="sm:w-64"
                                />
                            </div>
                        )}
                        <DataTable
                            tableId="product-lots"
                            columns={lotColumns}
                            rows={lotRows}
                            getRowId={(b) => b.id}
                            initialPageSize={10}
                            filtersActive={lotFiltersActive}
                        />
                    </>
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
