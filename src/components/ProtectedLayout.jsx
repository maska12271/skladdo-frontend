import { Suspense, useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from './Layout'
import LoadingBlock from './LoadingBlock'

/**
 * Layout route that requires an authenticated user. Unauthenticated visitors are sent to /login;
 * everyone else gets the app shell with the matched child route rendered in the content area.
 */
export default function ProtectedLayout() {
    const { isAuthenticated, switchingRef } = useAuth()
    const location = useLocation()

    // A company switch ends once a navigation has actually committed - that is the point at which the
    // guards can safely judge the new session again. Clearing it on a timer instead would race the very
    // navigation it is meant to protect.
    useEffect(() => {
        if (switchingRef) {
            switchingRef.current = false
        }
    }, [location, switchingRef])

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />
    }

    return (
        <Layout>
            <Suspense fallback={<LoadingBlock />}>
                <Outlet />
            </Suspense>
        </Layout>
    )
}
