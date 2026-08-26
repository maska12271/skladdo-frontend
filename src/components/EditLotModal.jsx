import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { FormField } from './FormField.jsx'
import { apiPut } from '../api/client'
import { useToast } from '../context/ToastContext'
import ModalActions from './ModalActions'

/**
 * Edits a lot's identifying details (number, production/expiry dates). The quantity is changed only
 * through adjustments, so it isn't editable here. Puts to /products/{id}/batches/{batchId}.
 */
export default function EditLotModal({ product, batch, isOpen, onClose, onSaved }) {
    const { t } = useTranslation()
    const toast = useToast()
    const [lotNumber, setLotNumber] = useState('')
    const [productionDate, setProductionDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!isOpen || !batch) return
        setLotNumber(batch.lotNumber || '')
        setProductionDate(batch.productionDate || '')
        setExpiryDate(batch.expiryDate || '')
        setError('')
    }, [isOpen, batch])

    if (!product || !batch) return null

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (!lotNumber.trim()) {
            setError(t('inventory.lotNumber'))
            return
        }
        setSaving(true)
        try {
            await apiPut(`/products/${product.id}/batches/${batch.id}`, {
                lotNumber: lotNumber.trim(),
                productionDate: productionDate || null,
                expiryDate: expiryDate || null,
            })
            toast.success(t('inventory.lotUpdated'))
            onSaved?.()
            onClose()
        } catch (err) {
            setError(err.message || t('inventory.couldNotSaveLot'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal isOpen={isOpen} title={t('inventory.editLotTitle', { name: product.name })} onClose={onClose} width="max-w-lg">
            <form onSubmit={handleSubmit} className="grid gap-4">
                {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                        {error}
                    </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">{batch.warehouseName}</span>
                    <span className="font-semibold">{batch.quantity} {t('common.qty').toLowerCase()}</span>
                </div>

                <FormField
                    id="edit-lot-number"
                    label={t('inventory.lotNumber')}
                    name="lotNumber"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    required
                    placeholder={t('inventory.lotNumberPlaceholder')}
                />

                <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
                    <FormField
                        id="edit-lot-production"
                        label={t('inventory.productionDate')}
                        type="date"
                        name="productionDate"
                        value={productionDate}
                        onChange={(e) => setProductionDate(e.target.value)}
                    />
                    <FormField
                        id="edit-lot-expiry"
                        label={t('inventory.expiryDate')}
                        type="date"
                        name="expiryDate"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                    />
                </div>

                <ModalActions>
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                        {t('common.cancel')}
                    </button>
                    <button type="submit" disabled={saving} className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                        {saving ? t('common.saving') : t('inventory.saveLot')}
                    </button>
                </ModalActions>
            </form>
        </Modal>
    )
}
