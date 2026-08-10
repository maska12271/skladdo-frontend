import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck, Loader2, AlertTriangle } from 'lucide-react'
import { apiPut } from '../api/client'
import { useToast } from '../context/ToastContext'

/**
 * Picking (sales) / goods-receipt (purchase) progress for an order's lines.
 *
 * Progress is tracked <em>separately from the order status</em>: recording it never moves stock, which
 * still happens when the order reaches a stock-affecting status. That keeps counts correctable while a
 * picker or receiver works, and keeps the warehouse stock ledger consistent.
 */
export default function OrderFulfilmentPanel({ orderId, type, lines, canFulfil, onUpdated }) {
    const { t } = useTranslation()
    const toast = useToast()
    const isSales = type === 'sales'

    const [draft, setDraft] = useState({})
    const [saving, setSaving] = useState(false)

    // Reset the inputs whenever the order's lines change (initial load, or after a save returns fresh data).
    useEffect(() => {
        setDraft(Object.fromEntries((lines || []).map((l) => [l.lineId, l.fulfilledQuantity ?? 0])))
    }, [lines])

    const totals = useMemo(() => {
        const ordered = (lines || []).reduce((sum, l) => sum + (l.quantity || 0), 0)
        const done = (lines || []).reduce((sum, l) => sum + (Number(draft[l.lineId]) || 0), 0)
        return { ordered, done, complete: ordered > 0 && done >= ordered }
    }, [lines, draft])

    const dirty = (lines || []).some((l) => (Number(draft[l.lineId]) || 0) !== (l.fulfilledQuantity ?? 0))

    const save = async () => {
        setSaving(true)
        try {
            const path = isSales ? `/sales-orders/${orderId}/fulfilment` : `/purchase-orders/${orderId}/receipt`
            const updated = await apiPut(path, {
                lines: (lines || []).map((l) => ({ lineId: l.lineId, quantity: Number(draft[l.lineId]) || 0 })),
            })
            onUpdated?.(updated)
            toast.success(t('fulfilment.saved'))
        } catch {
            /* the api client already surfaced the error */
        } finally {
            setSaving(false)
        }
    }

    const fillAll = () => {
        setDraft(Object.fromEntries((lines || []).map((l) => [l.lineId, l.quantity || 0])))
    }

    if (!lines?.length) return null

    const pct = totals.ordered > 0 ? Math.min(100, Math.round((totals.done / totals.ordered) * 100)) : 0

    return (
        <section className="shadow-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
                    <ClipboardCheck className="h-5 w-5 text-slate-400" />
                    {t(isSales ? 'fulfilment.pickTitle' : 'fulfilment.receiveTitle')}
                </h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    totals.complete
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                    {t('fulfilment.progress', { done: totals.done, ordered: totals.ordered })}
                </span>
            </div>

            <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                    className={`h-full rounded-full transition-all ${totals.complete ? 'bg-emerald-500' : 'bg-teal-500'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                            <th className="py-2 font-semibold">{t('fulfilment.product')}</th>
                            <th className="py-2 text-right font-semibold">{t('fulfilment.ordered')}</th>
                            <th className="py-2 text-right font-semibold">
                                {t(isSales ? 'fulfilment.picked' : 'fulfilment.received')}
                            </th>
                            <th className="py-2 text-right font-semibold">{t('fulfilment.difference')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line) => {
                            const value = Number(draft[line.lineId]) || 0
                            const diff = value - (line.quantity || 0)
                            return (
                                <tr key={line.lineId} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                    <td className="py-2.5 font-medium">{line.productName}</td>
                                    <td className="py-2.5 text-right text-slate-500 dark:text-slate-400">{line.quantity}</td>
                                    <td className="py-2.5 text-right">
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={!canFulfil}
                                            value={draft[line.lineId] ?? 0}
                                            onChange={(e) => setDraft((d) => ({ ...d, [line.lineId]: e.target.value }))}
                                            aria-label={`${line.productName} — ${t(isSales ? 'fulfilment.picked' : 'fulfilment.received')}`}
                                            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-right disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
                                        />
                                    </td>
                                    <td className="py-2.5 text-right">
                                        {diff === 0 ? (
                                            <span className="text-slate-400">—</span>
                                        ) : (
                                            <span className={`inline-flex items-center gap-1 font-medium ${
                                                diff > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
                                            }`}>
                                                {diff > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
                                                {diff > 0 ? '+' : ''}{diff}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {canFulfil && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={fillAll}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                        {t('fulfilment.markAll')}
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || !dirty}
                        className="shadow-card inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t('fulfilment.save')}
                    </button>
                </div>
            )}

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('fulfilment.stockNote')}</p>
        </section>
    )
}
