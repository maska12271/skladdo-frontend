import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingBlock from './LoadingBlock'

/**
 * Gates the platform operator's panel — the cross-tenant pages under `/admin`.
 *
 * Deliberately separate from {@link RequireAdmin}, which asks "are you an owner or administrator of this
 * company". That is the most senior thing anyone can be *inside* a tenant and still grants nothing here:
 * the panel reads and administers every company, so it keys off the account's platform flag instead.
 *
 * The server enforces this independently on every `/api/admin` call (`ROLE_PLATFORM_ADMIN`), so this is
 * navigation, not security — flipping the flag in localStorage buys a page whose every request 403s.
 *
 * Holds still mid-company-switch for the same reason as the other guards: a session in transit would
 * otherwise redirect out from under a navigation already under way.
 */
export default function RequirePlatformAdmin({ children }) {
    const { isPlatformAdmin, switchingRef } = useAuth()

    if (switchingRef?.current) {
        return <LoadingBlock />
    }

    if (!isPlatformAdmin) {
        return <Navigate to="/dashboard" replace />
    }

    return children
}
