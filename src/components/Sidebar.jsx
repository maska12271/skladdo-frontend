import { useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useNavigate } from "react-router-dom"
import {
    LayoutDashboard,
    Package,
    Factory,
    Users,
    ShoppingCart,
    Truck,
    FileText,
    UserCog,
    Settings,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    Warehouse,
    Mail,
    ScrollText,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { getCookie, setCookie } from "../utils/cookies"

// `module` is the permission area gating the link; links without one (Dashboard) are always shown.
// `labelKey` indexes the i18n `nav.*` dictionary.
const baseLinks = [
    { to: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
    { to: "/products", labelKey: "products", icon: Package, module: "PRODUCTS" },
    { to: "/manufacturers", labelKey: "manufacturers", icon: Factory, module: "MANUFACTURERS" },
    { to: "/clients", labelKey: "clients", icon: Users, module: "CLIENTS" },
    { to: "/sales-orders", labelKey: "salesOrders", icon: ShoppingCart, module: "SALES_ORDERS" },
    { to: "/purchase-orders", labelKey: "purchaseOrders", icon: Truck, module: "PURCHASE_ORDERS" },
    { to: "/tenders", labelKey: "tenders", icon: FileText, module: "TENDERS" },
    { to: "/warehouses", labelKey: "warehouses", icon: Warehouse, module: "WAREHOUSES" },
    { to: "/emails", labelKey: "manufacturerEmails", icon: Mail, module: "MANUFACTURER_EMAILS" },
]

/**
 * The pages a warehouse account works with inside a client — the nav half of
 * `PermissionService.warehouseDefaults()`. Only used to keep the sidebar steady while the account is at
 * home administering itself, where it holds no permissions; the server still decides every request.
 */
const PARTNER_LINKS = new Set([
    "/dashboard", "/products", "/manufacturers", "/clients", "/sales-orders", "/purchase-orders", "/warehouses",
])

const COLLAPSE_COOKIE = "sidebar_collapsed"

function initials(user) {
    const source = user?.fullName || user?.email || "?"
    return source
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
}

// Tooltip shown to the right of an item when the sidebar is collapsed.
function Tooltip({ label }) {
    return (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block dark:bg-slate-700">
            {label}
        </span>
    )
}

export default function Sidebar() {
    const { t } = useTranslation()
    const { user, isHomeAdmin, can, logout, isWarehouseAccount, isPartnerSession, companies, switchCompany, lastClientId } = useAuth()
    const navigate = useNavigate()
    const [collapsed, setCollapsed] = useState(() => getCookie(COLLAPSE_COOKIE) === "1")

    /**
     * Opens one of the account's own pages. Those endpoints are scoped to the company the session is
     * working in and are owner/administrator-only, so reaching them from inside a client means switching
     * back first — otherwise they would either be refused or, worse, describe the client. Done here rather
     * than asked of the user, so it reads as navigation instead of a mode change.
     */
    const openOwnCompany = async (event, to) => {
        if (!isPartnerSession) {
            return
        }
        event.preventDefault()
        const home = companies.find((company) => company.home)
        if (home) {
            await switchCompany(home.id)
        }
        navigate(to)
    }

    /**
     * The mirror of the above: a work page opened while at home puts the session back into a client first,
     * since that is the only place the account has any of this data. Picks the same client login would.
     *
     * An ordinary navigation: the route guards hold still while the swap is in flight (see
     * `AuthContext.switchingRef`), so the destination survives it and nothing reloads.
     */
    const openClientPage = async (event, to) => {
        if (!atHome || clients.length === 0) {
            return
        }
        event.preventDefault()
        // Back to whichever client was last worked in — the one the header has been naming all along —
        // falling back to the first for a session that has not been in one yet.
        const target = clients.find((company) => company.id === lastClientId) || clients[0]
        await switchCompany(target.id)
        navigate(to)
    }

    const toggle = () => {
        setCollapsed((prev) => {
            const next = !prev
            setCookie(COLLAPSE_COOKIE, next ? "1" : "0")
            return next
        })
    }

    // A warehouse account working at home is only there to administer itself, so the server closes every
    // module and `can` reports nothing. The work pages still belong in the sidebar: it is signed in to do
    // that work, and a nav that empties out whenever it opens its own settings would read as the app
    // losing its pages. They stay put and switch back into a client on click.
    const atHome = isWarehouseAccount && !isPartnerSession
    const clients = companies.filter((company) => !company.home)
    const visibleLinks = atHome
        ? (clients.length > 0 ? baseLinks.filter((link) => PARTNER_LINKS.has(link.to)) : [])
        : baseLinks.filter((link) => !link.module || can(link.module, "canView"))

    // Administering the account itself, as opposed to working in a company's data. A warehouse account has
    // no activity trail of its own to read, so it does not get one. `ownCompany` marks the divider.
    const adminLinks = isWarehouseAccount
        ? [
              { to: "/users", labelKey: "users", icon: UserCog, ownCompany: true },
              { to: "/settings", labelKey: "settings", icon: Settings, ownCompany: true },
          ]
        : [
              { to: "/users", labelKey: "users", icon: UserCog },
              { to: "/audit-log", labelKey: "auditLog", icon: ScrollText },
              { to: "/settings", labelKey: "settings", icon: Settings },
          ]
    // Judged by their standing at home: inside a client every session is capped to warehouse staff, but
    // these are their own company's pages, not the client's.
    const links = isHomeAdmin ? [...visibleLinks, ...adminLinks] : visibleLinks

    return (
        <aside
            className={`sticky top-0 z-40 hidden h-screen shrink-0 flex-col self-start border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 md:flex ${
                collapsed ? "w-20 p-3" : "w-64 p-4"
            }`}
        >
            <div className={`mb-4 flex ${collapsed ? "flex-col items-center gap-3" : "items-center justify-between"}`}>
                {collapsed ? (
                    <img src="/kladdo-logo.svg" alt={t('nav.appName')} className="h-8 w-auto" />
                ) : (
                    <div className="flex items-center gap-2.5">
                        <img src="/kladdo-logo.svg" alt="" aria-hidden="true" className="h-8 w-auto shrink-0" />
                        <h1 className="text-xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                            {t('nav.appName')}
                        </h1>
                    </div>
                )}
                <button
                    onClick={toggle}
                    aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                    {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                </button>
            </div>

            <nav className={`flex-1 space-y-0.5 ${collapsed ? "overflow-visible" : "overflow-y-auto"}`}>
                {links.map((link, index) => {
                    const Icon = link.icon
                    const startsOwnCompany = link.ownCompany && !links[index - 1]?.ownCompany

                    return (
                        <div key={link.to}>
                        {/* Everything below this line is the account's own company rather than the one
                            being worked in — worth saying, since the two are different places. */}
                        {startsOwnCompany && (
                            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                                {!collapsed && (
                                    <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        {t('nav.ownCompanySettings')}
                                    </p>
                                )}
                            </div>
                        )}
                        <NavLink
                            to={link.to}
                            onClick={(event) => (link.ownCompany
                                ? openOwnCompany(event, link.to)
                                : openClientPage(event, link.to))}
                            className={({ isActive }) =>
                                `group relative flex items-center rounded-lg text-sm font-medium transition ${
                                    collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"
                                } ${
                                    isActive
                                        ? "bg-teal-600 text-white shadow-sm"
                                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                }`
                            }
                        >
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                            {!collapsed && <span>{t(`nav.${link.labelKey}`)}</span>}
                            {collapsed && <Tooltip label={t(`nav.${link.labelKey}`)} />}
                        </NavLink>
                        </div>
                    )
                })}
            </nav>

            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                {collapsed ? (
                    <div className="flex flex-col items-center gap-3">
                        <NavLink
                            to="/account"
                            aria-label={t('nav.account')}
                            className={({ isActive }) =>
                                `group relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200 ${
                                    isActive ? 'ring-2 ring-teal-500' : ''
                                }`
                            }
                        >
                            {initials(user)}
                            <Tooltip label={t('nav.account')} />
                        </NavLink>
                        <button
                            onClick={logout}
                            aria-label={t('nav.signOut')}
                            className="group relative flex items-center justify-center rounded-lg p-2.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <LogOut className="h-5 w-5 shrink-0" />
                            <Tooltip label={t('nav.signOut')} />
                        </button>
                    </div>
                ) : (
                    <>
                        <NavLink
                            to="/account"
                            className={({ isActive }) =>
                                `mb-2 block rounded-lg px-2 py-1.5 transition ${
                                    isActive ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`
                            }
                        >
                            <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                                {user?.fullName || user?.email}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {user?.role ? t(`roles.${user.role}`) : ""}
                                {user?.companyName ? ` · ${user.companyName}` : ""}
                            </p>
                        </NavLink>
                        <button
                            onClick={logout}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <LogOut className="h-[18px] w-[18px] shrink-0" />
                            <span>{t('nav.signOut')}</span>
                        </button>
                    </>
                )}
            </div>
        </aside>
    )
}
