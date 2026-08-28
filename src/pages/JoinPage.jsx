import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle, PartyPopper, UploadCloud, X, UserRound } from 'lucide-react'
import { apiGet, apiPost } from '../api/client'
import BackToHome from '../components/BackToHome'
import { FormField } from '../components/FormField.jsx'
import PasswordStrength from '../components/PasswordStrength.jsx'
import AvatarCropModal from '../components/AvatarCropModal'
import { ACCEPTED_LABEL } from '../hooks/useImageUpload'

/**
 * Public page where an invited colleague creates their own account from a link.
 *
 * <p>The first thing it has to do is explain itself. Whoever opens this has, most likely, never heard of
 * Skladdo — they were sent a link by someone at work — so the page leads with who invited them and what
 * this is, and only then asks for anything. The company name comes from the server against the token;
 * the page cannot know it otherwise, and a link with nobody's name on it is indistinguishable from spam.</p>
 *
 * <p>Everything asked for here is theirs: their name, their address, their date of birth, their password.
 * The role and the access behind it were fixed by the administrator when they issued the link and are
 * deliberately not shown — a leaked link should not also describe what it opens.</p>
 */
export default function JoinPage() {
    const { t } = useTranslation()
    const [params] = useSearchParams()
    const token = params.get('token') || ''

    // 'checking' | 'valid' | 'invalid' | 'done'
    const [state, setState] = useState('checking')
    const [companyName, setCompanyName] = useState('')
    const [form, setForm] = useState({ fullName: '', email: '', birthDate: '', password: '', confirm: '' })
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    // The chosen picture, already cropped, as a data URI. It rides along inside the accept request rather
    // than going to the upload endpoint: this visitor has no account yet, and the invitation token is the
    // only thing entitled to admit them — so it is the only thing that should gate their photo either.
    const [avatar, setAvatar] = useState(null)
    // The raw file waits here while it is being framed; nothing is kept if the editor is cancelled.
    const [pendingPhoto, setPendingPhoto] = useState(null)
    const fileRef = useRef(null)

    useEffect(() => {
        if (!token) {
            setState('invalid')
            return
        }
        let cancelled = false
        apiGet(`/public/user-invite?token=${encodeURIComponent(token)}`)
            .then((info) => {
                if (cancelled) return
                if (info?.valid) {
                    setCompanyName(info.companyName || '')
                    setState('valid')
                } else {
                    setState('invalid')
                }
            })
            .catch(() => !cancelled && setState('invalid'))
        return () => {
            cancelled = true
        }
    }, [token])

    const handleChange = (e) => {
        const { name, value } = e.target
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    const pickPhoto = (fileList) => {
        const [file] = Array.from(fileList || [])
        if (file) setPendingPhoto(file)
        // Cleared so picking the same file twice still reopens the editor.
        if (fileRef.current) fileRef.current.value = ''
    }

    const acceptCrop = (blob) => {
        const reader = new FileReader()
        reader.onload = () => {
            setAvatar(String(reader.result))
            setPendingPhoto(null)
        }
        reader.onerror = () => setPendingPhoto(null)
        reader.readAsDataURL(blob)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (form.password.length < 8) {
            setError(t('join.tooShort'))
            return
        }
        if (form.password !== form.confirm) {
            setError(t('join.mismatch'))
            return
        }
        setSubmitting(true)
        try {
            const res = await apiPost(
                '/public/user-invite',
                {
                    token,
                    fullName: form.fullName,
                    email: form.email,
                    // The field is optional, and an empty string is not a date the server can parse.
                    birthDate: form.birthDate || null,
                    password: form.password,
                    avatarImage: avatar,
                },
                { suppressErrorToast: true, skipAuthRedirect: true },
            )
            if (res?.companyName) setCompanyName(res.companyName)
            setState('done')
        } catch (err) {
            setError(err.message || t('join.error'))
        } finally {
            setSubmitting(false)
        }
    }

    // Today, so the picker cannot be walked into the future — nobody is born tomorrow.
    const today = new Date().toISOString().slice(0, 10)

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/10" />
                <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-secondary-400/20 blur-3xl dark:bg-secondary-500/10" />
            </div>

            <div className="fade-in-up shadow-pop relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
                <BackToHome className="mb-4" />
                <div className="mb-8 text-center">
                    <img src="/skladdo-logo.svg" alt="" aria-hidden="true" className="mx-auto mb-3 h-12 w-auto" />
                    <h1 className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                        {t('join.title')}
                    </h1>
                    {(state === 'valid' || state === 'done') && companyName && (
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            {t('join.invitedBy', { company: companyName })}
                        </p>
                    )}
                </div>

                {state === 'checking' && (
                    <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t('join.checking')}
                    </p>
                )}

                {state === 'invalid' && (
                    <div className="space-y-6 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                            <XCircle className="h-6 w-6" />
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{t('join.invalid')}</p>
                        <Link
                            to="/login"
                            className="inline-block text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                        >
                            {t('join.goToLogin')}
                        </Link>
                    </div>
                )}

                {state === 'done' && (
                    <div className="space-y-6 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                            <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            {companyName ? t('join.successWithCompany', { company: companyName }) : t('join.success')}
                        </p>
                        <Link
                            to="/login"
                            className="shadow-card inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-700"
                        >
                            {t('join.goToLogin')}
                        </Link>
                    </div>
                )}

                {state === 'valid' && (
                    <>
                        <div className="mb-6 flex gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/60 dark:bg-teal-950/30">
                            <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                            <div className="min-w-0 text-sm">
                                <p className="font-medium text-teal-900 dark:text-teal-100">{t('join.welcomeLead')}</p>
                                <p className="mt-1 text-teal-800/90 dark:text-teal-200/80">{t('join.welcomeBody')}</p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {error && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                                    {error}
                                </div>
                            )}

                            <div className="flex items-center gap-4">
                                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                    {avatar
                                        ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                                        : <UserRound className="h-7 w-7" />}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('join.photo')}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => fileRef.current?.click()}
                                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            <UploadCloud className="h-4 w-4" />
                                            {avatar ? t('join.photoChange') : t('join.photoAdd')}
                                        </button>
                                        {avatar && (
                                            <button
                                                type="button"
                                                onClick={() => setAvatar(null)}
                                                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                            >
                                                <X className="h-4 w-4" /> {t('join.photoRemove')}
                                            </button>
                                        )}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ACCEPTED_LABEL}</p>
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => pickPhoto(e.target.files)}
                                />
                            </div>

                            <FormField
                                id="join-name"
                                label={t('join.fullName')}
                                name="fullName"
                                value={form.fullName}
                                onChange={handleChange}
                                required
                                placeholder={t('join.fullNamePlaceholder')}
                                autoComplete="name"
                            />

                            <FormField
                                id="join-email"
                                label={t('join.email')}
                                name="email"
                                type="email"
                                value={form.email}
                                onChange={handleChange}
                                required
                                placeholder="you@company.com"
                                autoComplete="email"
                            />

                            <FormField
                                id="join-birth-date"
                                label={t('join.birthDate')}
                                name="birthDate"
                                type="date"
                                value={form.birthDate}
                                onChange={handleChange}
                                max={today}
                            />

                            <div className="space-y-2">
                                <FormField
                                    id="join-password"
                                    label={t('join.password')}
                                    name="password"
                                    type="password"
                                    value={form.password}
                                    onChange={handleChange}
                                    required
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                />
                                <PasswordStrength password={form.password} />
                            </div>

                            <FormField
                                id="join-confirm"
                                label={t('join.confirmPassword')}
                                name="confirm"
                                type="password"
                                value={form.confirm}
                                onChange={handleChange}
                                required
                                placeholder="••••••••"
                                autoComplete="new-password"
                            />

                            <button
                                type="submit"
                                disabled={submitting}
                                className="shadow-card inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                {submitting ? t('join.saving') : t('join.submit')}
                            </button>
                        </form>
                    </>
                )}
            </div>

            {/* Keyed by file so a second pick starts the editor fresh rather than reusing the last framing. */}
            <AvatarCropModal
                key={pendingPhoto?.name || 'none'}
                file={pendingPhoto}
                isOpen={Boolean(pendingPhoto)}
                onCancel={() => setPendingPhoto(null)}
                onConfirm={acceptCrop}
            />
        </div>
    )
}
