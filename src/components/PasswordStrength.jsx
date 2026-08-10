import { useTranslation } from 'react-i18next'

/**
 * A lightweight password-strength score from 0 (empty) to 4 (strong), based on length and the mix of
 * character classes. No external library — just enough signal to nudge users toward a stronger password.
 */
export function scorePassword(pw) {
    if (!pw) return 0
    let s = 0
    if (pw.length >= 6) s++
    if (pw.length >= 10) s++
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
    if (/\d/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    return Math.min(4, Math.max(1, s))
}

const LEVELS = [
    { key: 'weak', bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
    { key: 'fair', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
    { key: 'good', bar: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' },
    { key: 'strong', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
]

/** A four-segment strength meter with a label; renders nothing until a password is typed. */
export default function PasswordStrength({ password }) {
    const { t } = useTranslation()
    const score = scorePassword(password)
    if (!score) return null
    const level = LEVELS[score - 1]

    return (
        <div className="space-y-1">
            <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${i < score ? level.bar : 'bg-slate-200 dark:bg-slate-700'}`}
                    />
                ))}
            </div>
            <p className={`text-xs font-medium ${level.text}`}>
                {t('password.strength.label')}: {t(`password.strength.${level.key}`)}
            </p>
        </div>
    )
}
