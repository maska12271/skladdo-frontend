import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PackageCheck, Loader2, ShoppingCart } from 'lucide-react'
import { apiGet, apiPost } from '../api/client'
import { safeArray } from '../utils/format'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { FormSelect } from './FormField.jsx'

/**
 * What needs reordering, grouped by the manufacturer it would be bought from. Each group turns into a
 * draft purchase order through the normal purchase-order endpoint - there is no special "reorder" write
 * path, so a drafted order is an ordinary NEW order the buyer can edit as usual.
 *
 * Products with no manufacturer are listed separately: they cannot be ordered without one.
 *
 * Self-contained (own fetches, own state) so the products page only has to render it behind a tab.
 */
export default function ReorderSuggestions() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const toast = useToast()
    const { can, canSeePrices } = useAuth()
    const { defaultWarehouseId, formatCurrency } = useSettings()

    const canCreateOrder = can('PURCHASE_ORDERS', 'canCreate')

    const [rows, setRows] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [loading, setLoading] = useState(true)
    const [warehouseId, setWarehouseId] = useState('')
    const [quantities, setQuantities] = useState({})
    const [creating, setCreating] = useState(null)

    useEffect(() => {
        let cancelled = false
        apiGet('/warehouses')
            .then((res) => !cancelled && setWarehouses(safeArray(res).filter((w) => w.active !== false)))
            .catch(() => { /* the picker just stays empty; the error toast already fired */ })
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        apiGet('/products/reorder-suggestions')
            .then((res) => {
                if (cancelled) return
                const list = safeArray(res)
                setRows(list)
                // Seed the editable quantity boxes with the server's suggestion.
                setQuantities(Object.fromEntries(list.map((r) => [r.productId, r.suggestedQuantity])))
            })
            .catch(() => { /* the api client already surfaced the error */ })
            .finally(() => !cancelled && setLoading(false))
        return () => { cancelled = true }
    }, [])

    // Default to the company's configured warehouse, else the only one if there is just one.
    useEffect(() => {
        if (warehouseId) return
        if (defaultWarehouseId) setWarehouseId(String(defaultWarehouseId))
        else if (warehouses.length === 1) setWarehouseId(String(warehouses[0].id))
    }, [defaultWarehouseId, warehouses, warehouseId])

    // Group by manufacturer: one purchase order per supplier.
    const groups = useMemo(() => {
        const byManufacturer = new Map()
        for (const row of rows) {
            const key = row.manufacturerId ?? 'none'
            if (!byManufacturer.has(key)) {
                byManufacturer.set(key, { id: row.manufacturerId, name: row.manufacturerName, items: [] })
            }
            byManufacturer.get(key).items.push(row)
        }
        return [...byManufacturer.values()]
    }, [rows])

    const createOrder = async (group) => {
        if (!warehouseId) {
            toast.error(t('reorder.pickWarehouse'))
            return
        }
        setCreating(group.id)
        try {
            const order = await apiPost('/purchase-orders', {
                manufacturerId: group.id,
                warehouseId: Number(warehouseId),
                status: 'NEW',
                deliveryPrice: 0,
                items: group.items.map((item) => ({
                    productId: item.productId,
                    quantity: Number(quantities[item.productId]) || item.suggestedQuantity,
                    unitPrice: item.lastPurchasePrice ?? 0,
                })),
            })
            toast.success(t('reorder.created', { number: order.orderNumber || '' }))
            navigate(`/purchase-orders/${order.id}`)
        } catch {
            /* the api client already surfaced the error */
        } finally {
            setCreating(null)
        }
    }

    if (loading) {
        return <Card><Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}</Card>
    }
    if (rows.length === 0) {
        return <Card><PackageCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> {t('reorder.empty')}</Card>
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                    {t('reorder.summary', { count: rows.length })}
                </p>
                <div className="w-full sm:w-64">
                    <FormSelect
                        id="reorder-warehouse"
                        label={t('reorder.deliverTo')}
                        name="warehouseId"
                        value={warehouseId}
                        onChange={(e) => setWarehouseId(e.target.value)}
                        placeholder={t('reorder.pickWarehouse')}
                        options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
                    />
                </div>
            </div>

            {groups.map((group) => (
                <section
                    key={group.id ?? 'none'}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                        <h3 className="font-semibold">
                            {group.name || t('reorder.noManufacturer')}
                            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                                {t('reorder.itemCount', { count: group.items.length })}
                            </span>
                        </h3>
                        {group.id && canCreateOrder && (
                            <button
                                onClick={() => createOrder(group)}
                                disabled={creating === group.id}
                                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {creating === group.id
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <ShoppingCart className="h-4 w-4" />}
                                {t('reorder.createOrder')}
                            </button>
                        )}
                        {!group.id && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">{t('reorder.noManufacturerHint')}</span>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/60">
                                    <th className="px-4 py-3 font-semibold">{t('reorder.cols.product')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('common.sku')}</th>
                                    <th className="px-4 py-3 text-right font-semibold">{t('reorder.cols.inStock')}</th>
                                    <th className="px-4 py-3 text-right font-semibold">{t('reorder.cols.minimum')}</th>
                                    <th className="px-4 py-3 text-right font-semibold">{t('reorder.cols.order')}</th>
                                    {canSeePrices && <th className="px-4 py-3 text-right font-semibold">{t('reorder.cols.lastPrice')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {group.items.map((item) => (
                                    <tr key={item.productId} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                        <td className="px-4 py-3 font-medium">
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/products/${item.productId}`)}
                                                className="hover:text-teal-700 hover:underline dark:hover:text-teal-400"
                                            >
                                                {item.productName}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{item.sku || '—'}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                                            {item.stockQuantity}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{item.minimumStock}</td>
                                        <td className="px-4 py-3 text-right">
                                            <input
                                                type="number"
                                                min="1"
                                                value={quantities[item.productId] ?? item.suggestedQuantity}
                                                onChange={(e) => setQuantities((q) => ({ ...q, [item.productId]: e.target.value }))}
                                                aria-label={t('reorder.cols.order')}
                                                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-right dark:border-slate-700 dark:bg-slate-950"
                                            />
                                            {item.unit && <span className="ml-1 text-xs text-slate-400">{item.unit}</span>}
                                        </td>
                                        {canSeePrices && (
                                            <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                                                {item.lastPurchasePrice != null ? formatCurrency(item.lastPurchasePrice) : '—'}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}
        </div>
    )
}

function Card({ children }) {
    return (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            {children}
        </div>
    )
}
