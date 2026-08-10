/**
 * Audit-trail vocabulary shared by the viewer's filters and its row rendering.
 *
 * Mirrors the `ENTITY_*` constants on the backend's `AuditService` (plain strings there, so auditing a
 * new kind of record never needs a migration — add it here too when that happens) and the `AuditAction`
 * enum.
 *
 * `path` builds the link to the audited record, or is null when there is nothing to link to.
 * `legacy: true` means nothing new is recorded for that type, but rows already in the trail should still
 * render with a proper label — such entries are kept out of the filter dropdown.
 */
const ENTITY_DEFS = [
    { value: 'SALES_ORDER', labelKey: 'audit.entity.SALES_ORDER', path: (id) => `/sales-orders/${id}` },
    { value: 'PURCHASE_ORDER', labelKey: 'audit.entity.PURCHASE_ORDER', path: (id) => `/purchase-orders/${id}` },
    { value: 'CLIENT', labelKey: 'audit.entity.CLIENT', path: (id) => `/clients/${id}` },
    { value: 'MANUFACTURER', labelKey: 'audit.entity.MANUFACTURER', path: (id) => `/manufacturers/${id}` },
    { value: 'PRODUCT', labelKey: 'audit.entity.PRODUCT', path: (id) => `/products/${id}` },
    { value: 'TENDER', labelKey: 'audit.entity.TENDER', path: (id) => `/tenders/${id}` },
    { value: 'USER', labelKey: 'audit.entity.USER', path: (id) => `/users/${id}` },
    { value: 'COMPANY', labelKey: 'audit.entity.COMPANY', path: null },
    { value: 'WAREHOUSE_PARTNER', labelKey: 'audit.entity.WAREHOUSE_PARTNER', path: () => '/warehouses?tab=connections' },
    // Company settings are no longer audited (a save had no identifiable detail); older rows remain.
    { value: 'SETTINGS', labelKey: 'audit.entity.SETTINGS', path: null, legacy: true },
]

/** Options offered in the viewer's "record type" filter. */
export const AUDIT_ENTITY_TYPES = ENTITY_DEFS.filter((e) => !e.legacy)

/** Every known type, including legacy ones, for labelling and linking existing rows. */
export const AUDIT_ENTITY_BY_VALUE = Object.fromEntries(ENTITY_DEFS.map((e) => [e.value, e]))

export const AUDIT_ACTIONS = [
    'CREATE',
    'UPDATE',
    'DELETE',
    'STATUS_CHANGE',
    'PERMISSIONS_CHANGE',
    'ARCHIVE',
    'UNARCHIVE',
]

/** Tailwind classes per action, so the trail can be scanned by colour. */
export const AUDIT_ACTION_STYLES = {
    CREATE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    UPDATE: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
    DELETE: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
    STATUS_CHANGE: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
    PERMISSIONS_CHANGE: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    ARCHIVE: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    UNARCHIVE: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}
