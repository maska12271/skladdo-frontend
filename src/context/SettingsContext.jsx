import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiGet } from '../api/client'
import { useAuth } from './AuthContext'
import { setDateTimeFormats } from '../utils/format'

const SettingsContext = createContext(null)

const DEFAULTS = {
    currency: 'EUR',
    pricesIncludeTax: false,
    defaultTaxPercent: 0,
    defaultWarehouseId: null,
    defaultPrepaymentPercent: 0,
    invoicePaymentTermDays: 14,
    latePaymentPenaltyPercent: 0,
    penaltyPeriod: 'DAILY',
    // ISO day the week starts on (1 = Monday ... 7 = Sunday); null means follow the viewer's locale.
    firstDayOfWeek: null,
    // Date/time patterns; null means follow the viewer's language.
    dateFormat: null,
    timeFormat: null,
    // Unit a new product or line starts on.
    defaultProductUnit: 'pcs',
}

/**
 * Loads the company's display settings (currency, tax-inclusive preference, default tax rate) once a
 * user is authenticated, and exposes a currency-aware price formatter. These are read-only and
 * available to every role, so non-admin pages (e.g. the product catalogue) can render prices the way
 * the company prefers. Admins edit the underlying settings on the Settings page; `refresh()` lets that
 * page push changes here without a full reload.
 */
export function SettingsProvider({ children }) {
    const { isAuthenticated } = useAuth()
    const [settings, setSettings] = useState(DEFAULTS)
    // The currencies this deployment offers (code/symbol/name/decimals), for pickers. Loaded once.
    const [currencies, setCurrencies] = useState([])

    const refresh = useCallback(async () => {
        try {
            const fresh = await apiGet('/settings/display')
            if (fresh) {
                setSettings({
                    currency: fresh.currency || 'EUR',
                    pricesIncludeTax: !!fresh.pricesIncludeTax,
                    defaultTaxPercent: Number(fresh.defaultTaxPercent) || 0,
                    defaultWarehouseId: fresh.defaultWarehouseId ?? null,
                    defaultPrepaymentPercent: Number(fresh.defaultPrepaymentPercent) || 0,
                    invoicePaymentTermDays: fresh.invoicePaymentTermDays ?? 14,
                    latePaymentPenaltyPercent: Number(fresh.latePaymentPenaltyPercent) || 0,
                    penaltyPeriod: fresh.penaltyPeriod || 'DAILY',
                    // `?? null` rather than `|| null`: the API sends a number, and coercing a falsy-but-
                    // valid value would be wrong here if the range ever starts at 0.
                    firstDayOfWeek: fresh.firstDayOfWeek ?? null,
                    dateFormat: fresh.dateFormat ?? null,
                    timeFormat: fresh.timeFormat ?? null,
                    defaultProductUnit: fresh.defaultProductUnit || 'pcs',
                })
                // Pushed into the formatting module rather than read from this context: the ~100 call
                // sites for formatDate/formatDateTime are plain functions in tables and detail rows, and
                // this is what lets them all honour the setting without being rewritten as hooks.
                setDateTimeFormats(fresh.dateFormat ?? null, fresh.timeFormat ?? null)
            }
        } catch {
            /* Fall back to defaults; a transient failure shouldn't block the app. */
        }
    }, [])

    useEffect(() => {
        if (!isAuthenticated) {
            setSettings(DEFAULTS)
            setCurrencies([])
            // Cleared on sign-out so the next company in this tab does not inherit the last one's formats.
            setDateTimeFormats(null, null)
            return
        }
        refresh()
        apiGet('/currencies')
            .then((list) => setCurrencies(Array.isArray(list) ? list : []))
            .catch(() => { /* pickers fall back to a plain code input if the list is unavailable */ })
    }, [isAuthenticated, refresh])

    const value = useMemo(() => {
        const { currency, pricesIncludeTax, defaultTaxPercent, defaultWarehouseId, defaultPrepaymentPercent, invoicePaymentTermDays, latePaymentPenaltyPercent, penaltyPeriod, firstDayOfWeek, dateFormat, timeFormat, defaultProductUnit } = settings

        // The tax percentage that applies to a value: an explicit rate, else the company default.
        const effectiveTaxPercent = (taxPercent) =>
            taxPercent == null || Number.isNaN(Number(taxPercent)) ? defaultTaxPercent : Number(taxPercent)

        // Formats an amount in a given currency, defaulting to the company base currency. Pass a record's
        // own currency (e.g. an order's) to render foreign-currency amounts correctly. Fraction digits
        // follow the currency (e.g. 0 for JPY) via Intl.
        const formatCurrency = (amount, currencyOverride) =>
            new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: (currencyOverride || currency || 'EUR').toUpperCase(),
            }).format(Number(amount || 0))

        // Net price formatted in a currency (base unless overridden), made tax-inclusive when the
        // company preference is on.
        const formatPrice = (netPrice, taxPercent, currencyOverride) => {
            const net = Number(netPrice || 0)
            const gross = pricesIncludeTax ? net * (1 + effectiveTaxPercent(taxPercent) / 100) : net
            return formatCurrency(gross, currencyOverride)
        }

        // Short symbol for a currency code (e.g. "€", "$"), for labelling money inputs. Defaults to the
        // company base currency and falls back to the code itself when the catalogue has no symbol.
        const currencySymbol = (code) => {
            const wanted = (code || currency || 'EUR').toUpperCase()
            const match = currencies.find((c) => (c.code || '').toUpperCase() === wanted)
            return match?.symbol || wanted
        }

        return {
            currency,
            currencies,
            pricesIncludeTax,
            defaultTaxPercent,
            defaultWarehouseId,
            defaultPrepaymentPercent,
            invoicePaymentTermDays,
            latePaymentPenaltyPercent,
            penaltyPeriod,
            firstDayOfWeek,
            dateFormat,
            timeFormat,
            defaultProductUnit,
            effectiveTaxPercent,
            formatCurrency,
            formatPrice,
            currencySymbol,
            refresh,
        }
    }, [settings, currencies, refresh])

    return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
    return useContext(SettingsContext)
}
