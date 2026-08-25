import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    ArrowRight, Check, LayoutDashboard, Boxes, ShoppingCart,
    Gavel, Mail, Users, Warehouse, Globe, Receipt, ShieldCheck, BarChart3,
    TriangleAlert, Copy, ClockAlert, Repeat, KeyRound, PackageCheck, Wallet,
    Minus, X, ChevronDown, Sparkles, Moon, Sun, Maximize2, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
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

// The header links that track the reader's position, listed in the order their sections appear below.
const NAV_SECTIONS = ['features', 'warehouse', 'why', 'pricing']

// The sticky header is about 61px tall; every linked section carries `scroll-mt-16` (64px) so an anchor
// jump leaves its heading clear of it. The highlight line sits just below that landing spot, so the
// section a click scrolls to is the one that lights up.
const SPY_LINE = 96

/** The nav section the reader is currently in — the last one whose top has passed under the header. */
function useActiveSection() {
    const [active, setActive] = useState(null)

    useEffect(() => {
        const update = () => {
            let current = null
            for (const id of NAV_SECTIONS) {
                const el = document.getElementById(id)
                if (el && el.getBoundingClientRect().top <= SPY_LINE) current = id
            }
            setActive(current)
        }
        update()
        window.addEventListener('scroll', update, { passive: true })
        window.addEventListener('resize', update)
        return () => {
            window.removeEventListener('scroll', update)
            window.removeEventListener('resize', update)
        }
    }, [])

    return active
}

/** Back to the top of the page — what clicking the wordmark does, since there is nowhere else to go. */
function scrollToTop() {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
}

export default function LandingPage() {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()
    const active = useActiveSection()
    // Index into FEATURES of the shot being viewed, or null. An index rather than the shot itself, because
    // the viewer steps through the tour: knowing *where* you are is what makes "next" mean anything.
    const [shotIndex, setShotIndex] = useState(null)
    const openShot = (key) => setShotIndex(FEATURES.findIndex((f) => f.key === key))

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />
    }

    return (
        <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <Header t={t} active={active} />
            <Hero t={t} onOpenShot={openShot} />
            <Problem t={t} />
            <Features t={t} onOpenShot={openShot} />
            <MoreFeatures t={t} />
            <WarehouseAccount t={t} />
            <Comparison t={t} />
            <Pricing t={t} />
            <Faq t={t} />
            <FinalCta t={t} />
            <Footer t={t} />
            <Lightbox index={shotIndex} onMove={setShotIndex} onClose={() => setShotIndex(null)} t={t} />
        </div>
    )
}

/**
 * A screenshot at full size, with the caption that explains what is being looked at, and arrows through
 * the rest of the tour.
 *
 * The shots are 1800px wide and the page renders them at about a third of that — enough to show the
 * shape of a screen, nowhere near enough to read one. Once someone has opened one they are looking at
 * the product rather than the page, so the whole set is reachable from here without closing and hunting
 * for the next section.
 */
function Lightbox({ index, onMove, onClose, t }) {
    const { theme } = useTheme()
    const open = index !== null && index >= 0

    // Escape closes, the arrow keys step. Bound to the document rather than the dialog so they work
    // without first clicking something inside it. The page behind must not scroll while this is up —
    // the same contract the app's own modals keep.
    useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose()
            if (event.key === 'ArrowRight') onMove((i) => (i + 1) % FEATURES.length)
            if (event.key === 'ArrowLeft') onMove((i) => (i - 1 + FEATURES.length) % FEATURES.length)
        }
        document.addEventListener('keydown', onKeyDown)
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.body.style.overflow = previousOverflow
        }
    }, [open, onClose, onMove])

    if (!open) return null

    const feature = FEATURES[index]
    // Wrapping rather than stopping at the ends: six shots is a loop worth going round, and a dead arrow
    // reads as broken.
    const step = (delta) => onMove((i) => (i + delta + FEATURES.length) % FEATURES.length)
    const themed = theme === 'dark' ? feature.img.replace(/\.png$/, '-dark.png') : feature.img

    const arrow = "absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t(`landing.features.${feature.key}.title`)}
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm sm:p-8"
        >
            <button
                type="button"
                onClick={onClose}
                aria-label={t('landing.shot.close')}
                className="absolute right-4 top-4 rounded-xl bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
                <X className="h-5 w-5" />
            </button>

            <button
                type="button"
                onClick={(event) => { event.stopPropagation(); step(-1) }}
                aria-label={t('landing.shot.previous')}
                className={`${arrow} left-2 sm:left-4`}
            >
                <ChevronLeft className="h-6 w-6" />
            </button>
            <button
                type="button"
                onClick={(event) => { event.stopPropagation(); step(1) }}
                aria-label={t('landing.shot.next')}
                className={`${arrow} right-2 sm:right-4`}
            >
                <ChevronRight className="h-6 w-6" />
            </button>

            {/* Stops a click on the picture itself from closing what the reader just opened. */}
            <figure
                onClick={(event) => event.stopPropagation()}
                className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
            >
                <img
                    src={themed}
                    alt={t(`landing.features.${feature.key}.title`)}
                    className="min-h-0 w-full flex-1 object-contain"
                />
                <figcaption className="flex shrink-0 items-start gap-4 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {t(`landing.features.${feature.key}.title`)}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {t(`landing.features.${feature.key}.desc`)}
                        </p>
                    </div>
                    {/* Position in the tour, so the arrows have somewhere to be going. */}
                    <span className="shrink-0 pt-0.5 text-sm tabular-nums text-slate-400 dark:text-slate-500">
                        {index + 1} / {FEATURES.length}
                    </span>
                </figcaption>
            </figure>
        </div>
    )
}

function Header({ t, active }) {
    return (
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/80">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
                <button
                    type="button"
                    onClick={scrollToTop}
                    aria-label={t('landing.nav.backToTop')}
                    className="flex shrink-0 items-center gap-2 rounded-xl"
                >
                    <img src="/skladdo-logo.svg" alt="" aria-hidden="true" className="h-8 w-auto" />
                    {/* The wordmark goes at the narrowest widths and the raccoon carries the brand alone.
                        Four controls and a name do not fit across 390px: keeping it meant the name running
                        under the language switcher, which looks broken rather than full. */}
                    <span className="hidden text-lg font-bold tracking-tight text-teal-700 sm:inline dark:text-teal-400">
                        {t('nav.appName')}
                    </span>
                </button>
                <nav className="hidden items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
                    {NAV_SECTIONS.map((id) => (
                        <a
                            key={id}
                            href={`#${id}`}
                            aria-current={active === id ? 'true' : undefined}
                            className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                                active === id
                                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300'
                                    : 'hover:text-teal-700 dark:hover:text-teal-400'
                            }`}
                        >
                            {t(`landing.nav.${id}`)}
                        </a>
                    ))}
                </nav>
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <LanguageSwitcher />
                    {/* Dropped on a phone. The visitor's OS already has a dark-mode preference and the page
                        follows it; a fourth control competing for 390px costs more than the choice is worth. */}
                    <span className="hidden sm:inline-flex">
                        <ThemeToggle t={t} />
                    </span>
                    <Link to="/login" className="hidden rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-teal-700 dark:text-slate-300 dark:hover:text-teal-400 sm:inline-block">
                        {t('landing.nav.signIn')}
                    </Link>
                    <Link to="/register" className="whitespace-nowrap rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 sm:px-3.5">
                        {t('landing.nav.getStarted')}
                    </Link>
                </div>
            </div>
        </header>
    )
}

function Hero({ t, onOpenShot }) {
    return (
        <section className="relative overflow-hidden">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 right-0 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/10" />
                <div className="absolute top-40 -left-24 h-96 w-96 rounded-full bg-secondary-400/20 blur-3xl dark:bg-secondary-500/10" />
            </div>
            <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-8 text-center sm:pt-20 sm:pb-10 lg:pt-24">
                <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300">
                    {t('landing.hero.badge')}
                </span>
                <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-bold tracking-tight sm:mt-6 sm:text-4xl lg:text-5xl">
                    {t('landing.hero.title')}
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:mt-5 sm:text-lg dark:text-slate-300">
                    {t('landing.hero.subtitle')}
                </p>
                <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:mt-8 sm:flex-row sm:items-center">
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
                    <BrowserFrame
                        src="/landing/dashboard.png"
                        alt={t('landing.features.dashboard.title')}
                        featureKey="dashboard"
                        onOpen={onOpenShot}
                        t={t}
                    />
                </div>
            </div>
        </section>
    )
}

/** The problem the product exists to solve, stated before any feature is named. */
function Problem({ t }) {
    return (
        <section className="border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{t('landing.problemTitle')}</h2>
                    <p className="mt-3 text-base text-slate-600 sm:mt-4 sm:text-lg dark:text-slate-300">{t('landing.problemSubtitle')}</p>
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

                <p className="mx-auto mt-8 max-w-3xl text-center text-base font-medium text-slate-800 sm:mt-10 sm:text-lg dark:text-slate-100">
                    {t('landing.problemAnswer')}
                </p>
            </div>
        </section>
    )
}

function Features({ t, onOpenShot }) {
    return (
        <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{t('landing.featuresTitle')}</h2>
                <p className="mt-3 text-base text-slate-600 sm:mt-4 sm:text-lg dark:text-slate-300">{t('landing.featuresSubtitle')}</p>
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
                                <BrowserFrame
                                    src={f.img}
                                    alt={t(`landing.features.${f.key}.title`)}
                                    featureKey={f.key}
                                    onOpen={onOpenShot}
                                    t={t}
                                />
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
            <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('landing.moreTitle')}</h2>
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
        <section id="warehouse" className="relative scroll-mt-16 overflow-hidden bg-teal-50/60 dark:bg-teal-950/20">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/10" />
            </div>
            <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
                <div className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t('landing.warehouse.badge')}
                    </span>
                    <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{t('landing.warehouse.title')}</h2>
                    <p className="mt-3 text-base text-slate-600 sm:mt-4 sm:text-lg dark:text-slate-300">{t('landing.warehouse.subtitle')}</p>
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
        <section id="why" className="scroll-mt-16 border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{t('landing.compareTitle')}</h2>
                    <p className="mt-3 text-base text-slate-600 sm:mt-4 sm:text-lg dark:text-slate-300">{t('landing.compareSubtitle')}</p>
                </div>

                {/* Below `lg` the same comparison is a stack of cards, one per row of the table. A
                    three-column table cannot be made to fit a phone: `min-w-[46rem]` inside an
                    overflow-x means the Skladdo column - the entire point of the section - starts off
                    screen, and nobody scrolls sideways to find out they should buy something. */}
                <div className="mt-10 space-y-3 lg:hidden">
                    {COMPARE_ROWS.map((row) => (
                        <div key={row} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <p className="font-semibold">{t(`landing.compare.rows.${row}.label`)}</p>
                            <ul className="mt-3 space-y-2">
                                {COLS.map((c) => {
                                    const Icon = c.icon
                                    const highlight = c.key === 'skladdo'
                                    return (
                                        <li key={c.key} className="flex gap-2 text-sm">
                                            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${c.tone}`} />
                                            <span className={highlight
                                                ? 'font-medium text-slate-900 dark:text-slate-100'
                                                : 'text-slate-500 dark:text-slate-400'}>
                                                <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                                    {t(`landing.compare.cols.${c.key}`)}
                                                </span>
                                                <br />
                                                {t(`landing.compare.rows.${row}.${c.key}`)}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="mt-12 hidden overflow-x-auto lg:block">
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
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{t('landing.pricingTitle')}</h2>
                <p className="mt-3 text-base text-slate-600 sm:mt-4 sm:text-lg dark:text-slate-300">{t('landing.pricingSubtitle')}</p>
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
                            <span className="text-3xl font-bold sm:text-4xl">€{p.price}</span>
                            <span className="text-sm text-slate-500 dark:text-slate-400">{t('landing.perMonth')}</span>
                        </div>
                        <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                            <Cap>{cap(p.users, t('landing.caps.users'))}</Cap>
                            {/* The tiers differ by seats alone, so the card says what does not change
                                as plainly as what does - otherwise a €29 card listing one number reads
                                like the cheap one is missing something. */}
                            <Cap>{t('landing.caps.everythingElse')}</Cap>
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
            <div className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
                <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{t('landing.faqTitle')}</h2>
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
        <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
            <div className="relative overflow-hidden rounded-3xl bg-teal-600 px-5 py-12 text-center text-white sm:px-6 sm:py-14">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                    <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                </div>
                <div className="relative">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{t('landing.ctaTitle')}</h2>
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

/** Light/dark switch, the same control the signed-in header carries. */
function ThemeToggle({ t }) {
    const { theme, toggleTheme } = useTheme()
    const dark = theme === 'dark'
    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? t('header.switchToLight') : t('header.switchToDark')}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-3 py-2.5 text-slate-600 hover:bg-slate-100 lg:min-h-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
    )
}

/**
 * A lightweight browser-window frame around a product screenshot. Every shot exists in both themes -
 * the dark capture sits beside the light one as `<name>-dark.png` - so a dark reader is not handed a
 * blinding white rectangle, and vice versa.
 */
function BrowserFrame({ src, alt, featureKey, onOpen, t }) {
    const { theme } = useTheme()
    const themed = theme === 'dark' ? src.replace(/\.png$/, '-dark.png') : src
    return (
        <button
            type="button"
            onClick={() => onOpen(featureKey)}
            aria-label={t('landing.shot.open', { name: alt })}
            className="group block w-full overflow-hidden rounded-xl border border-slate-200 shadow-pop transition dark:border-slate-800"
        >
            <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <span className="relative block">
                <img src={themed} alt={alt} loading="lazy" className="block w-full" />
                {/* The affordance only appears on hover/focus, so the shot itself stays uncluttered. */}
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/0 opacity-0 transition group-hover:bg-slate-950/40 group-hover:opacity-100 group-focus-visible:bg-slate-950/40 group-focus-visible:opacity-100">
                    <span className="inline-flex items-center gap-2 rounded-xl bg-white/95 px-4 py-2 text-sm font-semibold text-slate-900">
                        <Maximize2 className="h-4 w-4" />
                        {t('landing.shot.view')}
                    </span>
                </span>
            </span>
        </button>
    )
}
