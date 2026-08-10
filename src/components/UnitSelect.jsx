import { useTranslation } from 'react-i18next'
import { FormSelect } from './FormField.jsx'
import { buildUnitOptions } from '../constants/units'

/**
 * A unit picker backed by {@link FormSelect}: choose from the common units, or type a custom one via the
 * "create" action (units remain free-text). Emits a native-shaped `onChange` ({ target: { name, value } })
 * so existing form handlers keep working. Pass `allowEmpty` for optional units (adds a clear "—" option).
 */
export default function UnitSelect({
    id,
    label,
    name,
    value,
    onChange,
    required = false,
    allowEmpty = false,
    className = '',
    placeholder,
}) {
    const { t } = useTranslation()
    return (
        <FormSelect
            id={id}
            label={label ?? t('common.unit')}
            name={name}
            value={value || ''}
            onChange={onChange}
            required={required}
            searchable
            className={className}
            placeholder={placeholder ?? t('common.selectUnit')}
            options={buildUnitOptions(value, { allowEmpty })}
            onQuickCreate={(custom) => onChange({ target: { name, value: (custom || '').trim() } })}
        />
    )
}
