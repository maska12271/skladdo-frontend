import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingBlock from './LoadingBlock'

/**
 * Gates a route to owners and administrators. Regular users are redirected to the dashboard.
 *
 * Waits rather than redirects mid-company-switch, for the same reason as {@code RequirePermission}: a
 * session in transit briefly holds neither company's standing, and a redirect from there would steal the
 * navigation already under way.
 */
export default function RequireAdmin({ children }) {
    const { isAdmin, switchingRef } = useAuth()

    if (switchingRef?.current) {
        return <LoadingBlock />
    }

    if (!isAdmin) {
        return <Navigate to="/dashboard" replace />
    }

    return children
}
