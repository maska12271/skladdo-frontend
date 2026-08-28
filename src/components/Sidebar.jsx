import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
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
    Wrench,
    Mail,
    ScrollText,
    Building2,
    Gauge,
    Link2,
    X,
    Moon,
    Sun,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useTheme } from "../context/ThemeContext"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { OVERLAY_BACKDROP } from "../constants/overlay"
import { getCookie, setCookie } from "../utils/cookies"
import CompanySwitcher from "./CompanySwitcher"
import UserAvatar from "./UserAvatar"
import LanguageSwitcher from "./LanguageSwitcher"

// `module` is the permission area gating the link; links without one (Dashboard) are always shown.
// `addon` additionally requires the company to pay for the feature - an unbought add-on hides the page
// rather than teasing it, and the server closes its endpoints to match.
// `labelKey` indexes the i18n `nav.*` dictionary.
const baseLinks = [
    { to: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
    { to: "/products", labelKey: "products", icon: Package, module: "PRODUCTS" },
    { to: "/services", labelKey: "services", icon: Wrench, module: "SERVICES" },
    { to: "/manufacturers", labelKey: "manufacturers", icon: Factory, module: "MANUFACTURERS" },
    { to: "/clients", labelKey: "clients", icon: Users, module: "CLIENTS" },
    { to: "/sales-orders", labelKey: "salesOrders", icon: ShoppingCart, module: "SALES_ORDERS" },
    { to: "/purchase-orders", labelKey: "purchaseOrders", icon: Truck, module: "PURCHASE_ORDERS" },
    { to: "/tenders", labelKey: "tenders", icon: FileText, module: "TENDERS", addon: "TENDERS" },
    { to: "/warehouses", labelKey: "warehouses", icon: Warehouse, module: "WAREHOUSES" },
    { to: "/emails", labelKey: "manufacturerEmails", icon: Mail, module: "MANUFACTURER_EMAILS", addon: "MANUFACTURER_EMAILS" },
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

// Tooltip shown to the right of an item when the sidebar is collapsed.
function Tooltip({ label }) {
    return (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block dark:bg-slate-700">
            {label}
        </span>
    )
}

/**
 * The app's navigation, in two shapes for one set of links.
 *
 * On a desktop it is a permanent column that can be collapsed to icons. Below `lg` there is no room to
 * give it permanently, so it becomes an off-canvas drawer over the page — `open`/`onClose` are the header
 * hamburger's end of that, and are unused on a desktop.
 */
export default function Sidebar({ open = false, onClose = () => {} }) {
    const { t } = useTranslation()
    const { user, isHomeAdmin, can, hasAddon, logout, isWarehouseAccount, isPartnerSession, isPlatformAdmin, isPlatformCompany, companies, switchCompany, lastClientId } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const { theme, toggleTheme } = useTheme()
    const breakpoint = useBreakpoint()
    const [collapsedPref, setCollapsedPref] = useState(() => getCookie(COLLAPSE_COOKIE) === "1")

    const isDesktop = breakpoint === "desktop"
    // Collapsing trades labels for hover tooltips, and a phone or tablet has no pointer to hover with —
    // so the drawer always shows full labels, whatever the saved preference says.
    const collapsed = isDesktop && collapsedPref

    // The drawer sits on top of the page, so anything meaning "you are looking at something else now"
    // closes it: navigating away, or the viewport growing to where the sidebar is permanent again.
    useEffect(() => {
        onClose()
    }, [location.pathname, isDesktop, onClose])

    // While it is over the page, Escape dismisses it and the page underneath must not scroll.
    useEffect(() => {
        if (!open || isDesktop) return undefined
        const onKeyDown = (event) => {
            if (event.key === "Escape") onClose()
        }
        document.addEventListener("keydown", onKeyDown)
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.removeEventListener("keydown", onKeyDown)
            document.body.style.overflow = previousOverflow
        }
    }, [open, isDesktop, onClose])

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
        setCollapsedPref((prev) => {
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
        : baseLinks.filter((link) => (!link.module || can(link.module, "canView"))
            && (!link.addon || hasAddon(link.addon)))

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
    const companyLinks = isHomeAdmin ? [...visibleLinks, ...adminLinks] : visibleLinks

    // Running Skladdo itself, as opposed to using it. These cross every tenant, so they hang off the
    // account's platform flag and have nothing to do with `isHomeAdmin` — a customer's owner never sees
    // them. `platform` marks the divider, the same way `ownCompany` does above.
    const platformLinks = isPlatformAdmin
        ? [
              { to: "/admin", label: "Overview", icon: Gauge, platform: true },
              { to: "/admin/companies", label: "Companies", icon: Building2, platform: true },
              { to: "/admin/invite-links", label: "Invite links", icon: Link2, platform: true },
          ]
        : []

    // A platform account has no company of its own to run — no catalogue, no orders, no settings worth
    // opening — so it gets the admin pages and nothing else, with no divider to separate them from
    // absent ones. An operator whose login lives in a real customer company still sees both halves.
    const links = isPlatformCompany
        ? platformLinks.map((link) => ({ ...link, platform: false }))
        : [...companyLinks, ...platformLinks]

    const nav = (
        <nav className={`flex-1 space-y-0.5 ${collapsed ? "overflow-visible" : "overflow-y-auto"}`}>
            {links.map((link, index) => {
                const Icon = link.icon
                const startsOwnCompany = link.ownCompany && !links[index - 1]?.ownCompany
                const startsPlatform = link.platform && !links[index - 1]?.platform

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
                    {/* And everything below *this* line is Skladdo itself rather than any one company.
                        Untranslated on purpose — see components/AdminBits.jsx. */}
                    {startsPlatform && (
                        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                            {!collapsed && (
                                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                    Platform
                                </p>
                            )}
                        </div>
                    )}
                    <NavLink
                        to={link.to}
                        end={link.to === "/admin"}
                        onClick={(event) => {
                            // Platform pages belong to no tenant, so neither company-switching handler
                            // applies to them — they are ordinary navigation.
                            if (link.platform) return
                            if (link.ownCompany) openOwnCompany(event, link.to)
                            else openClientPage(event, link.to)
                        }}
                        className={({ isActive }) =>
                            `group relative flex items-center rounded-lg text-sm font-medium transition ${
                                // py-3 gives the drawer's links a 44px row; `lg` puts the permanent
                                // sidebar back to its original density. This is the E0 deferral.
                                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-3 lg:py-2"
                            } ${
                                isActive
                                    ? "bg-teal-600 text-white shadow-sm"
                                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                            }`
                        }
                    >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        {/* Platform links carry a literal label; everything else is translated. */}
                        {!collapsed && <span>{link.label ?? t(`nav.${link.labelKey}`)}</span>}
                        {collapsed && <Tooltip label={link.label ?? t(`nav.${link.labelKey}`)} />}
                    </NavLink>
                    </div>
                )
            })}
        </nav>
    )

    /**
     * Which build is running, kept deliberately faint and tiny — it is not information anyone needs while
     * working, only while asking "did the deploy land?". The commit and build time hang off the tooltip
     * rather than the label, so the answer is one hover away without ever taking up room.
     */
    const version = (
        <p
            className="px-2 pt-2 text-[10px] leading-none text-slate-300 dark:text-slate-600"
            title={`${__APP_COMMIT__} · built ${new Date(__APP_BUILT_AT__).toLocaleString()}`}
        >
            v{__APP_VERSION__}
        </p>
    )

    const account = (
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            {collapsed ? (
                <div className="flex flex-col items-center gap-3">
                    <NavLink
                        to="/account"
                        aria-label={t('nav.account')}
                        className={({ isActive }) =>
                            `group relative flex rounded-full ${isActive ? 'ring-2 ring-teal-500' : ''}`
                        }
                    >
                        <UserAvatar user={user} size="md" />
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
                // One row in the drawer: the account link takes the width it needs and sign-out becomes
                // the icon beside it, rather than a second full-width row. On a desktop there is room for
                // both, so it keeps the labelled button.
                <div className={isDesktop ? '' : 'flex items-center gap-2'}>
                    <NavLink
                        to="/account"
                        className={({ isActive }) =>
                            `flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition lg:mb-2 ${
                                isActive ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                            }`
                        }
                    >
                        <UserAvatar user={user} size="sm" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                                {user?.fullName || user?.email}
                            </span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                {user?.role ? t(`roles.${user.role}`) : ""}
                                {user?.companyName ? ` · ${user.companyName}` : ""}
                            </span>
                        </span>
                    </NavLink>
                    <button
                        onClick={logout}
                        aria-label={t('nav.signOut')}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:h-auto lg:w-full lg:justify-start lg:gap-3 lg:px-3 lg:py-2 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        <LogOut className="h-[18px] w-[18px] shrink-0" />
                        <span className="hidden text-sm font-medium lg:inline">{t('nav.signOut')}</span>
                    </button>
                </div>
            )}
        </div>
    )

    if (!isDesktop) {
        return (
            <>
                {open && (
                    <div
                        onClick={onClose}
                        aria-hidden="true"
                        className={`fixed inset-0 z-40 ${OVERLAY_BACKDROP}`}
                    />
                )}
                {/* Kept mounted so it can slide rather than blink. `inert` is what makes the closed
                    drawer genuinely gone — off-screen alone would leave its links tabbable. */}
                <aside
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('nav.menu')}
                    inert={!open}
                    className={`fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col border-r border-slate-200 bg-white p-4 shadow-xl transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 ${
                        open ? "translate-x-0" : "-translate-x-full"
                    }`}
                >
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <NavLink to="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-lg">
                            <img src="/skladdo-logo.svg" alt="" aria-hidden="true" className="h-8 w-auto shrink-0" />
                            {/* Not a heading: every page already has its own h1, and a second one in the
                                chrome makes the brand compete with the page title in the heading outline. */}
                            <span className="truncate text-xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                                {t('nav.appName')}
                            </span>
                        </NavLink>
                        <button
                            onClick={onClose}
                            aria-label={t('nav.closeMenu')}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Which company's data is on screen — the one header control that still needs a
                        panel. Left-anchored and at the top, so it opens downwards into the drawer rather
                        than off the side or the bottom of the screen. Renders nothing for an account with
                        a single company, which is most of them. */}
                    <CompanySwitcher align="left" className="mb-3 border-b border-slate-200 pb-3 dark:border-slate-800" />

                    {nav}

                    {/* Preferences, below the links and above the account: both were in the header, where
                        neither fits at phone width. Side by side rather than stacked — two rows of
                        settings that are chosen once and never revisited were taking room from the links,
                        which are what the drawer is for. Both halves shrink to fit; neither label wraps. */}
                    <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                        <div className="min-w-0 flex-1">
                            <LanguageSwitcher variant="inline" />
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={t('nav.theme')}
                            className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            {theme === 'dark' ? <Moon className="h-4 w-4 shrink-0" /> : <Sun className="h-4 w-4 shrink-0" />}
                            <span className="truncate">{theme === 'dark' ? t('nav.themeDark') : t('nav.themeLight')}</span>
                        </button>
                    </div>

                    {account}
                    {version}
                </aside>
            </>
        )
    }

    return (
        <aside
            className={`sticky top-0 z-40 flex h-screen shrink-0 flex-col self-start border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 ${
                collapsed ? "w-20 p-3" : "w-64 p-4"
            }`}
        >
            <div className={`mb-4 flex ${collapsed ? "flex-col items-center gap-3" : "items-center justify-between"}`}>
                {collapsed ? (
                    <NavLink to="/dashboard" aria-label={t('nav.dashboard')} className="rounded-lg">
                        <img src="/skladdo-logo.svg" alt={t('nav.appName')} className="h-8 w-auto" />
                    </NavLink>
                ) : (
                    <NavLink to="/dashboard" className="flex items-center gap-2.5 rounded-lg">
                        <img src="/skladdo-logo.svg" alt="" aria-hidden="true" className="h-8 w-auto shrink-0" />
                        {/* Not a heading: every page already has its own h1, and a second one in the
                            chrome makes the brand compete with the page title in the heading outline. */}
                        <span className="text-xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                            {t('nav.appName')}
                        </span>
                    </NavLink>
                )}
                <button
                    onClick={toggle}
                    aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                    {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                </button>
            </div>

            {nav}
            {account}
            {!collapsed && version}
        </aside>
    )
}
