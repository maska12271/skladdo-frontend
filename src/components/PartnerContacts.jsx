import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useModal } from '../hooks/useModal'
import { safeArray } from '../utils/format'
import Modal from './Modal'
import ModalActions from './ModalActions'
import ConfirmModal from './ConfirmModal'
import CopyButton from './CopyButton'
import { FormField } from './FormField.jsx'

const emptyContact = { name: '', position: '', email: '' }

/**
 * The named people at one client or manufacturer, on that partner's own page.
 *
 * <p>Its own small list with its own add / edit / remove, deliberately not fields on the partner form.
 * Someone new starting at a supplier, or an address that has changed, should be a two-field edit — not a
 * reason to reopen and re-save the whole partner record, which is a bigger and riskier change than the
 * correction deserves. That friction is exactly why the single free-text contact this replaces was so
 * often out of date.</p>
 *
 * @param {string} basePath `/clients/{id}` or `/manufacturers/{id}` — the partner the contacts hang off
 * @param {boolean} canEdit whether the viewer may add, change or remove them
 * @param {function} [onChange] called after any successful write, for pages that show contacts elsewhere
 */
export default function PartnerContacts({ basePath, canEdit = false, onChange }) {
    const { t } = useTranslation()
    const toast = useToast()
    const formModal = useModal()
    const deleteModal = useModal()

    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [form, setForm] = useState(emptyContact)
    const [editingId, setEditingId] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const load = () => {
        setLoading(true)
        apiGet(`${basePath}/contacts`)
            .then((res) => setRows(safeArray(res)))
            .catch(() => setRows([]))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basePath])

    const openCreate = () => {
        setError('')
        setEditingId(null)
        setForm(emptyContact)
        formModal.open()
    }

    const openEdit = (contact) => {
        setError('')
        setEditingId(contact.id)
        setForm({ name: contact.name || '', position: contact.position || '', email: contact.email || '' })
        formModal.open()
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setSaving(true)
        try {
            if (editingId) {
                await apiPut(`${basePath}/contacts/${editingId}`, form)
            } else {
                await apiPost(`${basePath}/contacts`, form)
            }
            toast.success(editingId ? t('contacts.updated') : t('contacts.added'))
            formModal.close()
            setEditingId(null)
            setForm(emptyContact)
            load()
            onChange?.()
        } catch (err) {
            setError(err.message || t('contacts.couldNotSave'))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleting) return
        setSaving(true)
        try {
            await apiDelete(`${basePath}/contacts/${deleting.id}`)
            toast.success(t('contacts.deleted'))
            deleteModal.close()
            setDeleting(null)
            load()
            onChange?.()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t('contacts.title')}</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('contacts.description')}</p>
                </div>
                {canEdit && (
                    <button
                        type="button"
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <Plus className="h-4 w-4" /> {t('contacts.add')}
                    </button>
                )}
            </div>

            {loading ? (
                <p className="py-6 text-center text-sm text-slate-500">{t('common.loading')}</p>
            ) : rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">{t('contacts.empty')}</p>
            ) : (
                <ul className="space-y-2">
                    {rows.map((contact) => (
                        <li
                            key={contact.id}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                <UserRound className="h-[18px] w-[18px]" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                    {contact.name}
                                    {contact.position && (
                                        <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{contact.position}</span>
                                    )}
                                </p>
                                {/* The copy control sits on the address itself, not out at the row's edge
                                    with the edit/delete buttons - it is about this one value, and next to
                                    it there is no question about what it would copy. */}
                                {contact.email && (
                                    <span className="mt-0.5 flex items-center gap-1.5">
                                        <a
                                            href={`mailto:${contact.email}`}
                                            className="inline-flex min-w-0 items-center gap-1.5 text-xs text-teal-700 hover:underline dark:text-teal-400"
                                        >
                                            <Mail className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{contact.email}</span>
                                        </a>
                                        <CopyButton value={contact.email} />
                                    </span>
                                )}
                            </div>
                            {canEdit && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => openEdit(contact)}
                                        aria-label={t('common.edit')}
                                        className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDeleting(contact)
                                            deleteModal.open()
                                        }}
                                        aria-label={t('common.delete')}
                                        className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <Modal
                isOpen={formModal.isOpen}
                title={editingId ? t('contacts.editTitle') : t('contacts.addTitle')}
                onClose={formModal.close}
                width="max-w-lg"
            >
                <form onSubmit={handleSubmit} className="grid gap-4">
                    {error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                            {error}
                        </div>
                    )}

                    <FormField
                        id="contact-name"
                        label={t('contacts.name')}
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        placeholder={t('contacts.namePlaceholder')}
                    />

                    <FormField
                        id="contact-position"
                        label={t('contacts.position')}
                        name="position"
                        value={form.position}
                        onChange={handleChange}
                        placeholder={t('contacts.positionPlaceholder')}
                    />

                    <FormField
                        id="contact-email"
                        label={t('common.email')}
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="name@company.com"
                    />

                    <ModalActions>
                        <button
                            type="button"
                            onClick={formModal.close}
                            className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                        >
                            {saving ? t('common.saving') : t('common.save')}
                        </button>
                    </ModalActions>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('contacts.deleteTitle')}
                message={t('contacts.deleteConfirm', { name: deleting?.name || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={saving}
            />
        </div>
    )
}
