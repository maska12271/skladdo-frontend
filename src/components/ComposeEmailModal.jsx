import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, X, Pencil } from 'lucide-react'
import { apiGet, apiPut, apiUpload } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import Modal from './Modal'
import { FormField, FormSelect } from './FormField.jsx'
import RichTextEditor from './RichTextEditor'
import { safeArray } from '../utils/format'

// The tokens the backend substitutes at send time (must match EmailTemplateRenderer's whitelist).
const AVAILABLE_TOKENS = [
    'manufacturer.name',
    'manufacturer.address',
    'manufacturer.email',
    'manufacturer.phone',
    'manufacturer.country',
    'sender.fullName',
    'company.name',
    'today',
]

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

/**
 * Compose-and-send modal shared by the manufacturers list (bulk send) and a manufacturer's detail page
 * (single send). Picks an optional template to prefill the subject/body (editable as a per-send override),
 * supports attachments and the sender's personal signature, and shows a live preview. Sends one
 * personalized email per manufacturer id.
 */
export default function ComposeEmailModal({ isOpen, manufacturerIds = [], onClose, onSent }) {
    const { t } = useTranslation()
    const toast = useToast()
    const { user, updateUser } = useAuth()

    const [templates, setTemplates] = useState([])
    const [templateId, setTemplateId] = useState('')
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [files, setFiles] = useState([])
    const [sending, setSending] = useState(false)
    // The first selected manufacturer, loaded so the preview can show real substituted values.
    const [sampleManufacturer, setSampleManufacturer] = useState(null)
    // Local editable copy of the user's signature (persisted separately from a send).
    const [signature, setSignature] = useState('')
    const [editingSignature, setEditingSignature] = useState(false)
    const [savingSignature, setSavingSignature] = useState(false)

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
        setSampleManufacturer(null)
        apiGet('/email-templates')
            .then((res) => setTemplates(safeArray(res).filter((tpl) => tpl.active !== false)))
            .catch(() => {})
        if (manufacturerIds.length > 0) {
            apiGet(`/manufacturers/${manufacturerIds[0]}`)
                .then((m) => setSampleManufacturer(m))
                .catch(() => {})
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    // Token values for the live preview, using the first recipient's real data (each manufacturer gets
    // its own copy at send time). Mirrors the backend whitelist.
    const previewTokens = useMemo(() => ({
        'manufacturer.name': sampleManufacturer?.name || '',
        'manufacturer.address': sampleManufacturer?.address || '',
        'manufacturer.email': sampleManufacturer?.email || '',
        'manufacturer.phone': sampleManufacturer?.phone || '',
        'manufacturer.country': sampleManufacturer?.country || '',
        'sender.fullName': user?.fullName || '',
        'company.name': user?.companyName || '',
        today: new Date().toISOString().slice(0, 10),
    }), [sampleManufacturer, user])

    const previewSubject = substitute(subject, previewTokens, false)
    // Body then signature, exactly as the backend assembles it.
    const previewBody = useMemo(() => {
        let b = substitute(body, previewTokens, true)
        if (signature && signature.trim()) b += `<br><br>${substitute(signature, previewTokens, true)}`
        return b
    }, [body, signature, previewTokens])
    const showPreview = sampleManufacturer && (subject.trim() || body.trim())

    const totalSize = files.reduce((s, f) => s + f.size, 0)
    const overLimit = totalSize > MAX_ATTACH_BYTES
    // The backend requires a non-empty body (@NotBlank), so guard against a blank editor.
    const bodyEmpty = !(body || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

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
        if (manufacturerIds.length === 0 || overLimit || bodyEmpty) return
        setSending(true)
        try {
            const fd = new FormData()
            fd.append('request', new Blob([JSON.stringify({
                manufacturerIds: manufacturerIds.map(Number),
                templateId: templateId ? Number(templateId) : null,
                subject,
                body,
            })], { type: 'application/json' }))
            files.forEach((f) => fd.append('files', f))
            const result = await apiUpload('/manufacturers/emails/send', fd)
            if (result.failed > 0) {
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
            title={t('emails.compose.title', { count: manufacturerIds.length })}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} className="grid gap-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('emails.compose.recipientsHint', { count: manufacturerIds.length })}
                </p>

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

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                    <p className="mb-1.5 font-medium text-slate-600 dark:text-slate-300">{t('emails.compose.tokensHint')}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {AVAILABLE_TOKENS.map((token) => (
                            <code key={token} className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-teal-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-teal-300 dark:ring-slate-700">
                                {`{{${token}}}`}
                            </code>
                        ))}
                    </div>
                </div>

                {/* Live preview: shows the email as the first recipient will actually receive it (message +
                    signature, tokens filled in). If a token stays as literal {{...}} here, it was mistyped. */}
                {showPreview && (
                    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900/60 dark:bg-teal-950/20">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                            {t('emails.compose.previewHeading', { name: sampleManufacturer.name })}
                        </p>
                        <div className="mb-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900">
                            <span className="text-xs text-slate-400">{t('emails.compose.subject')}: </span>
                            <span className="font-medium text-slate-800 dark:text-slate-100">{previewSubject || '—'}</span>
                        </div>
                        <iframe
                            title={t('emails.compose.previewHeading', { name: sampleManufacturer.name })}
                            sandbox=""
                            srcDoc={previewBody}
                            className="h-56 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
                        />
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {manufacturerIds.length > 1
                                ? t('emails.compose.previewNoteMany', { count: manufacturerIds.length })
                                : t('emails.compose.previewNoteOne')}
                        </p>
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={sending || manufacturerIds.length === 0 || overLimit || bodyEmpty}
                        className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                        {sending ? t('emails.compose.sending') : t('emails.compose.send')}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
