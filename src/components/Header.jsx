import { useTranslation } from 'react-i18next'
import { Menu, Moon, Sun } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import CompanySwitcher from './CompanySwitcher'
import LanguageSwitcher from './LanguageSwitcher'
import NotificationBell from './NotificationBell'

export default function Header({ onOpenNav }) {
    const { t } = useTranslation()
    const { theme, toggleTheme } = useTheme()
    const { user, isPartnerSession, isWarehouseAccount, isPlatformCompany } = useAuth()

    return (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 md:px-6 md:py-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                    {/* Below `lg` the sidebar is an overlay, so this is the only way to reach the nav. */}
                    <button
                        type="button"
                        onClick={onOpenNav}
                        aria-label={t('nav.openMenu')}
                        className="-ml-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    {/* This space used to claim the app was a "tender management system", which it isn't —
                        tenders are one optional add-on. What actually belongs here is which company's data
                        you are looking at, since one login can now span several. */}
                    <div className="min-w-0">
                        {/* The header says whose data is on screen. For an operator that is every company at
                            once, so naming their shell company would be actively misleading. Untranslated
                            like the rest of the panel — see components/AdminBits.jsx. */}
                        {/* Dropped on a phone: the eyebrow costs a whole line of a short screen to label
                            the company name directly beneath it, which needs no label. */}
                        <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 sm:block dark:text-slate-400">
                            {isPlatformCompany
                                ? 'Platform'
                                : isPartnerSession ? t('header.workingAsPartner') : t('header.signedInTo')}
                        </p>
                        <h2 className="truncate text-base font-semibold sm:mt-1 sm:text-lg">
                            {isPlatformCompany ? 'All companies' : (user?.companyName || t('nav.appName'))}
                        </h2>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {/* Both of these open dropdowns wider than a phone, and neither fits beside the company
                        name at that width — below `lg` they move into the nav drawer, which has the room. */}
                    <div className="hidden lg:block">
                        <CompanySwitcher />
                    </div>
                    {/* Notifications are raised against the company that owns the login — low stock,
                        overdue invoices, tender deadlines. A warehouse account owns none of that, so the
                        bell would never do anything but sit there empty. */}
                    {/* A platform account owns none of it either, for the same reason. */}
                    {!isWarehouseAccount && !isPlatformCompany && <NotificationBell />}
                    {/* Language and theme both live in the nav drawer below `lg`. They are set once and
                        rarely revisited, so a phone header is the wrong place to spend width on them. */}
                    <div className="hidden lg:block">
                        <LanguageSwitcher />
                    </div>
                    <button
                        onClick={toggleTheme}
                        aria-label={theme === 'dark' ? t('header.switchToLight') : t('header.switchToDark')}
                        className="hidden rounded-xl border border-slate-300 p-2.5 hover:bg-slate-100 lg:inline-flex dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </button>
                </div>
            </div>
        </header>
    )
}
