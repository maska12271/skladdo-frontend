import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react'
import { apiGet } from '../api/client'
import { formatDateTime, safeArray } from '../utils/format'
import { FormSelect } from './FormField.jsx'

// Where each movement kind links to, so a ledger line can be traced back to the record behind it.
const SOURCE_PATHS = {
    SALES_ORDER: (id) => `/sales-orders/${id}`,
    PURCHASE_ORDER: (id) => `/purchase-orders/${id}`,
}

/**
 * Stock ledger for one product in one warehouse: what moved, when, who did it, and the resulting
 * on-hand balance. The product picker is fed from the warehouse's own stock list.
 */
export default function WarehouseMovements({ warehouseId, products }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [productId, setProductId] = useState('')
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!productId) {
            setRows([])
            return
        }
        let cancelled = false
        setLoading(true)
        apiGet(`/warehouses/${warehouseId}/movements?productId=${productId}`)
            .then((res) => !cancelled && setRows(safeArray(res)))
            .catch(() => { /* the api client already surfaced the error */ })
            .finally(() => !cancelled && setLoading(false))
        return () => { cancelled = true }
    }, [warehouseId, productId])

    const openSource = (row) => {
        const path = SOURCE_PATHS[row.sourceType]
        if (path && row.sourceId) navigate(path(row.sourceId))
    }

    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{t('warehouses.movements.title')}</h2>
                <div className="w-full sm:w-80">
                    <FormSelect
                        id="movements-product"
                        label=""
                        name="productId"
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                        searchable
                        placeholder={t('warehouses.movements.pickProduct')}
                        options={products.map((p) => ({ value: String(p.productId), label: p.productName }))}
                    />
                </div>
            </div>

            {!productId ? (
                <EmptyCard text={t('warehouses.movements.pickPrompt')} />
            ) : loading ? (
                <EmptyCard text={t('common.loading')} />
            ) : rows.length === 0 ? (
                <EmptyCard text={t('warehouses.movements.empty')} />
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/60">
                                <th className="px-4 py-3 font-semibold">{t('warehouses.movements.when')}</th>
                                <th className="px-4 py-3 font-semibold">{t('warehouses.movements.kind')}</th>
                                <th className="px-4 py-3 font-semibold">{t('warehouses.movements.reference')}</th>
                                <th className="px-4 py-3 font-semibold">{t('warehouses.movements.who')}</th>
                                <th className="px-4 py-3 text-right font-semibold">{t('warehouses.movements.change')}</th>
                                <th className="px-4 py-3 text-right font-semibold">{t('warehouses.movements.balance')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const incoming = row.quantityChange >= 0
                                const linkable = Boolean(SOURCE_PATHS[row.sourceType] && row.sourceId)
                                return (
                                    <tr
                                        key={`${row.sourceType}-${row.sourceId}-${row.timestamp}-${row.kind}`}
                                        onClick={() => openSource(row)}
                                        className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                                            linkable ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30' : ''
                                        }`}
                                    >
                                        <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                                            {formatDateTime(row.timestamp)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center gap-1.5">
                                                {incoming
                                                    ? <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                    : <ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
                                                {t(`warehouses.movements.kinds.${row.kind}`, row.kind)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                            {row.reference || row.note || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                            {row.actorName || '—'}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-semibold ${
                                            incoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                        }`}>
                                            {incoming ? '+' : ''}{row.quantityChange}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold">{row.balanceAfter}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}

function EmptyCard({ text }) {
    return (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <History className="h-4 w-4" /> {text}
        </div>
    )
}
