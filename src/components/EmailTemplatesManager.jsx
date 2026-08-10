import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useModal } from '../hooks/useModal'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { FormField } from './FormField.jsx'
import RichTextEditor from './RichTextEditor'
import { safeArray } from '../utils/format'

const emptyForm = { name: '', subject: '', body: '', active: true }

/**
 * Manages the company's reusable email templates (list + create/edit/delete), rendered inside the
 * settings Email tab. Self-contained: fetches its own list and refreshes after each change. Mirrors the
 * tax-rate management pattern already on the settings page.
 */
export default function EmailTemplatesManager() {
    const { t } = useTranslation()
    const toast = useToast()

    const [templates, setTemplates] = useState([])
    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const [saving, setSaving] = useState(false)

    const formModal = useModal()
    const deleteModal = useModal()

    const load = () => apiGet('/email-templates').then((res) => setTemplates(safeArray(res))).catch(() => {})

    // The backend requires a non-blank body (@NotBlank); guard against an empty rich-text editor.
    const bodyEmpty = !(form.body || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

    useEffect(() => {
        load()
    }, [])

    const openCreate = () => {
        setEditingId(null)
        setForm(emptyForm)
        formModal.open()
    }

    const openEdit = (tpl) => {
        setEditingId(tpl.id)
        setForm({ name: tpl.name || '', subject: tpl.subject || '', body: tpl.body || '', active: tpl.active !== false })
        formModal.open()
    }

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target
        setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    }

    const save = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            if (editingId) await apiPut(`/email-templates/${editingId}`, form)
            else await apiPost('/email-templates', form)
            toast.success(editingId ? t('emailTemplates.updated') : t('emailTemplates.created'))
            formModal.close()
            await load()
        } finally {
            setSaving(false)
        }
    }

    const confirmDelete = (tpl) => {
        setDeleting(tpl)
        deleteModal.open()
    }

    const handleDelete = async () => {
        if (!deleting) return
        setSaving(true)
        try {
            await apiDelete(`/email-templates/${deleting.id}`)
            toast.success(t('emailTemplates.deleted'))
            deleteModal.close()
            setDeleting(null)
            await load()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('emailTemplates.heading')}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('emailTemplates.intro')}</p>
                </div>
                <button
                    onClick={openCreate}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                >
                    <Plus className="h-4 w-4" /> {t('emailTemplates.add')}
                </button>
            </div>

            {templates.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">{t('emailTemplates.empty')}</p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900">
                                <th className="px-4 py-3 font-semibold">{t('common.name')}</th>
                                <th className="px-4 py-3 font-semibold">{t('emailTemplates.subject')}</th>
                                <th className="px-4 py-3 font-semibold">{t('common.status')}</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {templates.map((tpl) => (
                                <tr key={tpl.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                    <td className="px-4 py-3 font-medium">{tpl.name}</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400"><span className="line-clamp-1">{tpl.subject}</span></td>
                                    <td className="px-4 py-3">
                                        <span className={tpl.active !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                                            {tpl.active !== false ? t('common.active') : t('common.inactive')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-1">
                                            <button onClick={() => openEdit(tpl)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('common.edit')}>
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => confirmDelete(tpl)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label={t('common.delete')}>
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal
                isOpen={formModal.isOpen}
                title={editingId ? t('emailTemplates.editTitle') : t('emailTemplates.addTitle')}
                onClose={formModal.close}
            >
                <form onSubmit={save} className="grid gap-4">
                    <FormField id="tpl-name" label={t('common.name')} name="name" value={form.name} onChange={handleChange} required placeholder={t('emailTemplates.namePlaceholder')} />
                    <FormField id="tpl-subject" label={t('emailTemplates.subject')} name="subject" value={form.subject} onChange={handleChange} required placeholder={t('emailTemplates.subjectPlaceholder')} />
                    <div className="space-y-2">
                        <label htmlFor="tpl-body" className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('emailTemplates.body')}</label>
                        <RichTextEditor
                            id="tpl-body"
                            value={form.body}
                            onChange={(html) => setForm((prev) => ({ ...prev, body: html }))}
                            placeholder={t('emailTemplates.bodyPlaceholder')}
                            minHeight="12rem"
                        />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('emailTemplates.tokensHint')}</p>
                    {editingId && (
                        <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                            <input type="checkbox" name="active" checked={!!form.active} onChange={handleChange} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700" />
                            <span className="font-medium text-slate-700 dark:text-slate-200">{t('common.active')}</span>
                        </label>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={formModal.close} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">{t('common.cancel')}</button>
                        <button type="submit" disabled={saving || bodyEmpty} className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                            {saving ? t('common.saving') : t('common.save')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('emailTemplates.deleteTitle')}
                message={t('emailTemplates.deleteConfirm', { name: deleting?.name || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={saving}
            />
        </div>
    )
}
