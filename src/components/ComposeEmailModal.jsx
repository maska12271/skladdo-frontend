import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, X, Pencil, Send, Clock } from 'lucide-react'
import { apiGet, apiPut, apiUpload } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import Modal from './Modal'
import { FormField, FormSelect } from './FormField.jsx'
import RichTextEditor from './RichTextEditor'
import DateField from './DateField'
import TimeField from './TimeField'
import EmailTokensHelp from './EmailTokensHelp'
import { safeArray } from '../utils/format'
import { localPartsToInstant } from '../utils/companyTime'
import ModalActions from './ModalActions'

// Matches the backend's spring.servlet.multipart.max-request-size.
const MAX_ATTACH_BYTES = 10 * 1024 * 1024

// Mirrors the backend EmailTemplateRenderer: literal (not regex) replace of every {{token}}.
function htmlEscape(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function substitute(text, tokens, escape) {
    let out = text || ''
    for (const [k, v] of Object.entries(tokens)) {
        out = out.split(`{{${k}}}`).join(escape ? htmlEscape(v) : (v ?? ''))
    }
    return out
}
function formatBytes(n) {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Today as ISO, so the calendar cannot offer a day that is already past. */
function todayIso() {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The API path a partner of this type lives under - the only place the two sides differ here. */
const BASE_PATH = { CLIENT: '/clients', MANUFACTURER: '/manufacturers' }

/**
 * Compose-and-send modal shared by the clients and manufacturers lists (bulk send) and their detail
 * pages (single send). Picks an optional template to prefill the subject/body (editable as a per-send
 * override), supports attachments and the sender's personal signature, and shows a live preview. Sends
 * one personalized email per recipient id - now, or at a time the user picks.
 *
 * <p>`recipientType` is 'CLIENT' or 'MANUFACTURER'. One send is one type: the modal is opened from one
 * list or the other, and a contact belongs to one partner, so a mixed batch has no answer to "which
 * contact".</p>
 */
export default function ComposeEmailModal({ isOpen, recipientType = 'MANUFACTURER', recipientIds = [], onClose, onSent }) {
    const { t } = useTranslation()
    const toast = useToast()
    const { user, updateUser } = useAuth()
    // The company timezone, so "09:00" means the same 09:00 to everyone on the team.
    const { timezone } = useSettings()

    const basePath = BASE_PATH[recipientType] || BASE_PATH.MANUFACTURER

    const [templates, setTemplates] = useState([])
    const [templateId, setTemplateId] = useState('')
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [files, setFiles] = useState([])
    const [sending, setSending] = useState(false)
    // The first selected partner, loaded so the preview can show real substituted values.
    const [samplePartner, setSamplePartner] = useState(null)
    // Named people at that partner, offered as recipients instead of the company's own address.
    // Only ever loaded for a single-recipient send: a contact belongs to one partner, so across a
    // bulk selection there is no one list to choose from.
    const [contacts, setContacts] = useState([])
    const [contactId, setContactId] = useState('')
    // Local editable copy of the user's signature (persisted separately from a send).
    const [signature, setSignature] = useState('')
    const [editingSignature, setEditingSignature] = useState(false)
    const [savingSignature, setSavingSignature] = useState(false)
    // Send now, or queue it. Date and time are wall-clock in the company's timezone, kept apart because
    // that is how the two pickers work (see localPartsToInstant).
    const [later, setLater] = useState(false)
    const [scheduledDate, setScheduledDate] = useState('')
    const [scheduledTime, setScheduledTime] = useState('')

    const fileInputRef = useRef(null)

    // Load templates + the first recipient, and reset the form, each time the modal opens.
    useEffect(() => {
        if (!isOpen) return
        setTemplateId('')
        setSubject('')
        setBody('')
        setFiles([])
        setEditingSignature(false)
        setSignature(user?.emailSignature || '')
        setSamplePartner(null)
        setContacts([])
        setContactId('')
        setLater(false)
        setScheduledDate('')
        setScheduledTime('')
        apiGet('/email-templates')
            .then((res) => setTemplates(safeArray(res).filter((tpl) => tpl.active !== false)))
            .catch(() => {})
        if (recipientIds.length > 0) {
            apiGet(`${basePath}/${recipientIds[0]}`)
                .then((p) => setSamplePartner(p))
                .catch(() => {})
        }
        if (recipientIds.length === 1) {
            apiGet(`${basePath}/${recipientIds[0]}/contacts`)
                // Only contacts with an address: the rest are people to know about, not people to write to.
                .then((res) => setContacts(safeArray(res).filter((c) => c.email)))
                .catch(() => {})
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const selectedContact = contacts.find((c) => String(c.id) === String(contactId))

    // Token values for the live preview, using the first recipient's real data (each partner gets its
    // own copy at send time). Mirrors the backend whitelist.
    const previewTokens = useMemo(() => ({
        'recipient.name': samplePartner?.name || '',
        'recipient.address': samplePartner?.address || '',
        'recipient.email': samplePartner?.email || '',
        'recipient.phone': samplePartner?.phone || '',
        'recipient.country': samplePartner?.country || '',
        // Falls back to the partner, exactly as the backend does - so the preview never shows a
        // greeting the real email will not have.
        'recipient.contactName': selectedContact?.name || samplePartner?.name || '',
        // Legacy aliases, still substituted by the backend so older templates keep working.
        'manufacturer.name': samplePartner?.name || '',
        'manufacturer.address': samplePartner?.address || '',
        'manufacturer.email': samplePartner?.email || '',
        'manufacturer.phone': samplePartner?.phone || '',
        'manufacturer.country': samplePartner?.country || '',
        'sender.fullName': user?.fullName || '',
        'company.name': user?.companyName || '',
        today: new Date().toISOString().slice(0, 10),
    }), [samplePartner, selectedContact, user])

    const previewSubject = substitute(subject, previewTokens, false)
    // Body then signature, exactly as the backend assembles it.
    const previewBody = useMemo(() => {
        let b = substitute(body, previewTokens, true)
        if (signature && signature.trim()) b += `<br><br>${substitute(signature, previewTokens, true)}`
        return b
    }, [body, signature, previewTokens])
    const showPreview = samplePartner && (subject.trim() || body.trim())

    const totalSize = files.reduce((s, f) => s + f.size, 0)
    const overLimit = totalSize > MAX_ATTACH_BYTES
    // The backend requires a non-empty body (@NotBlank), so guard against a blank editor.
    const bodyEmpty = !(body || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
    const scheduleMissing = later && !(scheduledDate && scheduledTime)

    const handleTemplateChange = (e) => {
        const id = e.target.value
        setTemplateId(id)
        const tpl = templates.find((x) => String(x.id) === String(id))
        if (tpl) {
            setSubject(tpl.subject || '')
            setBody(tpl.body || '')
        }
    }

    const onPickFiles = (e) => {
        const picked = Array.from(e.target.files || [])
        setFiles((prev) => [...prev, ...picked])
        if (fileInputRef.current) fileInputRef.current.value = ''
    }
    const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))

    const saveSignature = async () => {
        setSavingSignature(true)
        try {
            const updated = await apiPut('/auth/me/signature', { signature })
            updateUser({ emailSignature: updated.emailSignature })
            setSignature(updated.emailSignature || '')
            setEditingSignature(false)
            toast.success(t('emails.compose.signatureSaved'))
        } finally {
            setSavingSignature(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (recipientIds.length === 0 || overLimit || bodyEmpty || scheduleMissing) return
        setSending(true)
        try {
            const fd = new FormData()
            fd.append('request', new Blob([JSON.stringify({
                recipientType,
                recipientIds: recipientIds.map(Number),
                templateId: templateId ? Number(templateId) : null,
                subject,
                body,
                contactId: contactId ? Number(contactId) : null,
                scheduledAt: later ? localPartsToInstant(scheduledDate, scheduledTime, timezone) : null,
            })], { type: 'application/json' }))
            files.forEach((f) => fd.append('files', f))
            const result = await apiUpload('/emails/send', fd)
            if (result.scheduledId) {
                toast.success(t('emails.compose.scheduledOk', { count: recipientIds.length }))
            } else if (result.failed > 0) {
                toast.error(t('emails.compose.sentWithFailures', { sent: result.sent, failed: result.failed }))
            } else {
                toast.success(t('emails.compose.sentOk', { count: result.sent }))
            }
            onSent?.(result)
            onClose()
        } finally {
            setSending(false)
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            title={t('emails.compose.title', { count: recipientIds.length })}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} className="grid gap-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('emails.compose.recipientsHint', { count: recipientIds.length })}
                </p>

                {/* Offered only for a single recipient, and only when there is somebody to choose - a
                    partner with no named contacts should not be shown an empty dropdown asking a
                    question it cannot answer. */}
                {contacts.length > 0 && (
                    <div className="space-y-2">
                    <FormSelect
                        id="compose-contact"
                        label={t('emails.compose.contact')}
                        name="contactId"
                        value={contactId}
                        onChange={(e) => setContactId(e.target.value)}
                        options={[
                            {
                                value: '',
                                label: samplePartner?.email
                                    ? t('emails.compose.contactCompany', { email: samplePartner.email })
                                    : t('emails.compose.contactCompanyNoEmail'),
                            },
                            ...contacts.map((c) => ({
                                value: String(c.id),
                                label: c.position ? `${c.name} (${c.position}) · ${c.email}` : `${c.name} · ${c.email}`,
                            })),
                        ]}
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('emails.compose.contactHint')}</p>
                    </div>
                )}

                <FormSelect
                    id="compose-template"
                    label={t('emails.compose.template')}
                    name="templateId"
                    value={templateId}
                    onChange={handleTemplateChange}
                    placeholder={t('emails.compose.noTemplate')}
                    options={[
                        { value: '', label: t('emails.compose.noTemplate') },
                        ...templates.map((tpl) => ({ value: String(tpl.id), label: tpl.name })),
                    ]}
                />

                <FormField
                    id="compose-subject"
                    label={t('emails.compose.subject')}
                    name="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    placeholder={t('emails.compose.subjectPlaceholder')}
                />

                <div className="space-y-2">
                    <label htmlFor="compose-body" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {t('emails.compose.body')}<span className="ml-0.5 text-rose-500">*</span>
                    </label>
                    <RichTextEditor
                        id="compose-body"
                        value={body}
                        onChange={setBody}
                        placeholder={t('emails.compose.bodyPlaceholder')}
                        minHeight="12rem"
                    />
                </div>

                {/* Attachments */}
                <div className="space-y-2">
                    {/* `block` is load-bearing: a bare <label> is inline, so it shared a line with the
                        inline-flex button below and the two ended up touching. Every other labelled field
                        here gets away with it because its control is a block-level input. */}
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{t('emails.compose.attachments')}</label>
                    <input ref={fileInputRef} type="file" multiple onChange={onPickFiles} className="hidden" />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                        <Paperclip className="h-4 w-4" /> {t('emails.compose.addFiles')}
                    </button>
                    {files.length > 0 && (
                        <ul className="space-y-1">
                            {files.map((f, i) => (
                                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800">
                                    <span className="min-w-0 truncate">
                                        {f.name} <span className="text-xs text-slate-400">({formatBytes(f.size)})</span>
                                    </span>
                                    <button type="button" onClick={() => removeFile(i)} aria-label={t('common.remove')} className="shrink-0 text-slate-400 hover:text-rose-500">
                                        <X className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {overLimit && <p className="text-xs text-rose-500">{t('emails.compose.attachmentsTooLarge')}</p>}
                </div>

                {/* Signature */}
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('emails.compose.signature')}</span>
                        {!editingSignature && (
                            <button type="button" onClick={() => setEditingSignature(true)} className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline dark:text-teal-400">
                                <Pencil className="h-3.5 w-3.5" /> {signature ? t('emails.compose.editSignature') : t('emails.compose.addSignature')}
                            </button>
                        )}
                    </div>
                    {editingSignature ? (
                        <div className="mt-2 space-y-2">
                            <RichTextEditor value={signature} onChange={setSignature} placeholder={t('emails.compose.signaturePlaceholder')} minHeight="6rem" />
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => { setSignature(user?.emailSignature || ''); setEditingSignature(false) }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">
                                    {t('common.cancel')}
                                </button>
                                <button type="button" onClick={saveSignature} disabled={savingSignature} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                                    {savingSignature ? t('common.saving') : t('emails.compose.saveSignature')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {signature ? t('emails.compose.signatureApplied') : t('emails.compose.noSignature')}
                        </p>
                    )}
                </div>

                {/* When to send. Two buttons rather than a checkbox, because "later" is a real choice with
                    its own consequences, not a modifier on the main one. */}
                <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{t('emails.compose.when')}</span>
                    <div className="flex flex-wrap gap-2">
                        <WhenButton icon={Send} active={!later} onClick={() => setLater(false)} label={t('emails.compose.sendNow')} />
                        <WhenButton icon={Clock} active={later} onClick={() => setLater(true)} label={t('emails.compose.sendLater')} />
                    </div>
                    {later && (
                        <div className="space-y-1 pt-1">
                            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                                {t('emails.compose.scheduledAt')}<span className="ml-0.5 text-rose-500">*</span>
                            </span>
                            {/* The app's own pickers rather than the browser's datetime-local, which draws
                                OS chrome in the OS's format - here that would contradict the company's
                                own date and time settings on the very screen that promises them. */}
                            <div className="grid gap-2 sm:grid-cols-2">
                                <DateField
                                    id="compose-when-date"
                                    name="scheduledDate"
                                    value={scheduledDate}
                                    onChange={(e) => setScheduledDate(e.target.value)}
                                    min={todayIso()}
                                    inputClassName="text-sm bg-white dark:bg-slate-900"
                                />
                                <TimeField
                                    id="compose-when-time"
                                    name="scheduledTime"
                                    value={scheduledTime}
                                    onChange={(e) => setScheduledTime(e.target.value)}
                                    inputClassName="text-sm bg-white dark:bg-slate-900"
                                />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {timezone
                                    ? t('emails.compose.scheduleHintZone', { timezone })
                                    : t('emails.compose.scheduleHint')}
                            </p>
                        </div>
                    )}
                </div>

                <EmailTokensHelp />

                {/* Live preview: shows the email as the first recipient will actually receive it (message +
                    signature, tokens filled in). If a token stays as literal {{...}} here, it was mistyped. */}
                {showPreview && (
                    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900/60 dark:bg-teal-950/20">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                            {t('emails.compose.previewHeading', { name: samplePartner.name })}
                        </p>
                        <div className="mb-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900">
                            <span className="text-xs text-slate-400">{t('emails.compose.subject')}: </span>
                            <span className="font-medium text-slate-800 dark:text-slate-100">{previewSubject || '—'}</span>
                        </div>
                        <iframe
                            title={t('emails.compose.previewHeading', { name: samplePartner.name })}
                            sandbox=""
                            srcDoc={previewBody}
                            className="h-56 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
                        />
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {recipientIds.length > 1
                                ? t('emails.compose.previewNoteMany', { count: recipientIds.length })
                                : t('emails.compose.previewNoteOne')}
                        </p>
                    </div>
                )}

                <ModalActions>
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={sending || recipientIds.length === 0 || overLimit || bodyEmpty || scheduleMissing}
                        className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                        {sending
                            ? t(later ? 'emails.compose.scheduling' : 'emails.compose.sending')
                            : t(later ? 'emails.compose.schedule' : 'emails.compose.send')}
                    </button>
                </ModalActions>
            </form>
        </Modal>
    )
}

function WhenButton({ icon: Icon, active, onClick, label }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                active
                    ? 'border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
        >
            <Icon className="h-4 w-4" /> {label}
        </button>
    )
}
