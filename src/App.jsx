import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ProtectedLayout from './components/ProtectedLayout'
import RequireAdmin from './components/RequireAdmin'
import RequirePermission from './components/RequirePermission'
import LoadingBlock from './components/LoadingBlock'
import { useAuth } from './context/AuthContext'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'))
const ManufacturersPage = lazy(() => import('./pages/ManufacturersPage'))
const ManufacturerDetailPage = lazy(() => import('./pages/ManufacturerDetailPage'))
const ClientsPage = lazy(() => import('./pages/ClientsPage'))
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'))
const SalesOrdersPage = lazy(() => import('./pages/SalesOrdersPage'))
const PurchaseOrdersPage = lazy(() => import('./pages/PurchaseOrdersPage'))
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'))
const TendersPage = lazy(() => import('./pages/TendersPage'))
const TenderDetailPage = lazy(() => import('./pages/TenderDetailPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const UserDetailPage = lazy(() => import('./pages/UserDetailPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'))
const WarehousesPage = lazy(() => import('./pages/WarehousesPage'))
const WarehouseDetailPage = lazy(() => import('./pages/WarehouseDetailPage'))
const SentEmailsPage = lazy(() => import('./pages/SentEmailsPage'))
const EmailBatchDetailPage = lazy(() => import('./pages/EmailBatchDetailPage'))

/**
 * Shown when a warehouse account is on the dashboard without a client open — in practice only before it
 * has connected its first one, since signing in opens a client and every work link switches into one.
 *
 * Deliberately a panel rather than a redirect. Redirecting from here also fired while the session was
 * mid-swap on its way somewhere else, quietly stealing the destination: clicking Users from inside a
 * client landed on the connections tab instead. A page that simply renders cannot do that.
 */
function NoClientOpen() {
    const { t } = useTranslation()
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <h1 className="text-xl font-semibold">{t('connections.emptyWarehouseTitle')}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
                {t('connections.emptyWarehouseDesc')}
            </p>
            <Link
                to="/settings?tab=connections"
                className="mt-5 inline-flex items-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
            >
                {t('connections.addCompany')}
            </Link>
        </div>
    )
}

/**
 * The dashboard, unless the account has no company of its own to show one for. A warehouse account only
 * ever works inside its clients, so at home it is shown how to get one instead.
 */
function DashboardOrConnections() {
    const { isWarehouseAccount, isPartnerSession } = useAuth()
    if (isWarehouseAccount && !isPartnerSession) {
        return <NoClientOpen />
    }
    return <DashboardPage />
}

export default function App() {
    return (
        <Routes>
            <Route
                path="/"
                element={
                    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-6"><LoadingBlock /></div>}>
                        <LandingPage />
                    </Suspense>
                }
            />
            <Route
                path="/login"
                element={
                    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-6"><LoadingBlock /></div>}>
                        <LoginPage />
                    </Suspense>
                }
            />
            <Route
                path="/register"
                element={
                    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-6"><LoadingBlock /></div>}>
                        <RegisterPage />
                    </Suspense>
                }
            />
            <Route
                path="/forgot-password"
                element={
                    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-6"><LoadingBlock /></div>}>
                        <ForgotPasswordPage />
                    </Suspense>
                }
            />
            <Route
                path="/reset-password"
                element={
                    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-6"><LoadingBlock /></div>}>
                        <ResetPasswordPage />
                    </Suspense>
                }
            />

            <Route element={<ProtectedLayout />}>
                {/* The dashboard is where everything lands — login, the catch-all, and a denied
                    RequirePermission. A warehouse account has no company of its own for it to report on,
                    so that landing is redirected once, here, rather than in each of those places. */}
                <Route path="/dashboard" element={<DashboardOrConnections />} />
                <Route path="/account" element={<AccountPage />} />
                <Route
                    path="/products"
                    element={<RequirePermission module="PRODUCTS"><ProductsPage /></RequirePermission>}
                />
                <Route
                    path="/products/:id"
                    element={<RequirePermission module="PRODUCTS"><ProductDetailPage /></RequirePermission>}
                />
                <Route
                    path="/manufacturers"
                    element={<RequirePermission module="MANUFACTURERS"><ManufacturersPage /></RequirePermission>}
                />
                <Route
                    path="/manufacturers/:id"
                    element={<RequirePermission module="MANUFACTURERS"><ManufacturerDetailPage /></RequirePermission>}
                />
                <Route
                    path="/clients"
                    element={<RequirePermission module="CLIENTS"><ClientsPage /></RequirePermission>}
                />
                <Route
                    path="/clients/:id"
                    element={<RequirePermission module="CLIENTS"><ClientDetailPage /></RequirePermission>}
                />
                <Route
                    path="/sales-orders"
                    element={<RequirePermission module="SALES_ORDERS"><SalesOrdersPage /></RequirePermission>}
                />
                <Route
                    path="/sales-orders/:id"
                    element={<RequirePermission module="SALES_ORDERS"><OrderDetailPage type="sales" /></RequirePermission>}
                />
                <Route
                    path="/purchase-orders"
                    element={<RequirePermission module="PURCHASE_ORDERS"><PurchaseOrdersPage /></RequirePermission>}
                />
                <Route
                    path="/purchase-orders/:id"
                    element={<RequirePermission module="PURCHASE_ORDERS"><OrderDetailPage type="purchase" /></RequirePermission>}
                />
                <Route
                    path="/tenders"
                    element={<RequirePermission module="TENDERS"><TendersPage /></RequirePermission>}
                />
                <Route
                    path="/tenders/:id"
                    element={<RequirePermission module="TENDERS"><TenderDetailPage /></RequirePermission>}
                />
                <Route
                    path="/warehouses"
                    element={<RequirePermission module="WAREHOUSES"><WarehousesPage /></RequirePermission>}
                />
                <Route
                    path="/warehouses/:id"
                    element={<RequirePermission module="WAREHOUSES"><WarehouseDetailPage /></RequirePermission>}
                />
                <Route
                    path="/emails"
                    element={<RequirePermission module="MANUFACTURER_EMAILS"><SentEmailsPage /></RequirePermission>}
                />
                <Route
                    path="/emails/:batchId"
                    element={<RequirePermission module="MANUFACTURER_EMAILS"><EmailBatchDetailPage /></RequirePermission>}
                />
                <Route
                    path="/users"
                    element={
                        <RequireAdmin>
                            <UsersPage />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/users/:id"
                    element={
                        <RequireAdmin>
                            <UserDetailPage />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/audit-log"
                    element={
                        <RequireAdmin>
                            <AuditLogPage />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/settings"
                    element={
                        <RequireAdmin>
                            <SettingsPage />
                        </RequireAdmin>
                    }
                />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    )
}
