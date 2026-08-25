import { usePresignedUrl } from '../hooks/usePresignedUrl'
import { AVATAR_ICONS, AVATAR_COLORS, DEFAULT_AVATAR_COLOR } from '../constants/avatars'

const SIZES = {
    sm: { box: 'h-8 w-8 text-xs', icon: 'h-4 w-4' },
    md: { box: 'h-9 w-9 text-sm', icon: 'h-5 w-5' },
    lg: { box: 'h-14 w-14 text-xl', icon: 'h-7 w-7' },
    xl: { box: 'h-20 w-20 text-2xl', icon: 'h-9 w-9' },
}

/** Up to two initials from a name, falling back to the email. The oldest of the three shapes below. */
function initials(user) {
    const source = user?.fullName || user?.email || '?'
    return source.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
}

/**
 * One person's avatar, wherever they appear. Three shapes in a fixed order of preference: an uploaded
 * photo, then a preset icon, then their initials — so an account always has something to show and no
 * call site has to handle the empty case.
 *
 * The uploaded key is presigned at render time and never stored as a URL (see `usePresignedUrl`); until
 * that resolves the initials stand in, which keeps the circle from appearing blank first.
 */
export default function UserAvatar({ user, size = 'sm', className = '' }) {
    const { box, icon } = SIZES[size] || SIZES.sm
    const url = usePresignedUrl(user?.avatarKey)
    const Icon = AVATAR_ICONS[user?.avatarIcon]
    const shell = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${box} ${className}`

    if (user?.avatarKey && url) {
        return <img src={url} alt="" className={`${shell} object-cover`} />
    }
    if (Icon) {
        return (
            <span className={`${shell} ${AVATAR_COLORS[user.avatarColor] || AVATAR_COLORS[DEFAULT_AVATAR_COLOR]}`}>
                <Icon className={icon} />
            </span>
        )
    }
    return (
        <span className={`${shell} bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300`}>
            {initials(user)}
        </span>
    )
}
