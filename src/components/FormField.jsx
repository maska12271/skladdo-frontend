import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import CustomSelect from "./CustomSelect";

/** Field label with a red asterisk appended when the field is required. */
function FieldLabel({ id, label, required }) {
    return (
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {label}
            {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        </label>
    );
}

/**
 * Form select backed by {@link CustomSelect}. Emits an `onChange` shaped like a native event
 * (`{ target: { name, value } }`) so existing form handlers keep working unchanged. Pass
 * `searchable` for long lists (products, clients, manufacturers). `options` is `[{ value, label }]`.
 */
export function FormSelect({
                               id,
                               label,
                               name,
                               value,
                               onChange,
                               options = [],
                               placeholder = "Select...",
                               required = false,
                               searchable = false,
                               className = "",
                               onQuickCreate,
                               quickCreateActions,
                           }) {
    return (
        <div className={`space-y-2 ${className}`}>
            <FieldLabel id={id} label={label} required={required} />
            {/* The control and its validation proxy share a wrapper so the proxy is not a `space-y-2`
                sibling. As one it picked up the stack's margin and left ~8px of dead space under every
                required field - enough to push a delete button laid out beside it out of line. It has to
                stay rendered (a display:none input is exempt from constraint validation), so it is kept
                out of the flow here instead. */}
            <div className="relative">
                <CustomSelect
                    id={id}
                    options={options}
                    value={value}
                    searchable={searchable}
                    placeholder={placeholder}
                    ariaLabel={typeof label === "string" ? label : undefined}
                    onChange={(val) => onChange({ target: { name, value: val } })}
                    onQuickCreate={onQuickCreate}
                    quickCreateActions={quickCreateActions}
                />
                {required && (
                    <input
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                        required
                        value={value ?? ""}
                        onChange={() => {}}
                    />
                )}
            </div>
        </div>
    );
}

export function FormField({
                              id,
                              label,
                              name,
                              value,
                              onChange,
                              type = "text",
                              placeholder = "",
                              required = false,
                              className = "",
                              inputClassName = "",
                              ...props
                          }) {
    return (
        <div className={`space-y-2 ${className}`}>
            <FieldLabel id={id} label={label} required={required} />
            <PasswordAwareInput
                id={id}
                name={name}
                type={type}
                value={value}
                onChange={onChange}
                required={required}
                placeholder={placeholder}
                inputClassName={inputClassName}
                {...props}
            />
        </div>
    );
}

/**
 * A text input that, for `type="password"`, adds a show/hide toggle button. Used by {@link FormField}
 * so every password field across the app gets the reveal control for free. Pass `showToggle={false}` to
 * suppress the built-in button when an external control drives the field's `type` (e.g. one toggle
 * revealing several password fields at once).
 */
export function PasswordAwareInput({ type = "text", inputClassName = "", showToggle = true, ...props }) {
    const { t } = useTranslation();
    const [reveal, setReveal] = useState(false);
    const withToggle = type === "password" && showToggle;
    const effectiveType = withToggle && reveal ? "text" : type;

    const input = (
        <input
            type={effectiveType}
            className={`w-full rounded-xl border border-slate-300 px-4 py-2.5 transition-colors placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-950 dark:placeholder:text-slate-500 ${withToggle ? "pr-11" : ""} ${inputClassName}`}
            {...props}
        />
    );

    if (!withToggle) return input;

    return (
        <div className="relative">
            {input}
            <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? t("common.hidePassword") : t("common.showPassword")}
                title={reveal ? t("common.hidePassword") : t("common.showPassword")}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    );
}

export function TextareaField({
                                  id,
                                  label,
                                  name,
                                  value,
                                  onChange,
                                  placeholder = "",
                                  required = false,
                                  className = "",
                                  rows = 4,
                              }) {
    return (
        <div className={`space-y-2 ${className}`}>
            <FieldLabel id={id} label={label} required={required} />
            <textarea
                id={id}
                name={name}
                value={value}
                onChange={onChange}
                required={required}
                placeholder={placeholder}
                rows={rows}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-950"
            />
        </div>
    );
}

export function SelectField({
                                id,
                                label,
                                name,
                                value,
                                onChange,
                                required = false,
                                className = "",
                                children,
                            }) {
    return (
        <div className={`space-y-2 ${className}`}>
            <FieldLabel id={id} label={label} required={required} />
            <select
                id={id}
                name={name}
                value={value}
                onChange={onChange}
                required={required}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-950"
            >
                {children}
            </select>
        </div>
    );
}