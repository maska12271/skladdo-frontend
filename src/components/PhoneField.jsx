import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CustomSelect from './CustomSelect'
import { buildDialOptions, dialCodeFor, joinPhone, splitPhone } from '../data/dialCodes'

/**
 * Phone input with a dialling-code picker beside it.
 *
 * Emits the same `{ target: { name, value } }` event as a plain `FormField` and stores one string
 * (`"+372 5123456"`), so nothing on the server or in the export/import schema had to change to accept it.
 *
 * `country` is the country already chosen on the same record. When it changes, the code follows it —
 * but only while the field is untouched: once someone has picked a code themselves, or typed a number
 * under one, changing the country must not quietly re-route their phone number to a different country.
 * That is the whole point of the control being a picker rather than a derived label.
 */
export default function PhoneField({
    id,
    label,
    name,
    value,
    onChange,
    country,
    placeholder = '',
    required = false,
    className = '',
}) {
    const { t } = useTranslation()
    const { code: storedCode, number } = splitPhone(value)

    // The code the user reached for, if they did. Only ever consulted when the stored value has none of
    // its own, which happens while the number box is still empty - `joinPhone` refuses to store a bare
    // dialling code, since "+372" on its own is not a phone number anyone could ring.
    const [pickedCode, setPickedCode] = useState(null)

    // Derived rather than synchronised, in this order of authority: what is stored beats what was picked,
    // which beats what the record's country implies. That last fallback is what makes choosing a country
    // fill the code in straight away, and the two above it are why choosing a country later cannot take a
    // code back off someone who has already set one.
    const code = storedCode || pickedCode || dialCodeFor(country)
    const options = buildDialOptions(code)

    const emit = (nextCode, nextNumber) =>
        onChange({ target: { name, value: joinPhone(nextCode, nextNumber) } })

    const pickCode = (nextCode) => {
        setPickedCode(nextCode)
        emit(nextCode, number)
    }

    const typeNumber = (event) => {
        // Pasting a full international number should fill both halves rather than land verbatim in the
        // national box - people paste "+372 5123456" out of a signature all the time.
        const typed = event.target.value
        if (typed.trim().startsWith('+')) {
            const parsed = splitPhone(typed)
            if (parsed.code) {
                setPickedCode(parsed.code)
                emit(parsed.code, parsed.number)
                return
            }
        }
        emit(code, typed)
    }

    return (
        <div className={`space-y-2 ${className}`}>
            <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {label}
                {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
            </label>
            <div className="flex gap-2">
                <div className="w-36 shrink-0">
                    <CustomSelect
                        options={options}
                        value={code || ''}
                        searchable
                        placeholder={t('phone.code')}
                        ariaLabel={t('phone.code')}
                        onChange={pickCode}
                    />
                </div>
                <input
                    id={id}
                    name={name}
                    type="tel"
                    inputMode="tel"
                    value={number}
                    onChange={typeNumber}
                    required={required}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 transition-colors placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-950 dark:placeholder:text-slate-500"
                />
            </div>
        </div>
    )
}
