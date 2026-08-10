import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { apiGet, apiPost } from '../api/client'
import { FormField } from '../components/FormField.jsx'
import PasswordStrength from '../components/PasswordStrength.jsx'

/**
 * Public page where a user sets their own password from an emailed link. Handles both first-time setup
 * (invited accounts) and forgotten-password resets — the same token flow drives both. The token is
 * validated on load so an expired/used link shows a clear message instead of a dead form.
 */
export default function ResetPasswordPage() {
    const { t } = useTranslation()
    const [params] = useSearchParams()
    const token = params.get('token') || ''

    // 'checking' | 'valid' | 'invalid' | 'done'
    const [state, setState] = useState('checking')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (!token) {
            setState('invalid')
            return
        }
        let cancelled = false
        apiGet(`/public/password/reset?token=${encodeURIComponent(token)}`)
            .then((info) => {
                if (cancelled) return
                if (info?.valid) {
                    setEmail(info.email || '')
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

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (password.length < 8) {
            setError(t('resetPassword.tooShort'))
            return
        }
        if (password !== confirm) {
            setError(t('resetPassword.mismatch'))
            return
        }
        setSubmitting(true)
        try {
            await apiPost('/public/password/reset', { token, password }, { suppressErrorToast: true, skipAuthRedirect: true })
            setState('done')
        } catch (err) {
            setError(err.message || t('resetPassword.error'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/10" />
                <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-secondary-400/20 blur-3xl dark:bg-secondary-500/10" />
            </div>

            <div className="fade-in-up shadow-pop relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-8 text-center">
                    <img src="/kladdo-logo.svg" alt="" aria-hidden="true" className="mx-auto mb-3 h-12 w-auto" />
                    <h1 className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                        {t('resetPassword.title')}
                    </h1>
                    {state === 'valid' && email && (
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            {t('resetPassword.subtitle', { email })}
                        </p>
                    )}
                </div>

                {state === 'checking' && (
                    <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t('resetPassword.checking')}
                    </p>
                )}

                {state === 'invalid' && (
                    <div className="space-y-6 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                            <XCircle className="h-6 w-6" />
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{t('resetPassword.invalid')}</p>
                        <Link
                            to="/forgot-password"
                            className="inline-block text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                        >
                            {t('resetPassword.requestNew')}
                        </Link>
                    </div>
                )}

                {state === 'done' && (
                    <div className="space-y-6 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                            <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{t('resetPassword.success')}</p>
                        <Link
                            to="/login"
                            className="shadow-card inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-700"
                        >
                            {t('resetPassword.goToLogin')}
                        </Link>
                    </div>
                )}

                {state === 'valid' && (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <FormField
                                id="reset-password"
                                label={t('resetPassword.newPassword')}
                                name="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                                autoComplete="new-password"
                            />
                            <PasswordStrength password={password} />
                        </div>

                        <FormField
                            id="reset-confirm"
                            label={t('resetPassword.confirmPassword')}
                            name="confirm"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                            placeholder="••••••••"
                            autoComplete="new-password"
                        />

                        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">{t('resetPassword.hint')}</p>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="shadow-card inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {submitting ? t('resetPassword.saving') : t('resetPassword.submit')}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
