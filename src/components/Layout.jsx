import { useCallback, useState } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'

export default function Layout({ children }) {
    // Below `lg` the sidebar is an overlay, so its open state is shared: the header owns the button that
    // opens it and the sidebar owns everything that closes it. Above `lg` the sidebar is permanent and
    // this is simply never read.
    const [navOpen, setNavOpen] = useState(false)
    // Stable so the sidebar's close-on-navigate effect doesn't re-run on every render of this shell.
    const closeNav = useCallback(() => setNavOpen(false), [])

    return (
        <div className="flex min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <Sidebar open={navOpen} onClose={closeNav} />
            <div className="flex min-h-screen min-w-0 flex-1 flex-col">
                <Header onOpenNav={() => setNavOpen(true)} />
                <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
            </div>
        </div>
    )
}
