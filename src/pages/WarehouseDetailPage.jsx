import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Pencil } from 'lucide-react'
import { apiGet } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import LoadingBlock from '../components/LoadingBlock'
import WarehouseMovements from '../components/WarehouseMovements'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { stockStatusOf } from '../utils/stock'

export default function WarehouseDetailPage() {
    const { t } = useTranslation()
    const { id } = useParams()
    const navigate = useNavigate()
    const { canEdit } = usePermissions('WAREHOUSES')
    const { canSeePrices } = useAuth()
    const { currency: baseCurrency, formatCurrency } = useSettings()

    const [warehouse, setWarehouse] = useState(null)
    const [stock, setStock] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        Promise.all([
            apiGet(`/warehouses/${id}`),
            apiGet(`/warehouses/${id}/stock?page=0&size=500`),
        ])
            .then(([warehouseRes, stockRes]) => {
                if (cancelled) return
                setWarehouse(warehouseRes)
                setStock(stockRes?.content || [])
            })
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        return () => { cancelled = true }
    }, [id])

    // Total value of stock held in this warehouse, kept per currency so a mix of product currencies is
    // summed correctly (each currency shown separately rather than blindly added together).
    const totalsByCurrency = stock.reduce((acc, item) => {
        const cur = (item.currency || baseCurrency || 'EUR').toUpperCase()
        acc[cur] = (acc[cur] || 0) + Number(item.unitPrice || 0) * item.quantity
        return acc
    }, {})
    const totalValueLabel = Object.entries(totalsByCurrency)
        .map(([cur, value]) => formatCurrency(value, cur))
        .join(' + ')

    if (loading) return <LoadingBlock text={t('common.loading')} />
    if (error || !warehouse) {
        return (
            <div className="space-y-4">
                <BackButton onClick={() => navigate('/warehouses')} label={t('warehouses.back')} />
                <LoadingBlock text={t('warehouses.notFound')} />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <BackButton onClick={() => navigate(-1)} label={t('warehouses.back')} />

            {/* Header */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-start">
                <div className="space-y-3">
                    <h1 className="text-2xl font-bold tracking-tight">{warehouse.name}</h1>
                    {warehouse.address && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{warehouse.address}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={warehouse.active ? 'ACTIVE' : 'INACTIVE'} />
                    </div>
                </div>
                {canEdit && (
                    <button
                        onClick={() => navigate(`/warehouses?edit=${warehouse.id}`)}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                    >
                        <Pencil className="h-4 w-4" /> {t('common.edit')}
                    </button>
                )}
            </div>

            {/* Stock table */}
            <section className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">{t('warehouses.stock.title')}</h2>
                    {canSeePrices && stock.length > 0 && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('warehouses.stock.totalValue')}{' '}
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{totalValueLabel}</span>
                        </p>
                    )}
                </div>

                {stock.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        {t('warehouses.stock.empty')}
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/60">
                                    <th className="px-4 py-3 font-semibold">{t('warehouses.stock.product')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('common.sku')}</th>
                                    <th className="px-4 py-3 font-semibold text-right">{t('warehouses.stock.qty')}</th>
                                    <th className="px-4 py-3 font-semibold text-right">{t('warehouses.stock.minStock')}</th>
                                    <th className="px-4 py-3 font-semibold">{t('common.status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stock.map((item) => {
                                    const stockStatus = stockStatusOf({ stockQuantity: item.quantity, minimumStock: item.minimumStock })
                                    return (
                                        <tr
                                            key={item.productId}
                                            className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/30"
                                            onClick={() => navigate(`/products/${item.productId}`)}
                                        >
                                            <td className="px-4 py-3 font-medium">{item.productName}</td>
                                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{item.sku || '—'}</td>
                                            <td className="px-4 py-3 text-right font-semibold">{item.quantity}</td>
                                            <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{item.minimumStock}</td>
                                            <td className="px-4 py-3">
                                                {stockStatus === 'out' && <StatusBadge status="OUT_OF_STOCK" />}
                                                {stockStatus === 'low' && <StatusBadge status="LOW_STOCK" />}
                                                {stockStatus === 'ok' && <StatusBadge status="ACTIVE" />}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Stock ledger for a single product in this warehouse */}
            <WarehouseMovements warehouseId={id} products={stock} />
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
