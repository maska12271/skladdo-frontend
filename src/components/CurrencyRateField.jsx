import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { apiGet } from '../api/client'
import { FormSelect } from './FormField.jsx'

/**
 * Currency picker plus, when the chosen currency differs from the company base, an editable exchange-rate
 * input read as "1 {base} = [rate] {currency}". Picking a currency fetches a suggested rate from the
 * backend (ECB, else the company's last-used rate, else 0); editing the rate marks it manual. An info icon
 * explains, on hover, where the shown rate came from.
 *
 * Controlled: `value` is { currency, exchangeRate, source, asOfDate } and every change emits the full
 * shape via `onChange` (the parent stores it; only currency + exchangeRate need to go into the payload).
 */
export default function CurrencyRateField({
    value,
    onChange,
    baseCurrency = 'EUR',
    currencies = [],
    className = '',
}) {
    const { t } = useTranslation()
    const base = (baseCurrency || 'EUR').toUpperCase()
    const currency = value?.currency || base
    const isBase = currency.toUpperCase() === base
    const source = value?.source
    const asOfDate = value?.asOfDate

    const options = (currencies.length ? currencies : [{ code: base, name: base }])
        .map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))

    const pickCurrency = async (code) => {
        const next = (code || base).toUpperCase()
        if (next === base) {
            onChange({ currency: next, exchangeRate: 1, source: 'SAME', asOfDate: null })
            return
        }
        try {
            const q = await apiGet(`/exchange-rates/quote?currency=${encodeURIComponent(next)}`)
            onChange({
                currency: next,
                exchangeRate: q?.rate ?? 0,
                source: q?.source || 'NONE',
                asOfDate: q?.asOfDate || null,
            })
        } catch {
            onChange({ currency: next, exchangeRate: 0, source: 'NONE', asOfDate: null })
        }
    }

    const editRate = (v) => onChange({ currency, exchangeRate: v, source: 'MANUAL', asOfDate: null })

    const hint = () => {
        switch (source) {
            case 'ECB': return t('currency.rateHint.ecb', { date: asOfDate || '' })
            case 'LAST_USED': return t('currency.rateHint.lastUsed', { date: asOfDate || '' })
            case 'MANUAL': return t('currency.rateHint.manual')
            case 'SAVED': return t('currency.rateHint.saved')
            default: return t('currency.rateHint.none')
        }
    }

    return (
        <div className={className}>
            <FormSelect
                id="currency-select"
                label={t('common.currency')}
                name="currency"
                value={currency}
                onChange={(e) => pickCurrency(e.target.value)}
                options={options}
            />

            {!isBase && (
                <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5">
                        <label htmlFor="exchange-rate" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {t('currency.rateLabel')}
                        </label>
                        <span title={hint()} aria-label={hint()} className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                            <Info className="h-4 w-4" />
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">1 {base} =</span>
                        <input
                            id="exchange-rate"
                            type="number"
                            step="0.000001"
                            min="0"
                            value={value?.exchangeRate ?? ''}
                            onChange={(e) => editRate(e.target.value)}
                            className="w-40 rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-950"
                        />
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{currency}</span>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{hint()}</p>
                </div>
            )}
        </div>
    )
}
