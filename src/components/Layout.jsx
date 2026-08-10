import Header from './Header'
import Sidebar from './Sidebar'

export default function Layout({ children }) {
    return (
        <div className="flex min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <Sidebar />
            <div className="flex min-h-screen min-w-0 flex-1 flex-col">
                <Header />
                <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
            </div>
        </div>
    )
}