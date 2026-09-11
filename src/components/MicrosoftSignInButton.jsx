import { useTranslation } from 'react-i18next'
import { PublicClientApplication } from '@azure/msal-browser'

/** Microsoft's four-pane mark. Inlined the same way Google's is — see GoogleSignInButton. */
function MicrosoftMark() {
    return (
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
    )
}

/**
 * One instance for the whole app, created lazily on first use rather than at module load: constructing it
 * is cheap and does nothing over the network, but there is still no reason to do it on a page the button
 * never renders on (an unconfigured build, or any signed-in page).
 *
 * `initialize()` is async and must resolve before any other MSAL call — cached so the second click, and
 * every click after it, skips straight to the popup.
 */
let msalInstance = null
let msalReady = null

function getMsal(clientId) {
    if (!msalInstance) {
        msalInstance = new PublicClientApplication({
            auth: {
                clientId,
                // The tenant chosen when the guide walked through Entra: any personal Microsoft account
                // (outlook.com, live.com) or any organization's, all through one button.
                authority: 'https://login.microsoftonline.com/common',
                // A dedicated static page, not the app's own root: MSAL's parent window closes the popup
                // once the response lands here, but landing on the bare origin let React Router boot the
                // real app first and win that race, leaving the popup open showing the landing page.
                // Must match a redirect URI registered on the Entra app's SPA platform exactly.
                redirectUri: `${window.location.origin}/msal-redirect.html`,
            },
        })
        msalReady = msalInstance.initialize()
    }
    return msalReady.then(() => msalInstance)
}

/**
 * "Sign in with Microsoft" — a real button from the start, unlike {@link GoogleSignInButton}'s overlay
 * trick. MSAL has no iframe embed of its own to work around: it hands back tokens from a popup it opens
 * itself, and imposes no branding requirement on the button that triggers it, so there is nothing standing
 * between this markup and the rest of the form.
 *
 * Renders nothing at all when `VITE_MICROSOFT_CLIENT_ID` was not set at build time — the same convention
 * as the Google button, for the same reason: an installation with no Entra app cannot offer this.
 *
 * @param onCredential called with the ID token once Microsoft has authenticated the visitor.
 * @param onError      called when Microsoft itself fails, the popup is blocked, or the visitor closes it.
 * @param label        the visible (and only) caption — MSAL draws no button of its own to keep in sync.
 */
export default function MicrosoftSignInButton({ onCredential, onError, label }) {
    const { t } = useTranslation()
    const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID

    if (!clientId) {
        return null
    }

    const handleClick = async () => {
        try {
            const msal = await getMsal(clientId)
            const result = await msal.loginPopup({ scopes: ['openid', 'profile', 'email'] })
            onCredential(result.idToken)
        } catch (err) {
            onError?.(err)
        }
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
        >
            <MicrosoftMark />
            {label || t('login.microsoft')}
        </button>
    )
}
