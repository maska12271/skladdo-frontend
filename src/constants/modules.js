/**
 * Permission modules shared between the sidebar, route guards and the admin permission editor.
 * Mirrors the backend {@code PermissionModule} enum. Keep the keys in sync.
 */
// `navKey` indexes the i18n `nav.*` dictionary so the module name can be shown translated.
export const PERMISSION_MODULES = [
    { module: 'PRODUCTS', label: 'Products', navKey: 'products', path: '/products' },
    { module: 'MANUFACTURERS', label: 'Manufacturers', navKey: 'manufacturers', path: '/manufacturers' },
    // Categories are managed in a modal launched from the products page (no standalone page).
    { module: 'CATEGORIES', label: 'Categories', navKey: 'categories', path: null },
    // Manufacturer categories are managed in a modal launched from the manufacturers page.
    { module: 'PARTNER_CATEGORIES', label: 'Manufacturer Categories', navKey: 'partnerCategories', path: null },
    { module: 'CLIENTS', label: 'Clients', navKey: 'clients', path: '/clients' },
    { module: 'SALES_ORDERS', label: 'Sales Orders', navKey: 'salesOrders', path: '/sales-orders' },
    // Invoices are created and managed on the sales-order detail page (no standalone page); the module
    // still gates the invoice actions, the orders' payment column/filter and the receivables widget.
    { module: 'INVOICES', label: 'Invoices', navKey: 'invoices', path: null },
    { module: 'PURCHASE_ORDERS', label: 'Purchase Orders', navKey: 'purchaseOrders', path: '/purchase-orders' },
    { module: 'TENDERS', label: 'Tenders', navKey: 'tenders', path: '/tenders' },
    // Inventory is a capability (stock-taking), not a navigable page — it appears in the permission
    // editor but has no sidebar link of its own.
    { module: 'INVENTORY', label: 'Inventory', navKey: 'inventory', path: null },
    { module: 'WAREHOUSES', label: 'Warehouses', navKey: 'warehouses', path: '/warehouses' },
    { module: 'MANUFACTURER_EMAILS', label: 'Manufacturer Emails', navKey: 'manufacturerEmails', path: '/emails' },
]
