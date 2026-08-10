import { useTranslation } from 'react-i18next'
import { Moon, Sun } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import CompanySwitcher from './CompanySwitcher'
import LanguageSwitcher from './LanguageSwitcher'
import NotificationBell from './NotificationBell'

export default function Header() {
    const { t } = useTranslation()
    const { theme, toggleTheme } = useTheme()
    const { user, isPartnerSession, isWarehouseAccount } = useAuth()

    return (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 md:px-6">
            <div className="flex items-center justify-between gap-4">
                {/* This space used to claim the app was a "tender management system", which it isn't —
                    tenders are one optional add-on. What actually belongs here is which company's data
                    you are looking at, since one login can now span several. */}
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {isPartnerSession ? t('header.workingAsPartner') : t('header.signedInTo')}
                    </p>
                    <h2 className="mt-1 truncate text-lg font-semibold">
                        {user?.companyName || t('nav.appName')}
                    </h2>
                </div>

                <div className="flex items-center gap-2">
                    <CompanySwitcher />
                    {/* Notifications are raised against the company that owns the login — low stock,
                        overdue invoices, tender deadlines. A warehouse account owns none of that, so the
                        bell would never do anything but sit there empty. */}
                    {!isWarehouseAccount && <NotificationBell />}
                    <LanguageSwitcher />
                    <button
                        onClick={toggleTheme}
                        aria-label={theme === 'dark' ? t('header.switchToLight') : t('header.switchToDark')}
                        className="rounded-xl border border-slate-300 p-2.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </button>
                </div>
            </div>
        </header>
    )
}
