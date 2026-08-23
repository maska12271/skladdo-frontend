import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    ArrowRight, Check, LayoutDashboard, Boxes, ShoppingCart,
    Gavel, Mail, Users, Warehouse, Globe, Receipt, ShieldCheck, BarChart3,
    TriangleAlert, Copy, ClockAlert, Repeat, KeyRound, PackageCheck, Wallet,
    Minus, X, ChevronDown, Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { PLANS, UNLIMITED } from '../config/plans'

// The feature sections, each paired with a real product screenshot (public/landing/*.png).
const FEATURES = [
    { key: 'dashboard', icon: LayoutDashboard, img: '/landing/dashboard.png' },
    { key: 'inventory', icon: Boxes, img: '/landing/inventory.png' },
    { key: 'orders', icon: ShoppingCart, img: '/landing/orders.png' },
    { key: 'tenders', icon: Gavel, img: '/landing/tenders.png' },
    { key: 'emails', icon: Mail, img: '/landing/emails.png' },
    { key: 'team', icon: Users, img: '/landing/team.png' },
]

const MORE = [
    { key: 'warehouses', icon: Warehouse },
    { key: 'lots', icon: Boxes },
    { key: 'invoices', icon: Receipt },
    { key: 'multiCurrency', icon: Globe },
    { key: 'analytics', icon: BarChart3 },
    { key: 'permissions', icon: ShieldCheck },
]

// The daily pain a trading company feels before it has a system — the "why you need this" section.
const PROBLEMS = [
    { key: 'stale', icon: TriangleAlert },
    { key: 'copies', icon: Copy },
    { key: 'chase', icon: ClockAlert },
    { key: 'retype', icon: Repeat },
]

// What a connected warehouse partner gets, and what it costs them (nothing).
const WAREHOUSE_POINTS = [
    { key: 'code', icon: KeyRound },
    { key: 'scope', icon: Warehouse },
    { key: 'work', icon: PackageCheck },
    { key: 'cost', icon: Wallet },
]

const COMPARE_ROWS = ['truth', 'stock', 'access', 'partners', 'tenders', 'invoices', 'history', 'start']

const FAQ = ['warehouseFree', 'excel', 'lockin', 'team', 'languages', 'cancel']

export default function LandingPage() {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />
    }

    return (
        <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <Header t={t} />
            <Hero t={t} />
            <Problem t={t} />
            <Features t={t} />
            <MoreFeatures t={t} />
            <WarehouseAccount t={t} />
            <Comparison t={t} />
            <Pricing t={t} />
            <Faq t={t} />
            <FinalCta t={t} />
            <Footer t={t} />
        </div>
    )
}

function Header({ t }) {
    return (
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/80">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-2">
                    <img src="/skladdo-logo.svg" alt="" aria-hidden="true" className="h-8 w-auto" />
                    <span className="text-lg font-bold tracking-tight text-teal-700 dark:text-teal-400">{t('nav.appName')}</span>
                </div>
                <nav className="hidden items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
                    <a href="#features" className="hover:text-teal-700 dark:hover:text-teal-400">{t('landing.nav.features')}</a>
                    <a href="#warehouse" className="hover:text-teal-700 dark:hover:text-teal-400">{t('landing.nav.warehouse')}</a>
                    <a href="#why" className="hover:text-teal-700 dark:hover:text-teal-400">{t('landing.nav.why')}</a>
                    <a href="#pricing" className="hover:text-teal-700 dark:hover:text-teal-400">{t('landing.nav.pricing')}</a>
                </nav>
                <div className="flex items-center gap-2">
                    <LanguageSwitcher />
                    <Link to="/login" className="hidden rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-teal-700 dark:text-slate-300 dark:hover:text-teal-400 sm:inline-block">
                        {t('landing.nav.signIn')}
                    </Link>
                    <Link to="/register" className="rounded-xl bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                        {t('landing.nav.getStarted')}
                    </Link>
                </div>
            </div>
        </header>
    )
}

function Hero({ t }) {
    return (
        <section className="relative overflow-hidden">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 right-0 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/10" />
                <div className="absolute top-40 -left-24 h-96 w-96 rounded-full bg-secondary-400/20 blur-3xl dark:bg-secondary-500/10" />
            </div>
            <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-10 text-center sm:pt-24">
                <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300">
                    {t('landing.hero.badge')}
                </span>
                <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
                    {t('landing.hero.title')}
                </h1>
                <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
                    {t('landing.hero.subtitle')}
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link to="/register" className="shadow-card inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white hover:bg-teal-700">
                        {t('landing.hero.ctaPrimary')} <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link to="/login" className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                        {t('landing.hero.ctaSecondary')}
                    </Link>
                </div>
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t('landing.hero.note')}</p>
                <a
                    href="#warehouse"
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/60 px-4 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-950/60"
                >
                    <Sparkles className="h-4 w-4" />
                    {t('landing.hero.freeNote')}
                    <ArrowRight className="h-3.5 w-3.5" />
                </a>

                <div className="mx-auto mt-14 max-w-5xl">
                    <BrowserFrame src="/landing/dashboard.png" alt={t('landing.features.dashboard.title')} />
                </div>
            </div>
        </section>
    )
}

/** The problem the product exists to solve, stated before any feature is named. */
function Problem({ t }) {
    return (
        <section className="border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="mx-auto max-w-6xl px-4 py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.problemTitle')}</h2>
                    <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">{t('landing.problemSubtitle')}</p>
                </div>

                <div className="mt-12 grid gap-6 sm:grid-cols-2">
                    {PROBLEMS.map((p) => {
                        const Icon = p.icon
                        return (
                            <div key={p.key} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                                <Icon className="h-6 w-6 shrink-0 text-amber-500" />
                                <div>
                                    <h3 className="font-semibold">{t(`landing.problems.${p.key}.title`)}</h3>
                                    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{t(`landing.problems.${p.key}.desc`)}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>

                <p className="mx-auto mt-10 max-w-3xl text-center text-lg font-medium text-slate-800 dark:text-slate-100">
                    {t('landing.problemAnswer')}
                </p>
            </div>
        </section>
    )
}

function Features({ t }) {
    return (
        <section id="features" className="mx-auto max-w-6xl px-4 py-20">
            <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.featuresTitle')}</h2>
                <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">{t('landing.featuresSubtitle')}</p>
            </div>

            <div className="mt-16 space-y-20">
                {FEATURES.map((f, i) => {
                    const Icon = f.icon
                    const reversed = i % 2 === 1
                    return (
                        <div key={f.key} className="grid items-center gap-8 lg:grid-cols-2">
                            <div className={reversed ? 'lg:order-2' : ''}>
                                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                                    <Icon className="h-6 w-6" />
                                </div>
                                <h3 className="mt-4 text-2xl font-semibold">{t(`landing.features.${f.key}.title`)}</h3>
                                <p className="mt-3 text-slate-600 dark:text-slate-300">{t(`landing.features.${f.key}.desc`)}</p>
                            </div>
                            <div className={reversed ? 'lg:order-1' : ''}>
                                <BrowserFrame src={f.img} alt={t(`landing.features.${f.key}.title`)} />
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function MoreFeatures({ t }) {
    return (
        <section className="border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="mx-auto max-w-6xl px-4 py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight">{t('landing.moreTitle')}</h2>
                </div>
                <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {MORE.map((m) => {
                        const Icon = m.icon
                        return (
                            <div key={m.key} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                                <Icon className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                                <h3 className="mt-3 font-semibold">{t(`landing.more.${m.key}.title`)}</h3>
                                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{t(`landing.more.${m.key}.desc`)}</p>
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}

/** The free WAREHOUSE account type — a separate audience, so it gets its own section and its own CTA. */
function WarehouseAccount({ t }) {
    return (
        <section id="warehouse" className="relative overflow-hidden bg-teal-50/60 dark:bg-teal-950/20">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/10" />
            </div>
            <div className="relative mx-auto max-w-6xl px-4 py-20">
                <div className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t('landing.warehouse.badge')}
                    </span>
                    <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.warehouse.title')}</h2>
                    <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">{t('landing.warehouse.subtitle')}</p>
                </div>

                <div className="mt-12 grid gap-6 sm:grid-cols-2">
                    {WAREHOUSE_POINTS.map((p) => {
                        const Icon = p.icon
                        return (
                            <div key={p.key} className="rounded-2xl border border-teal-100 bg-white p-6 dark:border-teal-900/60 dark:bg-slate-900">
                                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <h3 className="mt-3 font-semibold">{t(`landing.warehouse.points.${p.key}.title`)}</h3>
                                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{t(`landing.warehouse.points.${p.key}.desc`)}</p>
                            </div>
                        )
                    })}
                </div>

                <div className="mt-10 flex flex-col items-center gap-4">
                    <p className="flex max-w-2xl items-start gap-2 text-center text-sm text-slate-600 dark:text-slate-300">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                        <span>{t('landing.warehouse.limits')}</span>
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white hover:bg-teal-700">
                            {t('landing.warehouse.ctaWarehouse')} <ArrowRight className="h-4 w-4" />
                        </Link>
                        <a href="#pricing" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-900">
                            {t('landing.warehouse.ctaBusiness')}
                        </a>
                    </div>
                </div>
            </div>
        </section>
    )
}

/** Skladdo against the two things it actually replaces: a pile of spreadsheets, or a general-purpose suite. */
function Comparison({ t }) {
    const COLS = [
        { key: 'sheets', icon: X, tone: 'text-rose-500' },
        { key: 'generic', icon: Minus, tone: 'text-slate-400' },
        { key: 'skladdo', icon: Check, tone: 'text-teal-600 dark:text-teal-400' },
    ]

    return (
        <section id="why" className="border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="mx-auto max-w-6xl px-4 py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.compareTitle')}</h2>
                    <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">{t('landing.compareSubtitle')}</p>
                </div>

                <div className="mt-12 overflow-x-auto">
                    <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-left text-sm">
                        <thead>
                            <tr>
                                <th scope="col" className="w-56 px-4 pb-3" />
                                {COLS.map((c) => (
                                    <th
                                        key={c.key}
                                        scope="col"
                                        className={`px-4 pb-3 font-semibold ${
                                            c.key === 'skladdo' ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
                                        }`}
                                    >
                                        {t(`landing.compare.cols.${c.key}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {COMPARE_ROWS.map((row) => (
                                <tr key={row} className="align-top">
                                    <th scope="row" className="border-t border-slate-200 px-4 py-4 font-semibold dark:border-slate-800">
                                        {t(`landing.compare.rows.${row}.label`)}
                                    </th>
                                    {COLS.map((c) => {
                                        const Icon = c.icon
                                        const highlight = c.key === 'skladdo'
                                        return (
                                            <td
                                                key={c.key}
                                                className={`border-t border-slate-200 px-4 py-4 dark:border-slate-800 ${
                                                    highlight
                                                        ? 'bg-white font-medium text-slate-900 dark:bg-slate-900 dark:text-slate-100'
                                                        : 'text-slate-600 dark:text-slate-400'
                                                }`}
                                            >
                                                <span className="flex gap-2">
                                                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${c.tone}`} />
                                                    <span>{t(`landing.compare.rows.${row}.${c.key}`)}</span>
                                                </span>
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    )
}

function Pricing({ t }) {
    const cap = (value, label) => (value === UNLIMITED ? t('landing.caps.unlimited') : value) + ' ' + label

    return (
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-20">
            <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.pricingTitle')}</h2>
                <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">{t('landing.pricingSubtitle')}</p>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
                {PLANS.map((p) => (
                    <div
                        key={p.id}
                        className={`relative flex flex-col rounded-2xl border p-7 ${
                            p.popular
                                ? 'border-teal-600 shadow-pop ring-1 ring-teal-600 dark:border-teal-400 dark:ring-teal-400'
                                : 'border-slate-200 dark:border-slate-800'
                        }`}
                    >
                        {p.popular && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
                                {t('landing.mostPopular')}
                            </span>
                        )}
                        <h3 className="text-lg font-semibold">{t(`landing.plans.${p.id}.name`)}</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t(`landing.plans.${p.id}.tagline`)}</p>
                        <div className="mt-5 flex items-baseline gap-1">
                            <span className="text-4xl font-bold">€{p.price}</span>
                            <span className="text-sm text-slate-500 dark:text-slate-400">{t('landing.perMonth')}</span>
                        </div>
                        <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                            <Cap>{cap(p.caps.users, t('landing.caps.users'))}</Cap>
                            <Cap>{cap(p.caps.manufacturers, t('landing.caps.manufacturers'))}</Cap>
                            <Cap>{cap(p.caps.products, t('landing.caps.products'))}</Cap>
                        </ul>
                        <Link
                            to={`/register?plan=${p.id}`}
                            className={`mt-7 inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold ${
                                p.popular
                                    ? 'bg-teal-600 text-white hover:bg-teal-700'
                                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900'
                            }`}
                        >
                            {t('landing.choosePlan')}
                        </Link>
                    </div>
                ))}
            </div>
            <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">{t('landing.addonsNote')}</p>

            <div className="mt-10 flex flex-col items-center justify-between gap-5 rounded-2xl border border-teal-200 bg-teal-50/60 p-7 dark:border-teal-900 dark:bg-teal-950/20 sm:flex-row sm:text-left">
                <div className="flex items-start gap-4">
                    <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white sm:inline-flex">
                        <Warehouse className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="flex items-center gap-2 font-semibold">
                            {t('landing.pricingFree.title')}
                            <span className="rounded-full bg-teal-600 px-2 py-0.5 text-xs font-semibold text-white">€0</span>
                        </h3>
                        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{t('landing.pricingFree.desc')}</p>
                    </div>
                </div>
                <Link to="/register" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700">
                    {t('landing.pricingFree.cta')} <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        </section>
    )
}

/** Plain <details> accordion — the questions that decide a signup, answered without JavaScript. */
function Faq({ t }) {
    return (
        <section className="border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="mx-auto max-w-3xl px-4 py-20">
                <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.faqTitle')}</h2>
                <div className="mt-12 space-y-3">
                    {FAQ.map((key) => (
                        <details key={key} className="group rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                                {t(`landing.faq.${key}.q`)}
                                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                            </summary>
                            <p className="mt-3 text-slate-600 dark:text-slate-300">{t(`landing.faq.${key}.a`)}</p>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    )
}

function Cap({ children }) {
    return (
        <li className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
            <span>{children}</span>
        </li>
    )
}

function FinalCta({ t }) {
    return (
        <section className="mx-auto max-w-6xl px-4 pb-20">
            <div className="relative overflow-hidden rounded-3xl bg-teal-600 px-6 py-14 text-center text-white">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                    <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                </div>
                <div className="relative">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.ctaTitle')}</h2>
                    <p className="mx-auto mt-4 max-w-xl text-teal-50">{t('landing.ctaSubtitle')}</p>
                    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-teal-700 hover:bg-teal-50">
                            {t('landing.hero.ctaPrimary')} <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/60 px-6 py-3 font-semibold text-white hover:bg-white/10">
                            <Warehouse className="h-4 w-4" /> {t('landing.ctaWarehouse')}
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    )
}

function Footer({ t }) {
    return (
        <footer className="border-t border-slate-200 dark:border-slate-800">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
                <div className="flex items-center gap-2">
                    <img src="/skladdo-logo.svg" alt="" aria-hidden="true" className="h-6 w-auto" />
                    <span className="font-semibold text-teal-700 dark:text-teal-400">{t('nav.appName')}</span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    © {new Date().getFullYear()} {t('nav.appName')} · {t('landing.footer.rights')}
                </p>
                <div className="flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-300">
                    <Link to="/login" className="hover:text-teal-700 dark:hover:text-teal-400">{t('landing.nav.signIn')}</Link>
                    <Link to="/register" className="hover:text-teal-700 dark:hover:text-teal-400">{t('landing.nav.getStarted')}</Link>
                </div>
            </div>
        </footer>
    )
}

/** A lightweight browser-window frame around a product screenshot. */
function BrowserFrame({ src, alt }) {
    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-pop dark:border-slate-800">
            <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <img src={src} alt={alt} loading="lazy" className="block w-full" />
        </div>
    )
}
