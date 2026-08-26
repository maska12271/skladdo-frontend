import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import Modal from './Modal'
import { FormField, FormSelect, TextareaField } from './FormField.jsx'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../context/ToastContext'
import { safeArray } from '../utils/format'
import ModalActions from './ModalActions'

/**
 * Receives stock into a lot for a product. When the entered lot number already exists for the
 * product, its production/expiry dates are fetched, pre-filled and locked, and a note tells the user
 * — so a lot keeps one consistent identity. Posts to /products/{id}/batches.
 */
export default function AddStockModal({ product, isOpen, onClose, onSaved }) {
    const { t } = useTranslation()
    const toast = useToast()
    const [warehouses, setWarehouses] = useState([])
    const [warehouseId, setWarehouseId] = useState('')
    const [lotNumber, setLotNumber] = useState('')
    const [quantity, setQuantity] = useState('')
    const [productionDate, setProductionDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [note, setNote] = useState('')
    const [lockDates, setLockDates] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!isOpen) return
        setWarehouseId('')
        setLotNumber('')
        setQuantity('')
        setProductionDate('')
        setExpiryDate('')
        setNote('')
        setLockDates(false)
        setError('')
        apiGet('/warehouses')
            .then((res) => {
                const list = safeArray(res)
                setWarehouses(list)
                if (list.length === 1) setWarehouseId(String(list[0].id))
            })
            .catch(() => setWarehouses([]))
    }, [isOpen, product?.id])

    // Debounced lookup: if the product already has this lot, lock + pre-fill its dates.
    useEffect(() => {
        if (!isOpen || !product?.id) return
        const lot = lotNumber.trim()
        if (!lot) {
            setLockDates(false)
            return
        }
        const handle = setTimeout(() => {
            apiGet(`/products/${product.id}/batches/lookup?lotNumber=${encodeURIComponent(lot)}`)
                .then((res) => {
                    if (res?.exists) {
                        setLockDates(true)
                        setProductionDate(res.productionDate || '')
                        setExpiryDate(res.expiryDate || '')
                    } else {
                        setLockDates(false)
                    }
                })
                .catch(() => setLockDates(false))
        }, 350)
        return () => clearTimeout(handle)
    }, [lotNumber, isOpen, product?.id])

    if (!product) return null

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (!warehouseId) {
            setError(t('warehouses.selectWarehouse'))
            return
        }
        if (!lotNumber.trim()) {
            setError(t('inventory.lotNumber'))
            return
        }
        if ((Number(quantity) || 0) <= 0) {
            setError(t('inventory.amountRequired'))
            return
        }
        setSaving(true)
        try {
            await apiPost(`/products/${product.id}/batches`, {
                warehouseId: Number(warehouseId),
                lotNumber: lotNumber.trim(),
                quantity: Number(quantity),
                productionDate: productionDate || null,
                expiryDate: expiryDate || null,
                note: note.trim() || null,
            })
            toast.success(t('inventory.received'))
            onSaved?.()
            onClose()
        } catch (err) {
            setError(err.message || t('inventory.couldNotReceive'))
        } finally {
            setSaving(false)
        }
    }

    const dateLocked = lockDates ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-800/60' : ''

    return (
        <Modal isOpen={isOpen} title={t('inventory.addStockTitle', { name: product.name })} onClose={onClose} width="max-w-lg">
            <form onSubmit={handleSubmit} className="grid gap-4">
                {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                        {error}
                    </div>
                )}

                <FormSelect
                    id="add-stock-warehouse"
                    label={t('inventory.warehouse')}
                    name="warehouseId"
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    required
                    placeholder={t('warehouses.selectWarehouse')}
                    options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        id="add-stock-lot"
                        label={t('inventory.lotNumber')}
                        name="lotNumber"
                        value={lotNumber}
                        onChange={(e) => setLotNumber(e.target.value)}
                        required
                        placeholder={t('inventory.lotNumberPlaceholder')}
                    />
                    <FormField
                        id="add-stock-quantity"
                        label={t('inventory.quantityToAdd')}
                        type="number"
                        name="quantity"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        min={1}
                        required
                        placeholder="0"
                    />
                </div>

                {lockDates && (
                    <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t('inventory.lotExists', { lot: lotNumber.trim() })}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
                    <FormField
                        id="add-stock-production"
                        label={t('inventory.productionDate')}
                        type="date"
                        name="productionDate"
                        value={productionDate}
                        onChange={(e) => setProductionDate(e.target.value)}
                        disabled={lockDates}
                        inputClassName={dateLocked}
                    />
                    <FormField
                        id="add-stock-expiry"
                        label={t('inventory.expiryDate')}
                        type="date"
                        name="expiryDate"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        disabled={lockDates}
                        inputClassName={dateLocked}
                    />
                </div>

                <TextareaField
                    id="add-stock-note"
                    label={t('inventory.reason')}
                    name="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('inventory.reasonPlaceholder')}
                    rows={2}
                />

                <ModalActions>
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                        {t('common.cancel')}
                    </button>
                    <button type="submit" disabled={saving} className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                        {saving ? t('common.saving') : t('inventory.receive')}
                    </button>
                </ModalActions>
            </form>
        </Modal>
    )
}
