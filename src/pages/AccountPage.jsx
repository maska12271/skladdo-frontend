import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { User, Lock, SlidersHorizontal, PenLine, Loader2, Moon, Sun, Bell, Smile } from 'lucide-react'
import { apiGet, apiPut } from '../api/client'
import { NOTIFICATION_TYPES } from '../constants/notifications'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import { FormField } from '../components/FormField.jsx'
import PasswordStrength from '../components/PasswordStrength.jsx'
import RichTextEditor from '../components/RichTextEditor'
import LanguageSwitcher from '../components/LanguageSwitcher'
import Checkbox from '../components/Checkbox'
import AvatarPicker from '../components/AvatarPicker'

/** A titled card section wrapping one part of the account form. */
function Section({ icon: Icon, title, description, children }) {
    const { t } = useTranslation()
    return (
        <section className="shadow-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                    <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-base font-semibold">{title}</h2>
                    {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t(description)}</p>}
                </div>
            </div>
            {children}
        </section>
    )
}

const btnPrimary =
    'shadow-card inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60'

export default function AccountPage() {
    const { t } = useTranslation()
    const { user, updateUser, isWarehouseAccount } = useAuth()
    const { theme, toggleTheme } = useTheme()
    const toast = useToast()

    // --- Avatar ---
    // Held locally until saved, so trying icons on does not write one request per click. The comparison
    // is against the saved profile, which is what disables the button until something actually changed.
    const [avatar, setAvatar] = useState({
        avatarKey: user?.avatarKey || null,
        avatarIcon: user?.avatarIcon || null,
        avatarColor: user?.avatarColor || null,
    })
    const [savingAvatar, setSavingAvatar] = useState(false)
    const avatarChanged =
        (avatar.avatarKey || null) !== (user?.avatarKey || null)
        || (avatar.avatarIcon || null) !== (user?.avatarIcon || null)
        || (avatar.avatarColor || null) !== (user?.avatarColor || null)

    const saveAvatar = async (e) => {
        e.preventDefault()
        setSavingAvatar(true)
        try {
            const updated = await apiPut('/auth/me/avatar', avatar)
            updateUser({
                avatarKey: updated.avatarKey,
                avatarIcon: updated.avatarIcon,
                avatarColor: updated.avatarColor,
            })
            toast.success(t('account.avatar.saved'))
        } catch {
            /* error toast already surfaced by the API client */
        } finally {
            setSavingAvatar(false)
        }
    }

    // --- Profile ---
    const [fullName, setFullName] = useState(user?.fullName || '')
    const [savingProfile, setSavingProfile] = useState(false)
    const profileChanged = (fullName.trim() || '') !== (user?.fullName || '')

    const saveProfile = async (e) => {
        e.preventDefault()
        setSavingProfile(true)
        try {
            const updated = await apiPut('/auth/me/profile', { fullName })
            updateUser({ fullName: updated.fullName })
            setFullName(updated.fullName || '')
            toast.success(t('account.profile.saved'))
        } catch {
            /* error toast already surfaced by the API client */
        } finally {
            setSavingProfile(false)
        }
    }

    // --- Password ---
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [pwError, setPwError] = useState('')
    const [changingPw, setChangingPw] = useState(false)

    const changePassword = async (e) => {
        e.preventDefault()
        setPwError('')
        if (newPassword.length < 8) {
            setPwError(t('account.password.tooShort'))
            return
        }
        if (newPassword !== confirm) {
            setPwError(t('account.password.mismatch'))
            return
        }
        setChangingPw(true)
        try {
            await apiPut('/auth/me/password', { currentPassword, newPassword }, { suppressErrorToast: true })
            setCurrentPassword('')
            setNewPassword('')
            setConfirm('')
            toast.success(t('account.password.changed'))
        } catch (err) {
            setPwError(err.message || t('account.password.error'))
        } finally {
            setChangingPw(false)
        }
    }

    // Store the language on the account as well as in the browser, so it follows the user elsewhere.
    const saveLanguage = async (code) => {
        try {
            const updated = await apiPut('/auth/me/profile', { language: code })
            updateUser({ language: updated.language })
        } catch {
            /* the switch still applied locally; the api client surfaced the error */
        }
    }

    // --- Notification preferences ---
    // Stored as the muted set on the server; the UI shows the inverse (a checked box = "notify me").
    const [mutedTypes, setMutedTypes] = useState(null)

    useEffect(() => {
        apiGet('/notifications/preferences')
            .then((res) => setMutedTypes(res?.mutedTypes || []))
            .catch(() => setMutedTypes([]))
    }, [])

    const toggleNotification = async (type) => {
        const next = mutedTypes.includes(type)
            ? mutedTypes.filter((m) => m !== type)
            : [...mutedTypes, type]
        const previous = mutedTypes
        setMutedTypes(next) // optimistic: a checkbox that lags behind the click feels broken
        try {
            const res = await apiPut('/notifications/preferences', { mutedTypes: next })
            setMutedTypes(res?.mutedTypes || next)
        } catch {
            setMutedTypes(previous)
        }
    }

    // --- Signature ---
    const [signature, setSignature] = useState(user?.emailSignature || '')
    const [savingSig, setSavingSig] = useState(false)

    const saveSignature = async () => {
        setSavingSig(true)
        try {
            const updated = await apiPut('/auth/me/signature', { signature })
            updateUser({ emailSignature: updated.emailSignature })
            setSignature(updated.emailSignature || '')
            toast.success(t('account.signature.saved'))
        } catch {
            /* error toast already surfaced by the API client */
        } finally {
            setSavingSig(false)
        }
    }

    return (
        <div className="mx-auto max-w-3xl">
            <PageHeader title={t('account.title')} description={t('account.subtitle')} />

            <div className="space-y-6">
                {/* Profile */}
                <Section icon={Smile} title={t('account.avatar.heading')} description="account.avatar.description">
                    <form onSubmit={saveAvatar} className="space-y-4">
                        <AvatarPicker value={avatar} onChange={setAvatar} preview={user} />
                        <div className="flex justify-end">
                            <button type="submit" disabled={savingAvatar || !avatarChanged} className={btnPrimary}>
                                {savingAvatar && <Loader2 className="h-4 w-4 animate-spin" />}
                                {t('account.avatar.save')}
                            </button>
                        </div>
                    </form>
                </Section>

                <Section icon={User} title={t('account.profile.heading')}>
                    <form onSubmit={saveProfile} className="space-y-4">
                        <FormField
                            id="account-fullname"
                            label={t('account.profile.fullName')}
                            name="fullName"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder={t('account.profile.fullNamePlaceholder')}
                            autoComplete="name"
                        />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('account.profile.email')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('account.profile.role')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{user?.role ? t(`roles.${user.role}`) : '—'}</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{t('account.profile.emailHint')}</p>
                        <div className="flex justify-end">
                            <button type="submit" disabled={savingProfile || !profileChanged} className={btnPrimary}>
                                {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                                {t('account.profile.save')}
                            </button>
                        </div>
                    </form>
                </Section>

                {/* Password */}
                <Section icon={Lock} title={t('account.password.heading')}>
                    <form onSubmit={changePassword} className="space-y-4">
                        {pwError && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                                {pwError}
                            </div>
                        )}
                        <FormField
                            id="account-current-password"
                            label={t('account.password.current')}
                            name="currentPassword"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                        <div className="space-y-2">
                            <FormField
                                id="account-new-password"
                                label={t('account.password.new')}
                                name="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                            />
                            <PasswordStrength password={newPassword} />
                        </div>
                        <FormField
                            id="account-confirm-password"
                            label={t('account.password.confirm')}
                            name="confirm"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                        <p className="text-xs text-slate-400 dark:text-slate-500">{t('account.password.hint')}</p>
                        <div className="flex justify-end">
                            <button type="submit" disabled={changingPw} className={btnPrimary}>
                                {changingPw && <Loader2 className="h-4 w-4 animate-spin" />}
                                {changingPw ? t('account.password.changing') : t('account.password.submit')}
                            </button>
                        </div>
                    </form>
                </Section>

                {/* Preferences */}
                <Section icon={SlidersHorizontal} title={t('account.preferences.heading')}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('account.preferences.language')}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{t('account.preferences.languageHint')}</p>
                        </div>
                        {/* Persist the choice on the account so it follows the user to another browser. */}
                        <LanguageSwitcher onChange={saveLanguage} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('account.preferences.theme')}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{t('account.preferences.themeHint')}</p>
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                            {theme === 'dark' ? t('account.preferences.themeLight') : t('account.preferences.themeDark')}
                        </button>
                    </div>
                </Section>

                {/* Notifications. Hidden for a warehouse account: every type is raised against the company
                    that owns the login, and that account has no catalogue, invoices or tenders to raise
                    them from — so there is nothing here to opt out of. */}
                {!isWarehouseAccount && (
                <Section icon={Bell} title={t('account.notifications.heading')} description="account.notifications.description">
                    {mutedTypes === null ? (
                        <p className="text-sm text-slate-500">{t('common.loading')}</p>
                    ) : (
                        <div className="space-y-1">
                            {NOTIFICATION_TYPES.map(({ value, icon: Icon, accent }) => (
                                <label
                                    key={value}
                                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                >
                                    <span className="flex min-w-0 items-center gap-2.5">
                                        <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
                                        <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                                            {t(`notifications.type.${value}`)}
                                        </span>
                                    </span>
                                    <Checkbox checked={!mutedTypes.includes(value)} onChange={() => toggleNotification(value)} className="shrink-0" />
                                </label>
                            ))}
                        </div>
                    )}
                </Section>
                )}

                {/* Signature. Hidden for a warehouse account: it signs outbound manufacturer email, which
                    that account has no access to send. */}
                {!isWarehouseAccount && (
                <Section icon={PenLine} title={t('account.signature.heading')} description="account.signature.description">
                    <div className="space-y-3">
                        <RichTextEditor
                            id="account-signature"
                            value={signature}
                            onChange={setSignature}
                            placeholder={t('account.signature.placeholder')}
                        />
                        <div className="flex justify-end">
                            <button type="button" onClick={saveSignature} disabled={savingSig} className={btnPrimary}>
                                {savingSig && <Loader2 className="h-4 w-4 animate-spin" />}
                                {t('account.signature.save')}
                            </button>
                        </div>
                    </div>
                </Section>
                )}
            </div>
        </div>
    )
}
