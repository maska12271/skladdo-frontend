import { formatMoney, toCompanyAmount } from '../utils/format'

/**
 * Shows a money amount in its own currency and, when that differs from the company base currency, the
 * company-currency equivalent underneath (derived from the record's snapshotted exchange rate). Used in
 * list/detail views so a foreign-currency order reads as e.g. "$1,200.00 / ≈ €1,090.91".
 */
export default function MoneyWithBase({ amount, currency, exchangeRate, base }) {
    const original = formatMoney(amount, currency)
    const showBase = currency && base && currency.toUpperCase() !== base.toUpperCase()
    const baseAmount = showBase ? toCompanyAmount(amount, exchangeRate) : null
    if (baseAmount == null) {
        return <span>{original}</span>
    }
    return (
        <span>
            {original}
            <span className="block text-xs text-slate-400 dark:text-slate-500">{formatMoney(baseAmount, base)}</span>
        </span>
    )
}
