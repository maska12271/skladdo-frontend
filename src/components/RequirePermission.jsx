import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingBlock from './LoadingBlock'
import AddonRequired from './AddonRequired'

/**
 * Gates a route by a single module permission, and optionally by a purchasable `addon` the company must
 * be paying for.
 *
 * The two failures are answered differently on purpose. A missing **permission** means this page is not
 * for this user, so they are quietly returned to the dashboard - there is nothing for them to do about
 * it. A missing **add-on** means the company has not bought the feature, which is a different sentence
 * entirely: nothing is wrong, nobody is forbidden, and there is a specific thing to do next. That gets a
 * page saying so, with a way to turn it on.
 *
 * Except mid-company-switch, when it waits instead. The page being left loses its permissions the moment
 * the new session lands, and redirecting from there rewrites the URL underneath the page the user was on
 * their way to - which showed up as the right page under the wrong address.
 */
export default function RequirePermission({ module, action = 'canView', addon, children }) {
    const { can, hasAddon, switchingRef } = useAuth()

    if (switchingRef?.current) {
        return <LoadingBlock />
    }

    if (!can(module, action)) {
        return <Navigate to="/dashboard" replace />
    }

    if (addon && !hasAddon(addon)) {
        return <AddonRequired addon={addon} />
    }

    return children
}
