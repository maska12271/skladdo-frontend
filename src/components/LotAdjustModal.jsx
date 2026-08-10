import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { TextareaField } from './FormField.jsx'
import { apiPost } from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../utils/format'

/**
 * Stock-take across lots: every supplied lot gets a signed-change input and the user enters how much
 * to add (+) or remove (−) from each. One shared reason is recorded. Pass a single-element `batches`
 * array to adjust just one lot (the per-row action). Posts to /products/{id}/batches/adjust.
 */
export default function LotAdjustModal({ product, batches = [], isOpen, onClose, onSaved }) {
    const { t } = useTranslation()
    const toast = useToast()
    const [changes, setChanges] = useState({})
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!isOpen) return
        setChanges({})
        setNote('')
        setError('')
    }, [isOpen, product?.id])

    if (!product) return null

    const setChange = (id, value) => setChanges((prev) => ({ ...prev, [id]: value }))

    // The "Change" and "Resulting stock" inputs are two views of the same adjustment: editing the
    // resulting count stores the equivalent signed change, so the submit payload (which always sends the
    // change) stays the single source of truth.
    const setResulting = (id, value, currentQty) => {
        if (value === '') return setChange(id, '')
        const num = Number(value)
        if (Number.isNaN(num)) return
        setChange(id, String(num - currentQty))
    }

    const items = batches
        .map((b) => ({ batch: b, change: Number(changes[b.id]) || 0 }))
        .filter((row) => row.change !== 0)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (items.length === 0) {
            setError(t('inventory.perLotHint'))
            return
        }
        const negative = items.find((row) => (row.batch.quantity ?? 0) + row.change < 0)
        if (negative) {
            setError(t('inventory.notEnoughInLot', { lot: negative.batch.lotNumber }))
            return
        }
        setSaving(true)
        try {
            await apiPost(`/products/${product.id}/batches/adjust`, {
                note: note.trim() || null,
                items: items.map((row) => ({ batchId: row.batch.id, quantityChange: row.change })),
            })
            toast.success(t('inventory.adjusted'))
            onSaved?.()
            onClose()
        } catch (err) {
            setError(err.message || t('inventory.couldNotAdjust'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal isOpen={isOpen} title={t('inventory.adjustByLotTitle', { name: product.name })} onClose={onClose} width="max-w-2xl">
            <form onSubmit={handleSubmit} className="grid gap-4">
                {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                        {error}
                    </div>
                )}

                {batches.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">{t('inventory.noLotsToAdjust')}</p>
                ) : (
                    <>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('inventory.perLotHint')}</p>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/60">
                                        <th className="px-3 py-2 font-semibold">{t('inventory.lotColLot')}</th>
                                        <th className="px-3 py-2 font-semibold">{t('inventory.lotColWarehouse')}</th>
                                        <th className="px-3 py-2 font-semibold">{t('inventory.lotColExpiry')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('inventory.lotColCurrent')}</th>
                                        <th className="px-3 py-2 font-semibold">{t('inventory.lotColChange')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('inventory.resultingStock')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {batches.map((b) => {
                                        const raw = changes[b.id]
                                        const entered = raw !== undefined && raw !== '' && raw !== '-'
                                        const change = Number(raw) || 0
                                        const currentQty = b.quantity ?? 0
                                        const resulting = currentQty + change
                                        return (
                                            <tr key={b.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                                <td className="px-3 py-2 font-medium">{b.lotNumber}</td>
                                                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{b.warehouseName}</td>
                                                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{b.expiryDate ? formatDate(b.expiryDate) : '—'}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{b.quantity}</td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        value={raw ?? ''}
                                                        onChange={(e) => setChange(b.id, e.target.value)}
                                                        placeholder="0"
                                                        className={`w-24 rounded-lg border px-2 py-1 text-right dark:bg-slate-950 ${resulting < 0 ? 'border-rose-400 dark:border-rose-700' : 'border-slate-300 dark:border-slate-700'}`}
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        value={entered ? resulting : ''}
                                                        onChange={(e) => setResulting(b.id, e.target.value, currentQty)}
                                                        placeholder={String(currentQty)}
                                                        className={`w-24 rounded-lg border px-2 py-1 text-right font-semibold tabular-nums dark:bg-slate-950 ${resulting < 0 ? 'border-rose-400 text-rose-600 dark:border-rose-700 dark:text-rose-400' : 'border-slate-300 dark:border-slate-700'}`}
                                                    />
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <TextareaField
                            id="lot-adjust-note"
                            label={t('inventory.reason')}
                            name="note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={t('inventory.reasonPlaceholder')}
                            rows={2}
                        />
                    </>
                )}

                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={saving || batches.length === 0}
                        className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                        {saving ? t('common.saving') : t('inventory.apply')}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
