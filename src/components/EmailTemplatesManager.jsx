import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Sparkles, ChevronDown } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useModal } from '../hooks/useModal'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { FormField } from './FormField.jsx'
import RichTextEditor from './RichTextEditor'
import EmailTokensHelp from './EmailTokensHelp'
import { safeArray } from '../utils/format'
import { emailExamples } from '../config/emailExamples'
import Checkbox from './Checkbox'
import ModalActions from './ModalActions'

const emptyForm = { name: '', subject: '', body: '', active: true }

/**
 * Manages the company's reusable email templates (list + create/edit/delete), rendered inside the
 * settings Email tab. Self-contained: fetches its own list and refreshes after each change. Mirrors the
 * tax-rate management pattern already on the settings page.
 *
 * <p>Also offers a handful of worked examples, because the alternative first impression is an empty list
 * next to an editor with an undocumented token syntax. Picking one only prefills the create form - it is
 * never saved on the company's behalf, so what ends up in the library is always something someone read.</p>
 */
export default function EmailTemplatesManager() {
    const { t, i18n } = useTranslation()
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

    // An example opens the same create form, prefilled. Nothing is written until the user saves, so the
    // wording can be adapted first - which is the point of showing it rather than seeding the library.
    const openExample = (example) => {
        setEditingId(null)
        setForm({ name: example.name, subject: example.subject, body: example.body, active: true })
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

            <ExamplesStrip
                // Keyed on whether the library is empty, so crossing that line remounts the strip and it
                // picks up the new default. An effect syncing the prop into state would do the same thing
                // with a wasted render, which is what the react-hooks rules are about.
                key={templates.length === 0 ? 'empty-library' : 'has-templates'}
                examples={emailExamples(i18n.language)}
                // Open on an empty library: the first thing a new company sees should be four templates
                // it can start from, not a line saying it has none. Collapsed once it has its own.
                defaultOpen={templates.length === 0}
                onPick={openExample}
            />

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
                    <EmailTokensHelp defaultOpen={!editingId} />
                    {editingId && (
                        <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                            <Checkbox name="active" checked={!!form.active} onChange={handleChange} />
                            <span className="font-medium text-slate-700 dark:text-slate-200">{t('common.active')}</span>
                        </label>
                    )}
                    <ModalActions>
                        <button type="button" onClick={formModal.close} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">{t('common.cancel')}</button>
                        <button type="submit" disabled={saving || bodyEmpty} className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                            {saving ? t('common.saving') : t('common.save')}
                        </button>
                    </ModalActions>
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

/**
 * The starter templates, as cards. Collapsible so it stays out of the way of a company that already has
 * its own library, and open by default for one that does not.
 */
function ExamplesStrip({ examples, defaultOpen, onPick }) {
    const { t } = useTranslation()
    // Only the initial value - the caller remounts this on the transition that should change it.
    const [open, setOpen] = useState(defaultOpen)

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    {t('emailTemplates.examples.heading')}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="space-y-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('emailTemplates.examples.intro')}</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {examples.map((example) => (
                            <li key={example.id}>
                                <button
                                    type="button"
                                    onClick={() => onPick(example)}
                                    className="flex h-full w-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-teal-500 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-600"
                                >
                                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{example.name}</span>
                                    <span className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{example.subject}</span>
                                    <span className="mt-1 text-xs font-medium text-teal-600 dark:text-teal-400">
                                        {t('emailTemplates.examples.use')}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
