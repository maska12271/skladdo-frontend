import { useEffect, useState } from 'react'
import { useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom'
import BackToHome from '../components/BackToHome'
import { useTranslation } from 'react-i18next'
import {
    Loader2, CreditCard, Lock, Eye, EyeOff, ShieldCheck, CheckCircle2, Check,
    Building2, Warehouse, ArrowLeft, ArrowRight, Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { apiGet } from '../api/client'
import { FormField } from '../components/FormField.jsx'
import PasswordStrength from '../components/PasswordStrength.jsx'
import { PLANS, PLAN_IDS, DEFAULT_PLAN, ADDONS, monthlyTotal } from '../config/plans'

/** Mirrors the backend CompanyType. Chosen here and never editable again. */
const ACCOUNT_TYPES = ['BUSINESS', 'WAREHOUSE']

const ACCOUNT_TYPE_ICON = { BUSINESS: Building2, WAREHOUSE: Warehouse }

/** What each account type actually gets, listed under its card (register.accountTypes.<type>.points.<key>). */
const ACCOUNT_TYPE_POINTS = {
    BUSINESS: ['catalogue', 'orders', 'tenders', 'team'],
    WAREHOUSE: ['connect', 'warehouses', 'fulfil', 'noCatalogue'],
}

/**
 * Listed once beneath the plan cards rather than repeated inside each one: every tier carries all of
 * these, so per-card feature lists would imply differences that do not exist. The tiers differ only in
 * the caps, which is what the cards themselves compare.
 */
const PLAN_INCLUDED = ['inventory', 'orders', 'invoices', 'warehouses', 'analytics', 'permissions']

/**
 * A warehouse account is free and sells nothing, so it is asked for neither a plan nor a card - the
 * server assigns it the free plan from the account type. That is the whole reason the two paths differ.
 */
const BUSINESS_STEPS = ['type', 'details', 'plan', 'payment']
const WAREHOUSE_STEPS = ['type', 'details']

/**
 * Public self-service signup, as a wizard. The first step picks the account type, which decides the rest
 * of the flow: a business goes on to details, a plan and (preview-only) card details, while a warehouse
 * account only fills in its details and is created free.
 *
 * <p>All state lives here rather than in the steps, so going back never loses what was typed. Card entry
 * is a preview: nothing is charged or stored, and the fields are never sent.</p>
 */
export default function RegisterPage() {
    const { t, i18n } = useTranslation()
    const { register, isAuthenticated } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()

    const requestedPlan = (searchParams.get('plan') || '').toUpperCase()
    const deepLinkedPlan = PLAN_IDS.includes(requestedPlan) ? requestedPlan : null

    // An operator-issued invitation (/register?invite=CODE). Its terms are looked up rather than read
    // from the URL: the code is the only thing that travels, and the server applies the terms again at
    // signup, so nothing here can be talked into granting a better deal.
    const inviteCode = searchParams.get('invite') || ''
    const [invite, setInvite] = useState(null)
    const [inviteChecked, setInviteChecked] = useState(!inviteCode)

    const [step, setStep] = useState(0)
    // Business is what almost every visitor is here for, so it starts selected - but the choice is still
    // shown, because it is the one answer that can never be corrected later.
    const [accountType, setAccountType] = useState('BUSINESS')
    const [plan, setPlan] = useState(deepLinkedPlan || DEFAULT_PLAN)
    // Tenders and manufacturer emails are sold separately, and without them those pages do not exist at
    // all - so the choice is made here rather than left to be discovered in Settings later. None by default:
    // a signup should never quietly cost more than the plan the visitor picked.
    const [addons, setAddons] = useState([])
    const [companyName, setCompanyName] = useState('')
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [cardName, setCardName] = useState('')
    const [cardNumber, setCardNumber] = useState('')
    const [expiry, setExpiry] = useState('')
    const [cvc, setCvc] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    // Resolve the invitation before the form is used, so a link that has been revoked or used up says so
    // up front instead of after everything has been typed in. An unknown code is not an error response —
    // the endpoint answers `valid: false` — so only a network failure lands in the catch.
    useEffect(() => {
        if (!inviteCode) return
        let cancelled = false
        apiGet(`/public/invite?code=${encodeURIComponent(inviteCode)}`)
            .then((res) => {
                if (cancelled) return
                setInvite(res)
                if (res?.valid) {
                    if (res.accountType) setAccountType(res.accountType)
                    if (res.plan) setPlan(res.plan)
                }
            })
            .catch(() => { /* treated as no invitation; the ordinary signup still works */ })
            .finally(() => {
                if (!cancelled) setInviteChecked(true)
            })
        return () => {
            cancelled = true
        }
    }, [inviteCode])

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />
    }

    const validInvite = invite?.valid ? invite : null
    const isWarehouse = accountType === 'WAREHOUSE'

    // The invitation answers some of the questions, so those steps disappear rather than being shown
    // pre-filled and un-editable — a step you cannot change is just a page to click past. The card step
    // goes too when the link carries free days: it is a preview that never sends anything anyway, and
    // asking for a card while promising "free for 30 days" reads as a trick.
    // Until a type is chosen the longer path is shown, so choosing "warehouse" visibly drops the plan and
    // payment steps - the clearest way to say that this account is not going to be asked to pay.
    let steps
    if (validInvite) {
        steps = []
        if (!validInvite.accountType) steps.push('type')
        steps.push('details')
        if (!isWarehouse) {
            if (!validInvite.plan) steps.push('plan')
            if (!validInvite.freeDays) steps.push('payment')
        }
    } else {
        steps = isWarehouse ? WAREHOUSE_STEPS : BUSINESS_STEPS
    }
    const current = steps[step]
    const isLast = step === steps.length - 1
    const selectedPlan = PLANS.find((p) => p.id === plan) || PLANS[0]
    const total = monthlyTotal(selectedPlan.id, addons)
    const toggleAddon = (id) =>
        setAddons((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]))
    const pwType = showPw ? 'text' : 'password'

    // First payment is one month out; shown so the visitor knows they are not charged today.
    const firstPayment = new Date()
    firstPayment.setMonth(firstPayment.getMonth() + 1)
    const firstPaymentStr = firstPayment.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })

    const onCardNumber = (e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 16)
        setCardNumber(digits.replace(/(.{4})/g, '$1 ').trim())
    }
    const onExpiry = (e) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, 4)
        setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
    }
    const onCvc = (e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))

    const cardOk = () =>
        cardName.trim() &&
        cardNumber.replace(/\s/g, '').length >= 12 &&
        /^\d{2}\/\d{2}$/.test(expiry) &&
        cvc.length >= 3

    /**
     * What stops the current step being left, or '' when it may be. Empty required fields are caught by
     * the browser first (the form only ever holds the current step's inputs), so this covers the rules it
     * cannot express - password strength, the confirmation matching, and the card shape.
     */
    const stepError = () => {
        if (current === 'type' && !accountType) return t('register.pickAccountType')
        if (current === 'details') {
            if (password.length < 8) return t('register.tooShort')
            if (password !== confirmPassword) return t('register.mismatch')
        }
        if (current === 'payment' && !cardOk()) return t('register.cardInvalid')
        return ''
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const problem = stepError()
        if (problem) {
            setError(problem)
            return
        }
        setError('')
        if (!isLast) {
            setStep(step + 1)
            return
        }
        setLoading(true)
        try {
            // Card fields are intentionally not sent — billing is a preview, nothing is charged or stored.
            // Nor is a plan for a warehouse account: the server derives the free one from the account type.
            await register({
                companyName: companyName.trim(),
                fullName: fullName.trim(),
                email: email.trim(),
                password,
                accountType,
                ...(isWarehouse ? {} : { plan, addons }),
                // Only sent when it actually works. A code the server would reject is never attached, so
                // somebody arriving on a dead link still gets an ordinary signup rather than an error —
                // they were told about it above, so nothing is being decided behind their back.
                ...(validInvite ? { inviteCode } : {}),
            })
            navigate('/dashboard', { replace: true })
        } catch (err) {
            setError(err.message || t('register.error'))
        } finally {
            setLoading(false)
        }
    }

    const goBack = () => {
        setError('')
        setStep((s) => Math.max(0, s - 1))
    }

    // Only backwards: a finished step can be revisited, an unreached one cannot be skipped into.
    const goToStep = (index) => {
        if (index < step) {
            setError('')
            setStep(index)
        }
    }

    const pickAccountType = (type) => {
        setError('')
        setAccountType(type)
    }

    const boxClass = 'space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30'
    const sectionHeading = 'flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-slate-100 p-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/10" />
                <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-secondary-400/20 blur-3xl dark:bg-secondary-500/10" />
            </div>

            <div className="fade-in-up shadow-pop relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
                <BackToHome className="mb-4" />
                <div className="mb-6 text-center">
                    <Link to="/" aria-label={t('common.backToHome')}>
                        <img src="/skladdo-logo.svg" alt="" aria-hidden="true" className="mx-auto mb-2 h-9 w-auto" />
                    </Link>
                    <h1 className="text-xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                        {t('register.title')}
                    </h1>
                </div>

                {validInvite && (
                    <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:border-teal-800 dark:bg-teal-900/20 dark:text-teal-200">
                        <p className="font-medium">{t('register.invite.title')}</p>
                        {/* `count` rather than a named variable: it is what i18next selects the plural
                            form from, and any other name renders the raw key instead of the sentence. */}
                        {validInvite.freeDays ? (
                            <p className="mt-0.5">{t('register.invite.freeDays', { count: validInvite.freeDays })}</p>
                        ) : null}
                    </div>
                )}
                {inviteCode && inviteChecked && !validInvite && (
                    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                        {t('register.invite.invalid')}
                    </div>
                )}

                <Stepper steps={steps} current={step} onSelect={goToStep} t={t} />

                {error && (
                    <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                        {error}
                    </div>
                )}

                {/* Each step is its own form, so the browser validates only what is on screen and Enter
                    advances rather than submitting the whole signup early. */}
                <form onSubmit={handleSubmit} className="mt-5 space-y-5">
                    {current === 'type' && (
                        <section className="space-y-4">
                            <StepHeading
                                title={t('register.accountTypeTitle')}
                                subtitle={t('register.accountTypeSubtitle')}
                            />
                            <div role="radiogroup" aria-label={t('register.accountType')} className="grid gap-3 sm:grid-cols-2">
                                {ACCOUNT_TYPES.map((type) => {
                                    const active = type === accountType
                                    const Icon = ACCOUNT_TYPE_ICON[type]
                                    return (
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            key={type}
                                            onClick={() => pickAccountType(type)}
                                            className={`flex cursor-pointer flex-col rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 motion-safe:active:scale-[0.99] ${
                                                active
                                                    ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500 dark:border-teal-400 dark:bg-teal-500/10 dark:ring-teal-400'
                                                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                                                    active
                                                        ? 'bg-teal-600 text-white'
                                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                }`}>
                                                    <Icon className="h-5 w-5" />
                                                </span>
                                                {active
                                                    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                                                    : <span className="h-5 w-5 shrink-0 rounded-full border border-slate-300 dark:border-slate-600" />}
                                            </div>
                                            <span className="mt-2.5 block text-base font-semibold">
                                                {t(`register.accountTypes.${type}.name`)}
                                            </span>
                                            <span className="mt-0.5 block text-sm leading-snug text-slate-500 dark:text-slate-400">
                                                {t(`register.accountTypes.${type}.tagline`)}
                                            </span>
                                            <ul className="mt-3 flex-1 space-y-1.5">
                                                {ACCOUNT_TYPE_POINTS[type].map((point) => (
                                                    <li key={point} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                                                        <span>{t(`register.accountTypes.${type}.points.${point}`)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <span className={`mt-3 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                type === 'WAREHOUSE'
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                            }`}>
                                                {type === 'WAREHOUSE' && <Sparkles className="h-3.5 w-3.5" />}
                                                {t(`register.accountTypes.${type}.price`)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                            <p className="text-center text-xs text-slate-400 dark:text-slate-500">{t('register.accountTypeHint')}</p>
                        </section>
                    )}

                    {current === 'details' && (
                        <section className="space-y-4">
                            <StepHeading title={t('register.detailsTitle')} subtitle={t('register.detailsSubtitle')} />

                            {/* The warehouse path never reaches a plan or payment step, so it says so here
                                rather than leaving the visitor waiting for a bill that is not coming. */}
                            {isWarehouse && (
                                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/30">
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                    <div>
                                        <p className="font-semibold text-emerald-800 dark:text-emerald-200">{t('register.warehouseFreeTitle')}</p>
                                        <p className="mt-0.5 leading-snug text-emerald-700/90 dark:text-emerald-300/90">{t('register.warehouseFree')}</p>
                                    </div>
                                </div>
                            )}

                            <div className={boxClass}>
                                <FormField id="register-company" label={t('register.company')} name="companyName" value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)} required placeholder="Acme Trading OÜ" autoComplete="organization" autoFocus />
                                <FormField id="register-name" label={t('register.fullName')} name="fullName" value={fullName}
                                    onChange={(e) => setFullName(e.target.value)} required placeholder="Jane Doe" autoComplete="name" />
                                <FormField id="register-email" label={t('register.email')} name="email" type="email" value={email}
                                    onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="username" />
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <FormField id="register-password" label={t('register.password')} name="password" type={pwType} showToggle={false} value={password}
                                        onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="new-password" />
                                    <FormField id="register-confirm" label={t('register.confirmPassword')} name="confirmPassword" type={pwType} showToggle={false} value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="••••••••" autoComplete="new-password" />
                                </div>
                                {/* One toggle reveals both password fields. */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1"><PasswordStrength password={password} /></div>
                                    <button
                                        type="button"
                                        onClick={() => setShowPw((v) => !v)}
                                        aria-label={showPw ? t('common.hidePassword') : t('common.showPassword')}
                                        title={showPw ? t('common.hidePassword') : t('common.showPassword')}
                                        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:hover:text-slate-200"
                                    >
                                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        {showPw ? t('common.hidePassword') : t('common.showPassword')}
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    {current === 'plan' && (
                        <section className="space-y-4">
                            <StepHeading title={t('register.planTitle')} subtitle={t('register.planSubtitle')} />

                            <div role="radiogroup" aria-label={t('register.choosePlan')} className="grid gap-3 sm:grid-cols-3">
                                {PLANS.map((p) => {
                                    const active = p.id === plan

                                    return (
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            key={p.id}
                                            onClick={() => setPlan(p.id)}
                                            className={`relative flex cursor-pointer flex-col rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 motion-safe:active:scale-[0.99] ${
                                                active
                                                    ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500 dark:border-teal-400 dark:bg-teal-500/10 dark:ring-teal-400'
                                                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                                            }`}
                                        >
                                            {p.popular && (
                                                <span className="absolute -top-2 right-3 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-white">
                                                    {t('landing.mostPopular')}
                                                </span>
                                            )}
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold">{t(`landing.plans.${p.id}.name`)}</span>
                                                {active
                                                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                                                    : <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300 dark:border-slate-600" />}
                                            </div>
                                            <span className="mt-1 block text-xl font-bold text-slate-800 dark:text-slate-100">
                                                €{p.price}
                                                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{t('landing.perMonth')}</span>
                                            </span>
                                            <span className="mt-0.5 block text-xs leading-snug text-slate-500 dark:text-slate-400">
                                                {t(`landing.plans.${p.id}.tagline`)}
                                            </span>
                                            {/* Seats are the whole difference between the tiers, so that is
                                                what the card leads with - followed by what does not change,
                                                or one number on its own reads like something is missing. */}
                                            <ul className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 dark:border-slate-700">
                                                <li className="text-sm text-slate-600 dark:text-slate-300">
                                                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                                                        {p.users === -1 ? t('landing.caps.unlimited') : p.users}
                                                    </span>{' '}
                                                    {t('landing.caps.users')}
                                                </li>
                                                <li className="text-sm text-slate-600 dark:text-slate-300">
                                                    {t('landing.caps.everythingElse')}
                                                </li>
                                            </ul>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Stated once, because it is identical on every tier — repeating it per card
                                would suggest the plans differ by feature, which they do not. */}
                            <div className={boxClass}>
                                <p className={sectionHeading}>
                                    <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                                    {t('register.planIncludedTitle')}
                                </p>
                                <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                                    {PLAN_INCLUDED.map((item) => (
                                        <li key={item} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                                            <span>{t(`register.planIncluded.${item}`)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Sold separately, and genuinely absent without them - so they are offered
                                here rather than left to be found in Settings after signing up. */}
                            <div className={boxClass}>
                                <p className={sectionHeading}>
                                    <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                                    {t('register.addonsTitle')}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('register.addonsSubtitle')}</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {ADDONS.map((addon) => {
                                        const on = addons.includes(addon.id)
                                        return (
                                            <button
                                                type="button"
                                                role="checkbox"
                                                aria-checked={on}
                                                key={addon.id}
                                                onClick={() => toggleAddon(addon.id)}
                                                className={`flex flex-col rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 motion-safe:active:scale-[0.99] ${
                                                    on
                                                        ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500 dark:border-teal-400 dark:bg-teal-500/10 dark:ring-teal-400'
                                                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                                                }`}
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-semibold">{t(`settings.plan.addon.${addon.id}`)}</span>
                                                    {on
                                                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                                                        : <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300 dark:border-slate-600" />}
                                                </span>
                                                <span className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                                                    +€{addon.price}
                                                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{t('landing.perMonth')}</span>
                                                </span>
                                                <span className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">
                                                    {t(`settings.plan.addon.${addon.id}_desc`)}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                                <p className="pt-1 text-xs text-slate-400 dark:text-slate-500">{t('register.addonsLater')}</p>
                            </div>

                            {/* The number that actually changes as the extras are toggled, so nobody
                                reaches the card step and finds a different figure than they expected. */}
                            <div className="flex items-baseline justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-900/60 dark:bg-teal-950/30">
                                <span className="text-sm font-semibold text-teal-800 dark:text-teal-200">{t('register.monthlyTotal')}</span>
                                <span className="text-base font-bold tabular-nums text-teal-800 dark:text-teal-100">
                                    €{total}
                                    <span className="text-xs font-normal text-teal-700/80 dark:text-teal-300/80">{t('landing.perMonth')}</span>
                                </span>
                            </div>
                        </section>
                    )}

                    {current === 'payment' && (
                        <section className="space-y-4">
                            <StepHeading title={t('register.paymentHeading')} subtitle={t('register.paymentSubtitle')} />

                            <div className={boxClass}>
                                <div className={sectionHeading}>
                                    <CreditCard className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                                    {t('register.cardHeading')}
                                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                                        <Lock className="h-3 w-3" />{t('register.trustSecure')}
                                    </span>
                                </div>
                                <FormField id="register-card-name" label={t('register.cardName')} name="cardName" value={cardName}
                                    onChange={(e) => setCardName(e.target.value)} placeholder="Jane Doe" autoComplete="cc-name" autoFocus />
                                <FormField id="register-card-number" label={t('register.cardNumber')} name="cardNumber" value={cardNumber}
                                    onChange={onCardNumber} placeholder="4242 4242 4242 4242" inputMode="numeric" autoComplete="cc-number" />
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField id="register-card-expiry" label={t('register.cardExpiry')} name="expiry" value={expiry}
                                        onChange={onExpiry} placeholder="MM/YY" inputMode="numeric" autoComplete="cc-exp" />
                                    <FormField id="register-card-cvc" label={t('register.cardCvc')} name="cvc" value={cvc}
                                        onChange={onCvc} placeholder="123" inputMode="numeric" autoComplete="cc-csc" />
                                </div>
                                <p className="text-xs text-slate-400 dark:text-slate-500">{t('register.cardPreviewNote')}</p>
                            </div>

                            {/* Order summary — leads with the €0.00 due today, the key trust signal. */}
                            <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-900/60 dark:bg-teal-950/30">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="flex items-center gap-1.5 text-sm font-semibold text-teal-800 dark:text-teal-200">
                                        <ShieldCheck className="h-4 w-4" />{t('register.dueToday')}
                                    </span>
                                    <span className="text-base font-bold tabular-nums text-teal-800 dark:text-teal-100">€0.00</span>
                                </div>
                                <p className="mt-1 text-xs leading-snug text-teal-700/90 dark:text-teal-300/90">
                                    {t('register.firstPaymentLine', {
                                        plan: t(`landing.plans.${selectedPlan.id}.name`),
                                        price: total,
                                        date: firstPaymentStr,
                                    })}
                                </p>
                            </div>
                        </section>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={goBack}
                                disabled={loading}
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 py-3 font-medium text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                {t('register.back')}
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="shadow-card inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-[0.99] dark:focus-visible:ring-offset-slate-900"
                        >
                            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                            {loading ? t('register.creating') : isLast ? t('register.submit') : t('register.continue')}
                            {!loading && !isLast && <ArrowRight className="h-4 w-4" />}
                        </button>
                    </div>
                </form>

                <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t('register.haveAccount')}{' '}
                    <Link to="/login" className="font-medium text-teal-700 underline-offset-2 hover:text-teal-800 hover:underline dark:text-teal-400 dark:hover:text-teal-300">
                        {t('register.signIn')}
                    </Link>
                </p>
            </div>
        </div>
    )
}

function StepHeading({ title, subtitle }) {
    return (
        <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
    )
}

/**
 * Progress across the steps of the path currently chosen. Finished steps are clickable so a visitor can
 * go back and change an answer; steps ahead are not, since each one depends on the last.
 */
function Stepper({ steps, current, onSelect, t }) {
    return (
        <ol className="flex items-center gap-1.5" aria-label={t('register.stepOf', { current: current + 1, total: steps.length })}>
            {steps.map((step, index) => {
                const done = index < current
                const active = index === current
                return (
                    <li key={step} className="flex flex-1 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => onSelect(index)}
                            disabled={!done}
                            aria-current={active ? 'step' : undefined}
                            className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${
                                done ? 'cursor-pointer' : 'cursor-default'
                            }`}
                        >
                            <span className={`h-1.5 rounded-full transition-colors ${
                                done || active ? 'bg-teal-600 dark:bg-teal-400' : 'bg-slate-200 dark:bg-slate-800'
                            }`} />
                            <span className={`truncate text-xs font-medium ${
                                active
                                    ? 'text-teal-700 dark:text-teal-300'
                                    : done
                                    ? 'text-slate-600 dark:text-slate-300'
                                    : 'text-slate-400 dark:text-slate-500'
                            }`}>
                                {t(`register.steps.${step}`)}
                            </span>
                        </button>
                    </li>
                )
            })}
        </ol>
    )
}
