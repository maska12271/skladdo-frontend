import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, Check } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../i18n'

/**
 * Language dropdown used in the app header and on the public landing page.
 *
 * `onChange` is optional: the account page passes one to also persist the choice on the user's profile,
 * while the header and landing page just switch the browser's language.
 */
export default function LanguageSwitcher({ onChange, variant = 'menu' }) {
    const { t, i18n } = useTranslation()
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    const current = SUPPORTED_LANGUAGES.find((l) => i18n.resolvedLanguage === l.code) || SUPPORTED_LANGUAGES[0]

    const pick = (code) => {
        i18n.changeLanguage(code)
        onChange?.(code)
        setOpen(false)
    }

    /**
     * All three languages laid out at once, for the nav drawer.
     *
     * A dropdown cannot work there: its panel is anchored to the right edge of a button sitting at the
     * *left* of a 320px drawer, so it opened 70px off the side of the screen. With only three languages
     * there is nothing to collapse anyway — showing them costs less room than the menu did.
     */
    if (variant === 'inline') {
        return (
            <div role="group" aria-label={t('header.language')} className="flex gap-1">
                {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                        key={lang.code}
                        type="button"
                        onClick={() => pick(lang.code)}
                        aria-pressed={current.code === lang.code}
                        className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition ${
                            current.code === lang.code
                                ? 'bg-teal-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                    >
                        {lang.short}
                    </button>
                ))}
            </div>
        )
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                aria-label={t('header.language')}
                aria-haspopup="menu"
                aria-expanded={open}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium hover:bg-slate-100 lg:min-h-0 dark:border-slate-700 dark:hover:bg-slate-800"
            >
                <Languages className="h-5 w-5" />
                <span className={"h-5 flex items-center"}>{current.short}</span>
            </button>
            {open && (
                <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
                >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                        <button
                            key={lang.code}
                            type="button"
                            role="menuitem"
                            onClick={() => pick(lang.code)}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-medium transition ${
                                current.code === lang.code
                                    ? 'text-teal-600 dark:text-teal-300'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60'
                            }`}
                        >
                            <span>{lang.label}</span>
                            {current.code === lang.code && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
