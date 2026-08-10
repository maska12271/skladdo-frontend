import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingBlock from './LoadingBlock'

/**
 * Gates a route by a single module permission. Users lacking the required access are redirected to
 * the dashboard (which every authenticated user can reach).
 *
 * Except mid-company-switch, when it waits instead. The page being left loses its permissions the moment
 * the new session lands, and redirecting from there rewrites the URL underneath the page the user was on
 * their way to - which showed up as the right page under the wrong address.
 */
export default function RequirePermission({ module, action = 'canView', children }) {
    const { can, switchingRef } = useAuth()

    if (switchingRef?.current) {
        return <LoadingBlock />
    }

    if (!can(module, action)) {
        return <Navigate to="/dashboard" replace />
    }

    return children
}
