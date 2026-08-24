import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { apiGet, apiPost } from '../api/client'
import { FormField, FormSelect } from './FormField'
import CountrySelectField from './CountrySelectField'
import { useFrequentCountries } from '../hooks/useFrequentCountries'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../context/SettingsContext'
import { safeArray } from '../utils/format'
import { X } from 'lucide-react'
import { OVERLAY_BACKDROP } from '../constants/overlay'

// `createdKey` points at the matching list page's "<entity> created" toast.
const CONFIGS = {
    category: {
        titleKey: 'quickCreate.category',
        createdKey: 'categories.created',
        endpoint: '/categories',
        toPayload: (f) => ({ name: f.name, description: f.description || '' }),
    },
    service: {
        titleKey: 'quickCreate.service',
        createdKey: 'services.created',
        endpoint: '/services',
        // No manufacturer, no stock and no category requirement - a service has none of them.
        toPayload: (f) => ({
            name: f.name,
            code: f.code || '',
            price: Number(f.price || 0),
            category: f.categoryId ? { id: Number(f.categoryId) } : null,
            active: true,
        }),
    },
    serviceCategory: {
        titleKey: 'quickCreate.serviceCategory',
        createdKey: 'serviceCategories.created',
        endpoint: '/service-categories',
        toPayload: (f) => ({ name: f.name, description: f.description || '' }),
    },
    partnerCategory: {
        titleKey: 'quickCreate.partnerCategory',
        createdKey: 'partnerCategories.created',
        endpoint: '/partner-categories',
        toPayload: (f) => ({ name: f.name, description: f.description || '', active: true }),
    },
    manufacturer: {
        titleKey: 'quickCreate.manufacturer',
        createdKey: 'manufacturers.created',
        endpoint: '/manufacturers',
        toPayload: (f) => ({ name: f.name, country: f.country || '', contactEmail: f.contactEmail || '' }),
    },
    client: {
        titleKey: 'quickCreate.client',
        createdKey: 'clients.created',
        endpoint: '/clients',
        toPayload: (f) => ({ name: f.name, country: f.country || '', email: f.email || '', phone: f.phone || '', active: true }),
    },
    product: {
        titleKey: 'quickCreate.product',
        createdKey: 'products.created',
        endpoint: '/products',
        toPayload: (f) => ({
            name: f.name,
            sku: f.sku || '',
            unit: f.unit || '',
            price: Number(f.price || 0),
            manufacturer: { id: Number(f.manufacturerId) },
            category: { id: Number(f.categoryId) },
            stockQuantity: 0,
            minimumStock: 0,
            active: true,
        }),
    },
}

export default function QuickCreateModal({ type, initialName = '', isOpen, onClose, onCreated }) {
    const { t } = useTranslation()
    const toast = useToast()
    const { currencySymbol } = useSettings()
    const config = CONFIGS[type]
    const [form, setForm] = useState({ name: '' })
    const [categories, setCategories] = useState([])
    const [manufacturers, setManufacturers] = useState([])
    const [loading, setLoading] = useState(false)
    // Only the manufacturer/client quick-creates show a country field; skip the fetch otherwise.
    const frequentCountries = useFrequentCountries(
        isOpen && (type === 'manufacturer' || type === 'client') ? `${type}s` : null,
    )

    useEffect(() => {
        if (!isOpen) return
        setForm({ name: initialName })
        if (type === 'product') {
            Promise.all([
                apiGet('/categories?page=0&size=500&sortBy=name&sortDir=asc'),
                apiGet('/manufacturers?page=0&size=500&sortBy=name&sortDir=asc'),
            ]).then(([cats, mfrs]) => {
                setCategories(safeArray(cats))
                setManufacturers(safeArray(mfrs))
            })
        }
        if (type === 'service') {
            // Its own taxonomy, and optional here - a service can be created without one.
            apiGet('/service-categories?page=0&size=500&sortBy=name&sortDir=asc')
                .then((cats) => setCategories(safeArray(cats)))
                .catch(() => setCategories([]))
        }
    }, [isOpen, initialName, type])

    // Intercept Escape in capture phase so parent modal doesn't also close
    useEffect(() => {
        if (!isOpen) return
        const handler = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
            }
        }
        document.addEventListener('keydown', handler, true)
        return () => document.removeEventListener('keydown', handler, true)
    }, [isOpen, onClose])

    const handleChange = (e) => {
        const { name, value } = e.target
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            const result = await apiPost(config.endpoint, config.toPayload(form))
            toast.success(t(config.createdKey))
            onCreated({ value: String(result.id), label: result.name, raw: result })
            onClose()
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen || !config) return null

    return (
        <div className={`fixed inset-0 z-[60] flex items-center justify-center p-4 ${OVERLAY_BACKDROP}`}>
            <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
                    <h2 className="text-lg font-semibold">{t(config.titleKey)}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 p-6">
                    <FormField
                        id="qc-name"
                        label={t('common.name')}
                        name="name"
                        value={form.name || ''}
                        onChange={handleChange}
                        required
                        placeholder={t('common.name')}
                        autoFocus
                    />

                    {(type === 'category' || type === 'partnerCategory') && (
                        <FormField
                            id="qc-description"
                            label={t('common.description')}
                            name="description"
                            value={form.description || ''}
                            onChange={handleChange}
                            placeholder={t('common.optional')}
                        />
                    )}

                    {type === 'manufacturer' && (
                        <>
                            <CountrySelectField id="qc-country" label={t('common.country')} name="country" value={form.country || ''} onChange={handleChange} frequentCountries={frequentCountries} placeholder={t('common.optional')} />
                            <FormField id="qc-contact-email" label={t('quickCreate.contactEmail')} name="contactEmail" type="email" value={form.contactEmail || ''} onChange={handleChange} placeholder={t('common.optional')} />
                        </>
                    )}

                    {type === 'client' && (
                        <>
                            <CountrySelectField id="qc-country" label={t('common.country')} name="country" value={form.country || ''} onChange={handleChange} frequentCountries={frequentCountries} placeholder={t('common.optional')} />
                            <FormField id="qc-email" label={t('common.email')} name="email" type="email" value={form.email || ''} onChange={handleChange} placeholder={t('common.optional')} />
                            <FormField id="qc-phone" label={t('common.phone')} name="phone" value={form.phone || ''} onChange={handleChange} placeholder={t('common.optional')} />
                        </>
                    )}

                    {type === 'product' && (
                        <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <FormField id="qc-sku" label={t('common.sku')} name="sku" value={form.sku || ''} onChange={handleChange} placeholder={t('common.optional')} />
                                <FormField id="qc-unit" label={t('common.unit')} name="unit" value={form.unit || ''} onChange={handleChange} placeholder={t('quickCreate.unitPlaceholder')} />
                            </div>
                            <FormField id="qc-price" label={`${t('common.price')} (${currencySymbol()})`} name="price" type="number" step="0.01" value={form.price || ''} onChange={handleChange} required placeholder="0.00" />
                            <FormSelect
                                id="qc-category"
                                label={t('nav.categories')}
                                name="categoryId"
                                value={form.categoryId || ''}
                                onChange={handleChange}
                                required
                                searchable
                                placeholder={t('quickCreate.selectCategory')}
                                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                            />
                            <FormSelect
                                id="qc-manufacturer"
                                label={t('nav.manufacturers')}
                                name="manufacturerId"
                                value={form.manufacturerId || ''}
                                onChange={handleChange}
                                required
                                searchable
                                placeholder={t('quickCreate.selectManufacturer')}
                                options={manufacturers.map((m) => ({ value: String(m.id), label: m.name }))}
                            />
                        </>
                    )}

                    {type === 'service' && (
                        <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <FormField id="qc-code" label={t('common.code')} name="code" value={form.code || ''} onChange={handleChange} placeholder={t('common.optional')} />
                                <FormField id="qc-price" label={`${t('common.price')} (${currencySymbol()})`} name="price" type="number" step="0.01" value={form.price || ''} onChange={handleChange} required placeholder="0.00" />
                            </div>
                            <FormSelect
                                id="qc-service-category"
                                label={t('nav.serviceCategories')}
                                name="categoryId"
                                value={form.categoryId || ''}
                                onChange={handleChange}
                                searchable
                                placeholder={t('common.optional')}
                                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                            />
                        </>
                    )}

                    <div className="flex justify-end gap-3 pt-1">
                        <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={loading} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                            {loading ? t('common.creating') : t('common.create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
