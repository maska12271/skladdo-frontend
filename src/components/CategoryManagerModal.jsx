import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client'
import Modal from './Modal'
import { usePermissions } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { safeArray } from '../utils/format'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'

/**
 * In-place CRUD for a category taxonomy, shown in a modal so it can be launched from the page that
 * consumes the categories (products, manufacturers) instead of a dedicated page. Generic over the
 * endpoint, permission module and i18n namespace so it serves both product and manufacturer
 * categories. Calls {@code onChanged} after every mutation so the launching page can refresh the
 * list its filters and pickers depend on.
 */
export default function CategoryManagerModal({ isOpen, onClose, endpoint, module, i18nKey, onChanged }) {
    const { t } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions(module)
    const toast = useToast()

    const [rows, setRows] = useState([])
    const [newForm, setNewForm] = useState({ name: '', description: '' })
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({ name: '', description: '' })
    const [confirmingId, setConfirmingId] = useState(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setEditingId(null)
            setConfirmingId(null)
            setNewForm({ name: '', description: '' })
            load()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const load = async () => {
        const res = await apiGet(`${endpoint}?page=0&size=500&sortBy=name&sortDir=asc`)
        setRows(safeArray(res))
    }

    const refresh = async () => {
        await load()
        onChanged?.()
    }

    const handleCreate = async (e) => {
        e.preventDefault()
        if (!newForm.name.trim()) return
        setLoading(true)
        try {
            await apiPost(endpoint, { name: newForm.name.trim(), description: newForm.description, active: true })
            toast.success(t(`${i18nKey}.created`))
            setNewForm({ name: '', description: '' })
            await refresh()
        } finally {
            setLoading(false)
        }
    }

    const startEdit = (item) => {
        setConfirmingId(null)
        setEditingId(item.id)
        setEditForm({ name: item.name || '', description: item.description || '' })
    }

    const handleUpdate = async (item) => {
        if (!editForm.name.trim()) return
        setLoading(true)
        try {
            await apiPut(`${endpoint}/${item.id}`, {
                name: editForm.name.trim(),
                description: editForm.description,
                active: item.active ?? true,
            })
            toast.success(t(`${i18nKey}.updated`))
            setEditingId(null)
            await refresh()
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (item) => {
        setLoading(true)
        try {
            await apiDelete(`${endpoint}/${item.id}`)
            toast.success(t(`${i18nKey}.deleted`))
            setConfirmingId(null)
            await refresh()
        } finally {
            setLoading(false)
        }
    }

    const inputClass =
        'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950'

    return (
        <Modal isOpen={isOpen} title={t(`${i18nKey}.manageTitle`)} onClose={onClose} width="max-w-2xl">
            <div className="space-y-4">
                {/* Stacked rather than a single row of inputs: the description is a sentence, and sharing
                    one line with the name left both too narrow to read what you had typed. */}
                {canCreate && (
                    <form onSubmit={handleCreate} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                        <input
                            value={newForm.name}
                            onChange={(e) => setNewForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder={t('common.name')}
                            className={inputClass}
                            aria-label={t('common.name')}
                        />
                        <textarea
                            value={newForm.description}
                            onChange={(e) => setNewForm((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder={t('common.description')}
                            rows={2}
                            className={inputClass + ' resize-y'}
                            aria-label={t('common.description')}
                        />
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={loading || !newForm.name.trim()}
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                            >
                                <Plus className="h-4 w-4" /> {t('common.add')}
                            </button>
                        </div>
                    </form>
                )}

                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {rows.length === 0 && (
                        <li className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">{t('common.none')}</li>
                    )}
                    {rows.map((item) => (
                        <li key={item.id} className="py-2.5">
                            {editingId === item.id ? (
                                // The editor takes the full width of the row rather than squeezing two
                                // fields and two buttons onto one line, so the description has room to be
                                // read and edited as the sentence it is.
                                <div className="space-y-2">
                                    <input
                                        value={editForm.name}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                                        className={inputClass}
                                        placeholder={t('common.name')}
                                        aria-label={t('common.name')}
                                    />
                                    <textarea
                                        value={editForm.description}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                                        placeholder={t('common.description')}
                                        rows={2}
                                        className={inputClass + ' resize-y'}
                                        aria-label={t('common.description')}
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setEditingId(null)}
                                            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleUpdate(item)}
                                            disabled={loading || !editForm.name.trim()}
                                            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                                        >
                                            <Check className="h-4 w-4" /> {t('common.save')}
                                        </button>
                                    </div>
                                </div>
                            ) : confirmingId === item.id ? (
                                // Deleting is allowed even when the category is in use, so the warning has
                                // to say what that costs - the records are kept, they just come out of this
                                // category - and it needs a line of its own to say it in.
                                <div className="space-y-2 rounded-xl bg-rose-50 p-3 dark:bg-rose-950/30">
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                        {t(`${i18nKey}.deleteConfirm`, { name: item.name })}
                                    </p>
                                    <p className="text-xs text-slate-600 dark:text-slate-300">
                                        {t(`${i18nKey}.deleteWarning`)}
                                    </p>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setConfirmingId(null)}
                                            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(item)}
                                            disabled={loading}
                                            className="rounded-xl bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                                        >
                                            {t('common.delete')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.name}</p>
                                        {item.description && (
                                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {canEdit && (
                                            <button
                                                type="button"
                                                onClick={() => startEdit(item)}
                                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                aria-label={t('common.edit')}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button
                                                type="button"
                                                onClick={() => setConfirmingId(item.id)}
                                                className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                                aria-label={t('common.delete')}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </Modal>
    )
}
