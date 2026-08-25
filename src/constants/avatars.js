import {
    User, Briefcase, Wrench, Truck, Package, ShoppingCart, Warehouse, ShieldCheck,
} from 'lucide-react'

/**
 * The preset avatars, for accounts that would rather not upload a photo. Kept small and work-flavoured
 * on purpose: this is a colleague's marker in a list, not a personality quiz.
 *
 * The keys are what the server stores in `User.avatarIcon`, so renaming one orphans every account
 * already using it — add rather than rename. Stored as plain strings precisely so that adding an option
 * stays a change to this file alone.
 */
export const AVATAR_ICONS = {
    user: User,
    briefcase: Briefcase,
    wrench: Wrench,
    truck: Truck,
    package: Package,
    cart: ShoppingCart,
    warehouse: Warehouse,
    shield: ShieldCheck,
}

/**
 * Backgrounds for a preset icon, written out in full.
 *
 * Every class is a complete literal because Tailwind scans the source for them — building one as
 * `bg-${colour}-100` produces a class that exists nowhere in the stylesheet and silently renders
 * unstyled, which is the same trap that once left every modal full-width.
 */
export const AVATAR_COLORS = {
    teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
}

export const AVATAR_ICON_NAMES = Object.keys(AVATAR_ICONS)
export const AVATAR_COLOR_NAMES = Object.keys(AVATAR_COLORS)

/** The default colour, used when an icon is picked before any colour is. */
export const DEFAULT_AVATAR_COLOR = 'teal'
