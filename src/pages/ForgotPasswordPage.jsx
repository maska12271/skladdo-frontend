import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, MailCheck, MailWarning } from 'lucide-react'
import { apiPost } from '../api/client'
import { FormField } from '../components/FormField.jsx'

/**
 * Public "forgot password" page. If the address maps to a live account we send a link and show the
 * confirmation; if it doesn't, the backend responds with an error which we surface inline right away.
 */
export default function ForgotPasswordPage() {
    const { t } = useTranslation()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    // The link is issued either way, but the company's SMTP may not be configured — in that case no mail
    // exists to wait for, so say so instead of sending the user to watch an empty inbox.
    const [emailSent, setEmailSent] = useState(true)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            // Suppress the global error toast; we render the (already-translated) backend message inline.
            const result = await apiPost('/public/password/forgot', { email: email.trim() }, { suppressErrorToast: true, skipAuthRedirect: true })
            // Treat an older backend that returns no body as "sent", matching the previous behaviour.
            setEmailSent(result?.emailSent !== false)
            setSubmitted(true)
        } catch (err) {
            setError(err.message || t('forgotPassword.error'))
        } finally {
            setLoading(false)
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
                    <Link to="/" aria-label={t('common.backToHome')}>
                        <img src="/kladdo-logo.svg" alt="" aria-hidden="true" className="mx-auto mb-3 h-12 w-auto" />
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                        {t('forgotPassword.title')}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        {t('forgotPassword.subtitle')}
                    </p>
                </div>

                {submitted ? (
                    <div className="space-y-6 text-center">
                        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                            emailSent
                                ? 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400'
                                : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                        }`}>
                            {emailSent ? <MailCheck className="h-6 w-6" /> : <MailWarning className="h-6 w-6" />}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            {emailSent ? t('forgotPassword.success') : t('forgotPassword.notSent')}
                        </p>
                        <Link
                            to="/login"
                            className="inline-block text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                        >
                            {t('forgotPassword.backToLogin')}
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                                {error}
                            </div>
                        )}

                        <FormField
                            id="forgot-email"
                            label={t('common.email')}
                            name="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="you@company.com"
                            autoComplete="username"
                        />

                        <button
                            type="submit"
                            disabled={loading}
                            className="shadow-card inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                            {loading ? t('forgotPassword.sending') : t('forgotPassword.submit')}
                        </button>

                        <p className="text-center text-sm">
                            <Link
                                to="/login"
                                className="font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                                {t('forgotPassword.backToLogin')}
                            </Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    )
}
