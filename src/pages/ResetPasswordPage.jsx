import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BackToHome from '../components/BackToHome'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle, PartyPopper } from 'lucide-react'
import { apiGet, apiPost } from '../api/client'
import { FormField } from '../components/FormField.jsx'
import PasswordStrength from '../components/PasswordStrength.jsx'

/**
 * Public page where a user sets their own password from an emailed link.
 *
 * <p>One token flow, two things to say. Somebody resetting a forgotten password already knows what
 * Skladdo is and wants the form; somebody following an invitation has never seen the product and needs
 * to be told where they have landed and who put them there. The server says which it is (the account is
 * still awaiting its first password), so the page greets them accordingly rather than opening on a bare
 * "reset your password" — which reads, to a new colleague, like a mistake.</p>
 *
 * <p>The token is validated on load either way, so an expired or spent link shows a clear message
 * instead of a dead form.</p>
 */
export default function ResetPasswordPage() {
    const { t } = useTranslation()
    const [params] = useSearchParams()
    const token = params.get('token') || ''

    // 'checking' | 'valid' | 'invalid' | 'done'
    const [state, setState] = useState('checking')
    const [email, setEmail] = useState('')
    // Whether this link is a colleague's invitation rather than a password reset, and the company it is
    // into. Both come from the server: the client cannot tell one token from another.
    const [invitation, setInvitation] = useState(false)
    const [companyName, setCompanyName] = useState('')
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
                    setInvitation(Boolean(info.invitation))
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
                <BackToHome className="mb-4" />
                <div className="mb-8 text-center">
                    <img src="/skladdo-logo.svg" alt="" aria-hidden="true" className="mx-auto mb-3 h-12 w-auto" />
                    <h1 className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                        {invitation ? t('resetPassword.welcomeTitle') : t('resetPassword.title')}
                    </h1>
                    {state === 'valid' && (
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            {invitation
                                ? (companyName
                                    ? t('resetPassword.welcomeSubtitle', { company: companyName })
                                    : t('resetPassword.welcomeSubtitleNoCompany'))
                                : (email ? t('resetPassword.subtitle', { email }) : null)}
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

                {state === 'valid' && invitation && (
                    <div className="mb-6 flex gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/60 dark:bg-teal-950/30">
                        <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                        <div className="min-w-0 text-sm">
                            <p className="font-medium text-teal-900 dark:text-teal-100">{t('resetPassword.welcomeLead')}</p>
                            <p className="mt-1 text-teal-800/90 dark:text-teal-200/80">
                                {t('resetPassword.welcomeBody', { email })}
                            </p>
                        </div>
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
