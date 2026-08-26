import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import Modal from './Modal'
import { FormField, FormSelect, TextareaField } from './FormField.jsx'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../context/ToastContext'
import { safeArray } from '../utils/format'
import ModalActions from './ModalActions'

/**
 * Moves stock of a product from one warehouse to another. The source list is limited to warehouses that
 * actually hold the product; when the chosen source has lots, a specific lot must be picked (so its
 * production/expiry identity travels with the units and warehouse totals stay in sync with the lot
 * breakdown). Posts to /products/{id}/transfers.
 */
export default function TransferStockModal({ product, warehouseStock = [], batches = [], isOpen, onClose, onSaved }) {
    const { t } = useTranslation()
    const toast = useToast()
    const [warehouses, setWarehouses] = useState([])
    const [fromId, setFromId] = useState('')
    const [toId, setToId] = useState('')
    const [batchId, setBatchId] = useState('')
    const [quantity, setQuantity] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!isOpen) return
        setFromId('')
        setToId('')
        setBatchId('')
        setQuantity('')
        setNote('')
        setError('')
        apiGet('/warehouses')
            .then((res) => setWarehouses(safeArray(res)))
            .catch(() => setWarehouses([]))
    }, [isOpen, product?.id])

    // Warehouses that currently hold this product (source candidates), with their quantities.
    const stockByWarehouse = useMemo(() => {
        const map = new Map()
        for (const ws of warehouseStock) {
            if ((ws.quantity || 0) > 0) map.set(String(ws.warehouseId), ws)
        }
        return map
    }, [warehouseStock])

    const sourceOptions = useMemo(
        () =>
            warehouses
                .filter((w) => stockByWarehouse.has(String(w.id)))
                .map((w) => ({ value: String(w.id), label: `${w.name} · ${stockByWarehouse.get(String(w.id)).quantity}` })),
        [warehouses, stockByWarehouse],
    )

    const destOptions = useMemo(
        () => warehouses.filter((w) => String(w.id) !== String(fromId)).map((w) => ({ value: String(w.id), label: w.name })),
        [warehouses, fromId],
    )

    // Lots stored in the selected source warehouse. When present, a lot must be chosen.
    const sourceLots = useMemo(
        () => batches.filter((b) => String(b.warehouseId) === String(fromId) && (b.quantity || 0) > 0),
        [batches, fromId],
    )
    const lotOptions = sourceLots.map((b) => ({
        value: String(b.id),
        label: `${b.lotNumber} · ${b.quantity}${b.expiryDate ? ` · ${t('transfer.exp')} ${b.expiryDate}` : ''}`,
    }))

    const selectedLot = sourceLots.find((b) => String(b.id) === String(batchId))
    const sourceTotal = fromId ? stockByWarehouse.get(String(fromId))?.quantity || 0 : 0
    const available = selectedLot ? selectedLot.quantity : sourceTotal

    // Reset the lot/quantity whenever the source warehouse changes.
    const handleFromChange = (val) => {
        setFromId(val)
        setBatchId('')
        setQuantity('')
        if (String(val) === String(toId)) setToId('')
    }

    if (!product) return null

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (!fromId || !toId) {
            setError(t('transfer.selectWarehouses'))
            return
        }
        if (String(fromId) === String(toId)) {
            setError(t('transfer.sameWarehouse'))
            return
        }
        if (sourceLots.length > 0 && !batchId) {
            setError(t('transfer.selectLot'))
            return
        }
        const qty = Number(quantity) || 0
        if (qty <= 0) {
            setError(t('transfer.amountRequired'))
            return
        }
        if (qty > available) {
            setError(t('transfer.tooMuch', { count: available }))
            return
        }
        setSaving(true)
        try {
            await apiPost(`/products/${product.id}/transfers`, {
                fromWarehouseId: Number(fromId),
                toWarehouseId: Number(toId),
                quantity: qty,
                batchId: batchId ? Number(batchId) : null,
                note: note.trim() || null,
            })
            toast.success(t('transfer.transferred'))
            onSaved?.()
            onClose()
        } catch (err) {
            setError(err.message || t('transfer.couldNot'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal isOpen={isOpen} title={t('transfer.title', { name: product.name })} onClose={onClose} width="max-w-lg">
            <form onSubmit={handleSubmit} className="grid gap-4">
                {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                        {error}
                    </div>
                )}

                {sourceOptions.length === 0 ? (
                    <p className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        {t('transfer.noStock')}
                    </p>
                ) : (
                    <>
                        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
                            <FormSelect
                                id="transfer-from"
                                label={t('transfer.from')}
                                name="fromId"
                                value={fromId}
                                onChange={(e) => handleFromChange(e.target.value)}
                                required
                                placeholder={t('transfer.selectSource')}
                                options={sourceOptions}
                            />
                            <ArrowRight className="mb-3 hidden h-5 w-5 shrink-0 text-slate-400 sm:block" />
                            <FormSelect
                                id="transfer-to"
                                label={t('transfer.to')}
                                name="toId"
                                value={toId}
                                onChange={(e) => setToId(e.target.value)}
                                required
                                placeholder={t('transfer.selectDestination')}
                                options={destOptions}
                            />
                        </div>

                        {sourceLots.length > 0 && (
                            <FormSelect
                                id="transfer-lot"
                                label={t('transfer.lot')}
                                name="batchId"
                                value={batchId}
                                onChange={(e) => {
                                    setBatchId(e.target.value)
                                    setQuantity('')
                                }}
                                required
                                placeholder={t('transfer.selectLot')}
                                options={lotOptions}
                            />
                        )}

                        <div>
                            <FormField
                                id="transfer-quantity"
                                label={t('transfer.quantity')}
                                type="number"
                                name="quantity"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                min={1}
                                max={available || undefined}
                                required
                                placeholder="0"
                            />
                            {fromId && (sourceLots.length === 0 || selectedLot) && (
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('transfer.available', { count: available })}</p>
                            )}
                        </div>

                        <TextareaField
                            id="transfer-note"
                            label={t('transfer.note')}
                            name="note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={t('transfer.notePlaceholder')}
                            rows={2}
                        />
                    </>
                )}

                <ModalActions>
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={saving || sourceOptions.length === 0}
                        className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                        {saving ? t('common.saving') : t('transfer.submit')}
                    </button>
                </ModalActions>
            </form>
        </Modal>
    )
}
