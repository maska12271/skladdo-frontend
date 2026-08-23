import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiDownloadPost, apiGet, apiPost, apiPut, apiUpload } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import LoadingBlock from '../components/LoadingBlock'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import { useModal } from '../hooks/useModal'
import { FormField, FormSelect, PasswordAwareInput } from '../components/FormField.jsx'
import UnitSelect from '../components/UnitSelect.jsx'
import { SUPPORTED_LANGUAGES } from '../i18n'
import AddressAutocompleteField from '../components/AddressAutocompleteField.jsx'
import EmailTemplatesManager from '../components/EmailTemplatesManager'
import PlanBillingTab from '../components/PlanBillingTab'
import CompanyDataExport from '../components/CompanyDataExport'
import { usePresignedUrl } from '../hooks/usePresignedUrl'
import { PERMISSION_MODULES } from '../constants/modules'
import ConnectionsTab from '../components/ConnectionsTab'
import { SlidersHorizontal, Percent, FileText, Users, Plus, Pencil, Trash2, Star, UploadCloud, X, Mail, Send, Info, CreditCard, Building2, Handshake } from 'lucide-react'
import Checkbox from '../components/Checkbox'

const TABS = [
    { key: 'general', icon: SlidersHorizontal },
    { key: 'company', icon: Building2 },
    { key: 'connections', icon: Handshake },
    { key: 'taxes', icon: Percent },
    { key: 'invoicing', icon: FileText },
    { key: 'email', icon: Mail },
    { key: 'defaults', icon: Users },
    { key: 'plan', icon: CreditCard },
]

/**
 * A warehouse account has no company of its own to run, so most of this page describes things it will
 * never have: tax rates, invoice numbering and outbound email are all about selling goods, and the
 * default-permission template governs nothing — at home every module is closed to it, and inside a client
 * its staff get the connection's fixed grant rather than anything set here.
 *
 * What is left is the account itself: who it is, who it works for, and what it pays.
 */
const WAREHOUSE_ACCOUNT_TABS = new Set(['general', 'company', 'connections', 'plan'])

// IANA timezone options for the General tab. Intl.supportedValuesOf gives the full canonical list without
// a dependency; the short fallback keeps the field usable on an engine that lacks it. UTC is guaranteed
// present because it is the backend's default when a company has not chosen one.
const TIMEZONES = (() => {
    let zones
    try {
        zones = Intl.supportedValuesOf('timeZone')
    } catch {
        zones = ['Europe/Tallinn', 'Europe/Helsinki', 'Europe/Riga', 'Europe/Stockholm', 'Europe/Berlin', 'Europe/London']
    }
    return zones.includes('UTC') ? zones : ['UTC', ...zones]
})()

const PENALTY_PERIODS = ['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY']

const INVOICE_TEMPLATES = ['CLASSIC', 'MODERN', 'MINIMAL']

// Appearance toggles rendered as a list of on/off rows in the Invoicing tab.
const INVOICE_TOGGLES = [
    'invoiceShowLogo',
    'invoiceShowLineSku',
    'invoiceShowPaymentTerms',
    'invoiceShowBankDetails',
    'invoiceShowNotes',
]

const PERMISSION_ACTIONS = [
    { key: 'canView', labelKey: 'users.perm.view' },
    { key: 'canCreate', labelKey: 'users.perm.create' },
    { key: 'canEdit', labelKey: 'users.perm.edit' },
    { key: 'canDelete', labelKey: 'users.perm.delete' },
]

const emptyTaxForm = { name: '', percentage: '', isDefault: false, active: true }

export default function SettingsPage() {
    const { t } = useTranslation()
    const toast = useToast()
    const { refresh: refreshDisplaySettings, currencies } = useSettings()
    const { updateUser, isWarehouseAccount } = useAuth()

    const tabs = isWarehouseAccount ? TABS.filter(({ key }) => WAREHOUSE_ACCOUNT_TABS.has(key)) : TABS
    // Kept in the URL so the company switcher can link straight to Connections, and so a refresh stays put.
    const [searchParams, setSearchParams] = useSearchParams()
    const requestedTab = searchParams.get('tab')
    const tab = tabs.some(({ key }) => key === requestedTab) ? requestedTab : tabs[0].key
    const setTab = (next) => setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        params.set('tab', next)
        return params
    }, { replace: true })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [settings, setSettings] = useState(null)
    // The Company tab's identity half, which lives on the Company record rather than CompanySettings.
    const [companyProfile, setCompanyProfile] = useState({})
    const [taxRates, setTaxRates] = useState([])
    const [permRows, setPermRows] = useState([])
    const [warehouses, setWarehouses] = useState([])

    const taxModal = useModal()
    const deleteTaxModal = useModal()
    const [taxForm, setTaxForm] = useState(emptyTaxForm)
    const [editingTaxId, setEditingTaxId] = useState(null)
    const [deletingTax, setDeletingTax] = useState(null)

    // Email/SMTP: a new password is only sent when the user explicitly enters one (a stored password is
    // shown masked and kept unless changed).
    const [smtpPasswordInput, setSmtpPasswordInput] = useState('')
    const [changingPassword, setChangingPassword] = useState(false)
    const [testRecipient, setTestRecipient] = useState('')
    const [testing, setTesting] = useState(false)

    useEffect(() => {
        loadAll()
    }, [])

    const loadAll = async () => {
        setLoading(true)
        try {
            // The warehouse list only feeds the Invoicing tab's default-warehouse picker, which a
            // warehouse account does not have — and asking for it there is a 403 that would hang the
            // whole page on its way through Promise.all.
            const [settingsRes, taxRes, permRes, warehousesRes, companyRes] = await Promise.all([
                apiGet('/settings'),
                apiGet('/settings/tax-rates'),
                apiGet('/settings/default-permissions'),
                isWarehouseAccount ? Promise.resolve([]) : apiGet('/warehouses'),
                apiGet('/company'),
            ])
            setSettings(settingsRes)
            setTaxRates(Array.isArray(taxRes) ? taxRes : [])
            setPermRows(Array.isArray(permRes) ? permRes : [])
            setWarehouses(Array.isArray(warehousesRes) ? warehousesRes : [])
            setCompanyProfile(companyRes || {})
        } finally {
            setLoading(false)
        }
    }

    // --- General / invoicing -----------------------------------------------------------------------

    const handleSettingsChange = (e) => {
        const { name, value, type, checked } = e.target
        setSettings((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    }

    const logoInputRef = useRef(null)
    const [logoUploading, setLogoUploading] = useState(false)
    const logoUrl = usePresignedUrl(settings?.logoKey)

    const uploadLogo = async (file) => {
        if (!file) return
        setLogoUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await apiUpload('/upload/image', formData)
            setSettings((prev) => ({ ...prev, logoKey: res.key }))
        } finally {
            setLogoUploading(false)
            if (logoInputRef.current) logoInputRef.current.value = ''
        }
    }

    // The settings payload sent to the API; shared by the save action and the live invoice preview.
    const buildSettingsPayload = () => ({
        currency: (settings.currency || 'EUR').toUpperCase(),
        pricesIncludeTax: !!settings.pricesIncludeTax,
        timezone: settings.timezone || 'UTC',
        invoiceNumberPrefix: settings.invoiceNumberPrefix || '',
        tenderNumberPrefix: settings.tenderNumberPrefix || null,
        invoicePaymentTermDays: Number(settings.invoicePaymentTermDays) || 0,
        latePaymentPenaltyPercent: Number(settings.latePaymentPenaltyPercent) || 0,
        penaltyPeriod: settings.penaltyPeriod || 'DAILY',
        defaultPrepaymentPercent: Number(settings.defaultPrepaymentPercent) || 0,
        companyAddress: settings.companyAddress || null,
        companyEmail: settings.companyEmail || null,
        companyPhone: settings.companyPhone || null,
        vatNumber: settings.vatNumber || null,
        bankName: settings.bankName || null,
        bankIban: settings.bankIban || null,
        logoKey: settings.logoKey || null,
        invoiceTemplate: settings.invoiceTemplate || 'CLASSIC',
        invoiceAccentColor: settings.invoiceAccentColor || null,
        invoiceShowLogo: settings.invoiceShowLogo !== false,
        invoiceShowLineSku: settings.invoiceShowLineSku !== false,
        invoiceShowPaymentTerms: settings.invoiceShowPaymentTerms !== false,
        invoiceShowBankDetails: settings.invoiceShowBankDetails !== false,
        invoiceShowNotes: settings.invoiceShowNotes !== false,
        invoiceFooterText: settings.invoiceFooterText || null,
        defaultProductUnit: settings.defaultProductUnit || 'pcs',
        defaultMinimumStock: Number(settings.defaultMinimumStock) || 0,
        defaultUserLanguage: settings.defaultUserLanguage || 'en',
        defaultWarehouseId: settings.defaultWarehouseId ? Number(settings.defaultWarehouseId) : null,
        // Email / SMTP. These are passed through on every save so editing any tab never wipes them. The
        // password is only sent when the user actually typed a new one (blank = keep the stored one).
        smtpHost: settings.smtpHost || null,
        smtpPort: settings.smtpPort ? Number(settings.smtpPort) : null,
        smtpUsername: settings.smtpUsername || null,
        smtpFromAddress: settings.smtpFromAddress || null,
        smtpFromName: settings.smtpFromName || null,
        smtpUseTls: settings.smtpUseTls !== false,
        smtpPassword: smtpPasswordInput || '',
    })

    const saveSettings = async (e) => {
        e?.preventDefault?.()
        setSaving(true)
        try {
            const saved = await apiPut('/settings', buildSettingsPayload())
            setSettings(saved)
            setSmtpPasswordInput('')
            setChangingPassword(false)
            await refreshDisplaySettings()
            toast.success(t('settings.saved'))
        } finally {
            setSaving(false)
        }
    }

    /**
     * The Company tab spans two records — identity on Company, contact/bank/logo on CompanySettings — so
     * one Save writes both. The identity goes first: if it is rejected (e.g. a duplicate registration
     * code) the settings write is skipped rather than leaving the two half-applied.
     */
    const saveCompanyTab = async (e) => {
        e?.preventDefault?.()
        setSaving(true)
        try {
            const savedCompany = await apiPut('/company', {
                name: companyProfile.name,
                registrationCode: companyProfile.registrationCode || null,
            }, { suppressErrorToast: true })
            setCompanyProfile(savedCompany)
            updateUser({ companyName: savedCompany.name })
        } catch (err) {
            toast.error(err.message || t('settings.company.error'))
            setSaving(false)
            return
        }
        setSaving(false)
        await saveSettings() // owns the spinner and the success toast for the second half
    }

    // --- Email / SMTP test send --------------------------------------------------------------------

    const sendTestEmail = async () => {
        if (!testRecipient.trim()) {
            toast.error(t('settings.email.testRecipientRequired'))
            return
        }
        setTesting(true)
        try {
            const result = await apiPost('/settings/email/test-send', { recipient: testRecipient.trim() })
            if (result.success) toast.success(t('settings.email.testSent'))
            else toast.error(t('settings.email.testFailed', { reason: result.message || '' }))
        } finally {
            setTesting(false)
        }
    }

    // --- Live invoice preview ----------------------------------------------------------------------
    // Renders a sample invoice PDF on the server from the current (unsaved) settings, so the layout,
    // accent colour and toggles can be previewed before saving. Debounced and only while the Invoicing
    // tab is open. The blob URL is revoked when it is replaced or the component unmounts.

    const [previewUrl, setPreviewUrl] = useState(null)
    const [previewLoading, setPreviewLoading] = useState(false)

    // Only the fields that actually change the rendered invoice, so unrelated edits don't refetch.
    const previewSignature = settings
        ? JSON.stringify({
              currency: settings.currency,
              invoiceNumberPrefix: settings.invoiceNumberPrefix,
              invoicePaymentTermDays: settings.invoicePaymentTermDays,
              latePaymentPenaltyPercent: settings.latePaymentPenaltyPercent,
              penaltyPeriod: settings.penaltyPeriod,
              companyAddress: settings.companyAddress,
              companyEmail: settings.companyEmail,
              companyPhone: settings.companyPhone,
              vatNumber: settings.vatNumber,
              bankName: settings.bankName,
              bankIban: settings.bankIban,
              logoKey: settings.logoKey,
              invoiceTemplate: settings.invoiceTemplate,
              invoiceAccentColor: settings.invoiceAccentColor,
              invoiceShowLogo: settings.invoiceShowLogo,
              invoiceShowLineSku: settings.invoiceShowLineSku,
              invoiceShowPaymentTerms: settings.invoiceShowPaymentTerms,
              invoiceShowBankDetails: settings.invoiceShowBankDetails,
              invoiceShowNotes: settings.invoiceShowNotes,
              invoiceFooterText: settings.invoiceFooterText,
          })
        : ''

    useEffect(() => {
        if (tab !== 'invoicing' || !settings) return
        let cancelled = false
        let objectUrl = null
        setPreviewLoading(true)
        const timer = setTimeout(async () => {
            try {
                const blob = await apiDownloadPost('/settings/invoice-preview', buildSettingsPayload())
                if (cancelled) return
                objectUrl = URL.createObjectURL(blob)
                setPreviewUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev)
                    return objectUrl
                })
            } catch {
                // The global error toast already surfaced the failure; leave the previous preview in place.
            } finally {
                if (!cancelled) setPreviewLoading(false)
            }
        }, 500)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, previewSignature])

    // Revoke the last preview URL on unmount.
    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // --- Tax rates ---------------------------------------------------------------------------------

    const openCreateTax = () => {
        setEditingTaxId(null)
        setTaxForm({ ...emptyTaxForm, isDefault: taxRates.length === 0 })
        taxModal.open()
    }

    const openEditTax = (rate) => {
        setEditingTaxId(rate.id)
        setTaxForm({
            name: rate.name || '',
            percentage: rate.percentage ?? '',
            isDefault: !!rate.isDefault,
            active: rate.active !== false,
        })
        taxModal.open()
    }

    const handleTaxChange = (e) => {
        const { name, value, type, checked } = e.target
        setTaxForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    }

    const saveTax = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const payload = {
                name: taxForm.name,
                percentage: Number(taxForm.percentage) || 0,
                isDefault: !!taxForm.isDefault,
                active: !!taxForm.active,
            }
            if (editingTaxId) await apiPut(`/settings/tax-rates/${editingTaxId}`, payload)
            else await apiPost('/settings/tax-rates', payload)
            toast.success(editingTaxId ? t('settings.tax.updated') : t('settings.tax.created'))
            taxModal.close()
            await loadAll()
            await refreshDisplaySettings()
        } finally {
            setSaving(false)
        }
    }

    const confirmDeleteTax = (rate) => {
        setDeletingTax(rate)
        deleteTaxModal.open()
    }

    const handleDeleteTax = async () => {
        if (!deletingTax) return
        setSaving(true)
        try {
            await apiDelete(`/settings/tax-rates/${deletingTax.id}`)
            toast.success(t('settings.tax.deleted'))
            deleteTaxModal.close()
            setDeletingTax(null)
            await loadAll()
            await refreshDisplaySettings()
        } finally {
            setSaving(false)
        }
    }

    // --- Default user permissions ------------------------------------------------------------------

    const togglePerm = (module, action, checked) => {
        setPermRows((prev) =>
            prev.map((row) => {
                if (row.module !== module) return row
                const next = { ...row, [action]: checked }
                if (action === 'canView' && !checked) {
                    next.canCreate = false
                    next.canEdit = false
                    next.canDelete = false
                } else if (action !== 'canView' && checked) {
                    next.canView = true
                }
                return next
            })
        )
    }

    // Emails is granted as a single capability ("can send emails"): ON enables viewing sent history
    // and sending; OFF revokes everything. Template management is not separately grantable here.
    const toggleEmailAccess = (module, checked) => {
        setPermRows((prev) =>
            prev.map((row) =>
                row.module === module
                    ? { ...row, canView: checked, canCreate: checked, canEdit: false, canDelete: false }
                    : row,
            )
        )
    }

    const savePermissions = async () => {
        setSaving(true)
        try {
            const saved = await apiPut('/settings/default-permissions', { permissions: permRows })
            if (Array.isArray(saved)) setPermRows(saved)
            toast.success(t('settings.defaults.permsSaved'))
        } finally {
            setSaving(false)
        }
    }

    if (loading || !settings) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('settings.title')} description={t(isWarehouseAccount ? 'settings.warehouseDescription' : 'settings.description')} />
                <LoadingBlock />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('settings.title')} description={t(isWarehouseAccount ? 'settings.warehouseDescription' : 'settings.description')} />

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800">
                {tabs.map(({ key, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`-mb-px inline-flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                            tab === key
                                ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {t(`settings.tabs.${key}`)}
                    </button>
                ))}
            </div>

            {/* General */}
            {tab === 'general' && (
                <form onSubmit={saveSettings} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    {/* Currency and tax-inclusive pricing price goods for sale. A warehouse account sells
                        nothing — it only ever handles its clients' stock, priced in their currency. The
                        timezone still matters: it is what dates and scheduled work are read in. */}
                    <div className="grid gap-4 md:grid-cols-2">
                        {!isWarehouseAccount && (currencies.length > 0 ? (
                            <FormSelect
                                id="currency"
                                label={t('settings.general.currency')}
                                name="currency"
                                value={settings.currency || 'EUR'}
                                onChange={handleSettingsChange}
                                options={currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                            />
                        ) : (
                            <FormField
                                id="currency"
                                label={t('settings.general.currency')}
                                name="currency"
                                value={settings.currency || ''}
                                onChange={handleSettingsChange}
                                required
                                placeholder="EUR"
                                inputClassName="uppercase"
                                maxLength={3}
                            />
                        ))}
                        <div className="space-y-1">
                            <FormSelect
                                id="timezone"
                                label={t('settings.general.timezone')}
                                name="timezone"
                                value={settings.timezone || 'UTC'}
                                onChange={handleSettingsChange}
                                searchable
                                options={TIMEZONES.map((zone) => ({ value: zone, label: zone }))}
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.general.timezoneHint')}</p>
                        </div>
                    </div>

                    {!isWarehouseAccount && (
                        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                            <span>
                                <span className="block font-medium text-slate-700 dark:text-slate-200">{t('settings.general.pricesIncludeTax')}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{t('settings.general.pricesIncludeTaxHint')}</span>
                            </span>
                            <Checkbox name="pricesIncludeTax" checked={!!settings.pricesIncludeTax} onChange={handleSettingsChange} />
                        </label>
                    )}

                    <SaveBar saving={saving} label={t('settings.save')} />
                </form>
            )}

            {/* Taxes */}
            {tab === 'taxes' && (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.tax.intro')}</p>
                        <button
                            onClick={openCreateTax}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                        >
                            <Plus className="h-4 w-4" /> {t('settings.tax.add')}
                        </button>
                    </div>

                    {taxRates.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-500">{t('settings.tax.empty')}</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900">
                                        <th className="px-4 py-3 font-semibold">{t('common.name')}</th>
                                        <th className="px-4 py-3 font-semibold">{t('settings.tax.rate')}</th>
                                        <th className="px-4 py-3 font-semibold">{t('common.status')}</th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {taxRates.map((rate) => (
                                        <tr key={rate.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                            <td className="px-4 py-3 font-medium">
                                                <span className="inline-flex items-center gap-2">
                                                    {rate.name}
                                                    {rate.isDefault && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                                            <Star className="h-3 w-3" /> {t('settings.tax.default')}
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">{Number(rate.percentage)}%</td>
                                            <td className="px-4 py-3">
                                                <span className={rate.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                                                    {rate.active ? t('common.active') : t('common.inactive')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => openEditTax(rate)}
                                                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                        aria-label={t('common.edit')}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => confirmDeleteTax(rate)}
                                                        className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                                        aria-label={t('common.delete')}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Invoicing */}
            {tab === 'invoicing' && (
                <form onSubmit={saveSettings} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                            id="payment-term"
                            label={t('settings.invoicing.paymentTermDays')}
                            type="number"
                            name="invoicePaymentTermDays"
                            value={settings.invoicePaymentTermDays ?? ''}
                            onChange={handleSettingsChange}
                            min={0}
                        />
                        <FormField
                            id="prepayment"
                            label={t('settings.invoicing.prepaymentPercent')}
                            type="number"
                            step="0.01"
                            name="defaultPrepaymentPercent"
                            value={settings.defaultPrepaymentPercent ?? ''}
                            onChange={handleSettingsChange}
                            min={0}
                        />
                        <FormField
                            id="penalty-percent"
                            label={t('settings.invoicing.penaltyPercent')}
                            type="number"
                            step="0.01"
                            name="latePaymentPenaltyPercent"
                            value={settings.latePaymentPenaltyPercent ?? ''}
                            onChange={handleSettingsChange}
                            min={0}
                        />
                        <FormSelect
                            id="penalty-period"
                            label={t('settings.invoicing.penaltyPeriod')}
                            name="penaltyPeriod"
                            value={settings.penaltyPeriod || 'DAILY'}
                            onChange={handleSettingsChange}
                            options={PENALTY_PERIODS.map((p) => ({ value: p, label: t(`settings.invoicing.period.${p}`) }))}
                        />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.invoicing.hint')}</p>

                    {/* Invoice PDF appearance: layout, accent colour, toggles and footer. */}
                    <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t('settings.invoicing.appearanceHeading')}
                        </h3>
                        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{t('settings.invoicing.appearanceHint')}</p>

                        {/* Controls on the left, live preview on the right (side by side on desktop). */}
                        <div className="grid gap-6 lg:grid-cols-2">
                          <div>

                        {/* Layout picker */}
                        <div className="mb-5 grid gap-3 sm:grid-cols-3">
                            {INVOICE_TEMPLATES.map((tpl) => {
                                const selected = (settings.invoiceTemplate || 'CLASSIC') === tpl
                                return (
                                    <button
                                        type="button"
                                        key={tpl}
                                        onClick={() => setSettings((prev) => ({ ...prev, invoiceTemplate: tpl }))}
                                        className={`rounded-xl border p-3 text-left transition ${
                                            selected
                                                ? 'border-teal-600 ring-1 ring-teal-600 dark:border-teal-400 dark:ring-teal-400'
                                                : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                                        }`}
                                        aria-pressed={selected}
                                    >
                                        <InvoiceTemplateThumb template={tpl} accent={settings.invoiceAccentColor || '#0f766e'} />
                                        <span className="mt-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                                            {t(`settings.invoicing.template.${tpl}`)}
                                        </span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                                            {t(`settings.invoicing.templateHint.${tpl}`)}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Accent colour */}
                        <div className="mb-5 flex items-center gap-3">
                            <label htmlFor="invoice-accent" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {t('settings.invoicing.accentColor')}
                            </label>
                            <input
                                id="invoice-accent"
                                type="color"
                                name="invoiceAccentColor"
                                value={settings.invoiceAccentColor || '#0f766e'}
                                onChange={handleSettingsChange}
                                className="h-9 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400">{settings.invoiceAccentColor || '#0f766e'}</span>
                        </div>

                        {/* Show/hide toggles */}
                        <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                            {INVOICE_TOGGLES.map((key) => (
                                <label
                                    key={key}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800"
                                >
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{t(`settings.invoicing.toggle.${key}`)}</span>
                                    <Checkbox name={key} checked={settings[key] !== false} onChange={handleSettingsChange} />
                                </label>
                            ))}
                        </div>

                        <FormField
                            id="invoice-footer"
                            label={t('settings.invoicing.footerText')}
                            name="invoiceFooterText"
                            value={settings.invoiceFooterText || ''}
                            onChange={handleSettingsChange}
                            placeholder={t('settings.invoicing.footerPlaceholder')}
                        />
                          </div>

                          {/* Right: live example invoice, rendered server-side from the current selection.
                              Sticky on desktop so it stays in view while the controls are adjusted. */}
                          <div className="lg:sticky lg:top-6 lg:self-start">
                            <div className="mb-2 flex items-center justify-between">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {t('settings.invoicing.previewHeading')}
                                </h4>
                                {previewLoading && (
                                    <span className="text-xs text-slate-400">{t('settings.invoicing.previewLoading')}</span>
                                )}
                            </div>
                            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                                {previewUrl ? (
                                    <iframe
                                        title={t('settings.invoicing.previewHeading')}
                                        src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                                        className="h-[520px] w-full lg:h-[720px]"
                                    />
                                ) : (
                                    <div className="flex h-[520px] items-center justify-center text-sm text-slate-400 lg:h-[720px]">
                                        {t('settings.invoicing.previewLoading')}
                                    </div>
                                )}
                            </div>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('settings.invoicing.previewHint')}</p>
                          </div>
                        </div>
                    </div>

                    {/* The seller block that used to live here now lives on the Company tab: address, VAT,
                        bank and logo describe the business itself, not how the invoice is laid out. */}

                    <SaveBar saving={saving} label={t('settings.save')} savingLabel={t('common.saving')} />
                </form>
            )}

            {/* Email / SMTP */}
            {tab === 'email' && (
                <div className="space-y-6">
                    <form onSubmit={saveSettings} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                        <div>
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {t('settings.email.smtpHeading')}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.email.smtpIntro')}</p>
                        </div>

                        {/* How-it-works guidance: what SMTP is and where an admin gets each value. */}
                        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-900/60 dark:bg-sky-950/30">
                            <div className="flex items-start gap-2">
                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                                <div className="space-y-2">
                                    <p className="font-medium text-sky-900 dark:text-sky-200">{t('settings.email.helpTitle')}</p>
                                    <p className="text-sky-800 dark:text-sky-300/90">{t('settings.email.helpHow')}</p>
                                    <ul className="list-disc space-y-1 pl-4 text-sky-800 dark:text-sky-300/90">
                                        <li>{t('settings.email.helpGmail')}</li>
                                        <li>{t('settings.email.helpM365')}</li>
                                        <li>{t('settings.email.helpOther')}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField id="smtp-host" label={t('settings.email.host')} name="smtpHost" value={settings.smtpHost || ''} onChange={handleSettingsChange} placeholder="smtp.example.com" />
                            <FormField id="smtp-port" label={t('settings.email.port')} type="number" name="smtpPort" value={settings.smtpPort ?? ''} onChange={handleSettingsChange} placeholder="587" />
                            <FormField id="smtp-username" label={t('settings.email.username')} name="smtpUsername" value={settings.smtpUsername || ''} onChange={handleSettingsChange} placeholder="user@example.com" />

                            {/* Password: masked when one is stored, unless the user chooses to change it. */}
                            <div className="space-y-2">
                                <label htmlFor="smtp-password" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                    {t('settings.email.password')}
                                </label>
                                {settings.hasPassword && !changingPassword ? (
                                    <div className="flex items-center gap-3">
                                        <span className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-slate-400 dark:border-slate-700">••••••••</span>
                                        <button type="button" onClick={() => { setChangingPassword(true); setSmtpPasswordInput('') }} className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400">
                                            {t('settings.email.changePassword')}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <PasswordAwareInput
                                            id="smtp-password"
                                            type="password"
                                            value={smtpPasswordInput}
                                            onChange={(e) => setSmtpPasswordInput(e.target.value)}
                                            placeholder={t('settings.email.passwordPlaceholder')}
                                            autoComplete="new-password"
                                        />
                                        {settings.hasPassword && (
                                            <button type="button" onClick={() => { setChangingPassword(false); setSmtpPasswordInput('') }} className="text-xs text-slate-500 hover:underline">
                                                {t('common.cancel')}
                                            </button>
                                        )}
                                    </div>
                                )}
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.email.passwordHelp')}</p>
                            </div>

                            <FormField id="smtp-from-address" label={t('settings.email.fromAddress')} type="email" name="smtpFromAddress" value={settings.smtpFromAddress || ''} onChange={handleSettingsChange} placeholder="sales@example.com" />
                            <FormField id="smtp-from-name" label={t('settings.email.fromName')} name="smtpFromName" value={settings.smtpFromName || ''} onChange={handleSettingsChange} placeholder={t('settings.email.fromNamePlaceholder')} />
                        </div>

                        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">{t('settings.email.fromHelp')}</p>

                        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                            <span className="font-medium text-slate-700 dark:text-slate-200">{t('settings.email.useTls')}</span>
                            <Checkbox name="smtpUseTls" checked={settings.smtpUseTls !== false} onChange={handleSettingsChange} />
                        </label>

                        <SaveBar saving={saving} label={t('settings.save')} savingLabel={t('common.saving')} />

                        {/* Test send */}
                        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {t('settings.email.testHeading')}
                            </h3>
                            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('settings.email.testHint')}</p>
                            <div className="flex flex-wrap items-end gap-3">
                                <FormField
                                    id="test-recipient"
                                    label={t('settings.email.testRecipient')}
                                    type="email"
                                    name="testRecipient"
                                    value={testRecipient}
                                    onChange={(e) => setTestRecipient(e.target.value)}
                                    placeholder="you@example.com"
                                    className="flex-1 min-w-[16rem]"
                                />
                                <button
                                    type="button"
                                    onClick={sendTestEmail}
                                    disabled={testing || !settings.smtpConfigured}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                                >
                                    <Send className="h-4 w-4" /> {testing ? t('settings.email.testSending') : t('settings.email.testSend')}
                                </button>
                            </div>
                            {!settings.smtpConfigured && (
                                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{t('settings.email.notConfiguredHint')}</p>
                            )}
                        </div>
                    </form>

                    <EmailTemplatesManager />
                </div>
            )}

            {/* Defaults */}
            {tab === 'defaults' && (
                <div className="space-y-6">
                    <form onSubmit={saveSettings} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t('settings.defaults.productHeading')}
                        </h3>
                        <div className="grid gap-4 md:grid-cols-2">
                            <UnitSelect
                                id="default-unit"
                                label={t('settings.defaults.productUnit')}
                                name="defaultProductUnit"
                                value={settings.defaultProductUnit || ''}
                                onChange={handleSettingsChange}
                            />
                            <FormField
                                id="default-min-stock"
                                label={t('settings.defaults.minimumStock')}
                                type="number"
                                name="defaultMinimumStock"
                                value={settings.defaultMinimumStock ?? ''}
                                onChange={handleSettingsChange}
                                min={0}
                            />
                        </div>

                        {/* What new records are numbered with. Both prefixes live together so the two
                            schemes are set side by side rather than in different tabs. */}
                        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {t('settings.defaults.numberingHeading')}
                            </h3>
                            <div className="grid gap-4 md:grid-cols-2">
                                <FormField
                                    id="invoice-prefix"
                                    label={t('settings.defaults.invoicePrefix')}
                                    name="invoiceNumberPrefix"
                                    value={settings.invoiceNumberPrefix || ''}
                                    onChange={handleSettingsChange}
                                    placeholder="INV-"
                                />
                                <FormField
                                    id="tender-prefix"
                                    label={t('settings.defaults.tenderPrefix')}
                                    name="tenderNumberPrefix"
                                    value={settings.tenderNumberPrefix || ''}
                                    onChange={handleSettingsChange}
                                    placeholder="TND-"
                                />
                            </div>
                        </div>

                        {/* What new orders and new user accounts start with. */}
                        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {t('settings.defaults.recordsHeading')}
                            </h3>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-1">
                                    <FormSelect
                                        id="default-warehouse"
                                        label={t('settings.defaults.defaultWarehouse')}
                                        name="defaultWarehouseId"
                                        value={settings.defaultWarehouseId ? String(settings.defaultWarehouseId) : ''}
                                        onChange={handleSettingsChange}
                                        placeholder={t('settings.defaults.noDefaultWarehouse')}
                                        options={[
                                            { value: '', label: t('settings.defaults.noDefaultWarehouse') },
                                            ...warehouses.map((w) => ({ value: String(w.id), label: w.name })),
                                        ]}
                                    />
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.defaults.defaultWarehouseHint')}</p>
                                </div>
                                <div className="space-y-1">
                                    <FormSelect
                                        id="default-user-language"
                                        label={t('settings.defaults.userLanguage')}
                                        name="defaultUserLanguage"
                                        value={settings.defaultUserLanguage || 'en'}
                                        onChange={handleSettingsChange}
                                        options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                                    />
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.defaults.userLanguageHint')}</p>
                                </div>
                            </div>
                        </div>

                        <SaveBar saving={saving} label={t('settings.save')} savingLabel={t('common.saving')} />
                    </form>

                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                        <div>
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {t('settings.defaults.permsHeading')}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.defaults.permsIntro')}</p>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900">
                                        <th className="px-4 py-3 font-semibold">{t('users.perm.area')}</th>
                                        {PERMISSION_ACTIONS.map((action) => (
                                            <th key={action.key} className="px-4 py-3 text-center font-semibold">{t(action.labelKey)}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {permRows.map((row) => {
                                        const meta = PERMISSION_MODULES.find((m) => m.module === row.module)
                                        const label = meta ? t(`nav.${meta.navKey}`) : row.module
                                        // Emails is a single on/off capability, not a CRUD row.
                                        if (row.module === 'MANUFACTURER_EMAILS') {
                                            return (
                                                <tr key={row.module} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                                    <td className="px-4 py-3 font-medium">{label}</td>
                                                    <td colSpan={PERMISSION_ACTIONS.length} className="px-4 py-3 text-center">
                                                        <label className="inline-flex items-center gap-2">
                                                            <Checkbox checked={!!row.canCreate} onChange={(e) => toggleEmailAccess(row.module, e.target.checked)} />
                                                            <span className="text-sm text-slate-600 dark:text-slate-300">{t('users.perm.emailAccess')}</span>
                                                        </label>
                                                    </td>
                                                </tr>
                                            )
                                        }
                                        return (
                                            <tr key={row.module} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                                <td className="px-4 py-3 font-medium">{label}</td>
                                                {PERMISSION_ACTIONS.map((action) => (
                                                    <td key={action.key} className="px-4 py-3 text-center">
                                                        <Checkbox checked={!!row[action.key]} onChange={(e) => togglePerm(row.module, action.key, e.target.checked)} />
                                                    </td>
                                                ))}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={savePermissions}
                                disabled={saving}
                                className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                            >
                                {saving ? t('common.saving') : t('settings.defaults.savePerms')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Plan & Billing */}
            {/* Company: who the business is. Identity lives on the Company record, the contact/bank/logo
                details on CompanySettings — one Save covers both. */}
            {tab === 'company' && (
                <div className="space-y-6">
                    <form onSubmit={saveCompanyTab} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                        <div>
                            <h2 className="text-base font-semibold">{t('settings.company.heading')}</h2>
                            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('settings.company.description')}</p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                id="company-name"
                                label={t('settings.company.name')}
                                name="name"
                                value={companyProfile.name || ''}
                                onChange={(e) => setCompanyProfile((p) => ({ ...p, name: e.target.value }))}
                                required
                            />
                            <FormField
                                id="company-registration-code"
                                label={t('settings.company.registrationCode')}
                                name="registrationCode"
                                value={companyProfile.registrationCode || ''}
                                onChange={(e) => setCompanyProfile((p) => ({ ...p, registrationCode: e.target.value }))}
                                placeholder={t('common.optional')}
                            />
                        </div>

                        {/* Chosen at signup and fixed for good — the server enforces the separation, so
                            this is reported rather than edited. */}
                        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                                {t('settings.company.accountType')}
                            </span>
                            <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">
                                {companyProfile.type === 'WAREHOUSE'
                                    ? t('settings.company.accountTypeWarehouse')
                                    : t('settings.company.accountTypeBusiness')}
                            </span>
                            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                                {t('settings.company.accountTypeHint')}
                            </span>
                        </div>

                        {/* Address, VAT number, bank and logo exist to be printed on an invoice, and the
                            export is of business data. A warehouse account issues no invoices and owns no
                            such data, so none of this describes anything it has. */}
                        {!isWarehouseAccount && (
                        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {t('settings.company.contactHeading')}
                            </h3>
                            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{t('settings.company.contactHint')}</p>

                            <div className="mb-4 flex items-center gap-4">
                                <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                                    {settings.logoKey ? (
                                        <img src={logoUrl} alt={t('settings.company.logo')} className="max-h-full max-w-full object-contain" />
                                    ) : (
                                        <span className="text-xs text-slate-400">{t('settings.company.noLogo')}</span>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <input
                                        ref={logoInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => uploadLogo(e.target.files?.[0])}
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => logoInputRef.current?.click()}
                                        disabled={logoUploading}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                                    >
                                        <UploadCloud className="h-4 w-4" /> {logoUploading ? t('common.saving') : t('settings.company.uploadLogo')}
                                    </button>
                                    {settings.logoKey && (
                                        <button
                                            type="button"
                                            onClick={() => setSettings((prev) => ({ ...prev, logoKey: '' }))}
                                            className="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600"
                                        >
                                            <X className="h-3 w-3" /> {t('settings.company.removeLogo')}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <AddressAutocompleteField id="company-address" label={t('settings.company.address')} name="companyAddress" value={settings.companyAddress || ''} onChange={handleSettingsChange} />
                                <FormField id="vat-number" label={t('settings.company.vatNumber')} name="vatNumber" value={settings.vatNumber || ''} onChange={handleSettingsChange} />
                                <FormField id="company-email" label={t('settings.company.email')} type="email" name="companyEmail" value={settings.companyEmail || ''} onChange={handleSettingsChange} />
                                <FormField id="company-phone" label={t('settings.company.phone')} name="companyPhone" value={settings.companyPhone || ''} onChange={handleSettingsChange} />
                                <FormField id="bank-name" label={t('settings.company.bankName')} name="bankName" value={settings.bankName || ''} onChange={handleSettingsChange} />
                                <FormField id="bank-iban" label={t('settings.company.bankIban')} name="bankIban" value={settings.bankIban || ''} onChange={handleSettingsChange} />
                            </div>
                        </div>
                        )}

                        <SaveBar saving={saving} label={t('settings.save')} savingLabel={t('common.saving')} />
                    </form>

                    {!isWarehouseAccount && <CompanyDataExport />}
                </div>
            )}

            {tab === 'connections' && <ConnectionsTab />}

            {tab === 'plan' && <PlanBillingTab />}

            {/* Tax rate create/edit modal */}
            <Modal
                isOpen={taxModal.isOpen}
                title={editingTaxId ? t('settings.tax.editTitle') : t('settings.tax.addTitle')}
                onClose={taxModal.close}
                width="max-w-lg"
            >
                <form onSubmit={saveTax} className="grid gap-4">
                    <FormField
                        id="tax-name"
                        label={t('common.name')}
                        name="name"
                        value={taxForm.name}
                        onChange={handleTaxChange}
                        required
                        placeholder={t('settings.tax.namePlaceholder')}
                    />
                    <FormField
                        id="tax-percentage"
                        label={t('settings.tax.rate')}
                        type="number"
                        step="0.001"
                        name="percentage"
                        value={taxForm.percentage}
                        onChange={handleTaxChange}
                        required
                        min={0}
                        max={100}
                        placeholder="20"
                    />
                    <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                        <Checkbox name="isDefault" checked={!!taxForm.isDefault} onChange={handleTaxChange} />
                        <span className="font-medium text-slate-700 dark:text-slate-200">{t('settings.tax.makeDefault')}</span>
                    </label>
                    {/* Active is only meaningful once a rate exists — a new tax rate is created active. */}
                    {editingTaxId && (
                        <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                            <Checkbox name="active" checked={!!taxForm.active} onChange={handleTaxChange} />
                            <span className="font-medium text-slate-700 dark:text-slate-200">{t('common.active')}</span>
                        </label>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={taxModal.close} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={saving} className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                            {saving ? t('common.saving') : t('common.save')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteTaxModal.isOpen}
                title={t('settings.tax.deleteTitle')}
                message={t('settings.tax.deleteConfirm', { name: deletingTax?.name || '' })}
                onClose={deleteTaxModal.close}
                onConfirm={handleDeleteTax}
                loading={saving}
            />
        </div>
    )
}

/** A small SVG thumbnail that sketches each invoice layout, tinted with the chosen accent colour. */
function InvoiceTemplateThumb({ template, accent }) {
    const line = (y, w) => <rect x="8" y={y} width={w} height="3" rx="1.5" fill="#cbd5e1" />
    return (
        <svg viewBox="0 0 100 70" className="h-16 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" role="img">
            {template === 'MODERN' && (
                <>
                    <rect x="0" y="0" width="100" height="18" fill={accent} />
                    <rect x="8" y="6" width="22" height="6" rx="1.5" fill="#ffffff" />
                    <rect x="70" y="6" width="22" height="6" rx="1.5" fill="#ffffff" opacity="0.85" />
                    <rect x="8" y="26" width="84" height="6" fill={accent} opacity="0.9" />
                    {line(38, 84)}{line(45, 84)}{line(52, 60)}
                    <rect x="62" y="59" width="30" height="6" fill={accent} />
                </>
            )}
            {template === 'MINIMAL' && (
                <>
                    <rect x="8" y="8" width="30" height="5" rx="1" fill="#475569" />
                    <rect x="8" y="16" width="40" height="2" fill={accent} />
                    {line(30, 84)}{line(37, 84)}{line(44, 84)}{line(51, 60)}
                    <rect x="8" y="60" width="84" height="1.5" fill={accent} />
                </>
            )}
            {template === 'CLASSIC' && (
                <>
                    <rect x="8" y="7" width="24" height="7" rx="1.5" fill="#cbd5e1" />
                    <rect x="66" y="7" width="26" height="7" rx="1.5" fill={accent} />
                    <rect x="8" y="26" width="84" height="6" fill="#e2e8f0" />
                    {line(38, 84)}{line(45, 84)}{line(52, 60)}
                    <rect x="62" y="59" width="30" height="2" fill={accent} />
                </>
            )}
        </svg>
    )
}

function SaveBar({ saving, label, savingLabel }) {
    return (
        <div className="flex justify-end">
            <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
            >
                {saving ? savingLabel : label}
            </button>
        </div>
    )
}
