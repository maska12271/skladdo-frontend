import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { FormField } from '../components/FormField.jsx'

export default function LoginPage() {
    const { t } = useTranslation()
    const { login, isAuthenticated } = useAuth()
    const navigate = useNavigate()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            await login(email.trim(), password)
            navigate('/dashboard', { replace: true })
        } catch (err) {
            setError(err.message || t('login.error'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            {/* Soft brand glow backdrop — purely decorative. */}
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
                        {t('nav.appName')}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        {t('login.subtitle')}
                    </p>
                </div>

                {error && (
                    <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <FormField
                        id="login-email"
                        label={t('common.email')}
                        name="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="you@company.com"
                        autoComplete="username"
                    />

                    <FormField
                        id="login-password"
                        label={t('users.form.password')}
                        name="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        autoComplete="current-password"
                    />

                    <button
                        type="submit"
                        disabled={loading}
                        className="shadow-card inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {loading ? t('login.signingIn') : t('login.signIn')}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm">
                    <Link
                        to="/forgot-password"
                        className="font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                    >
                        {t('login.forgot')}
                    </Link>
                </p>

                <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t('login.noAccount')}{' '}
                    <Link
                        to="/register"
                        className="font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                    >
                        {t('login.signUp')}
                    </Link>
                </p>
            </div>
        </div>
    )
}
