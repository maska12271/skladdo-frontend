import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { useTranslation } from 'react-i18next'

/** Google's four-colour mark. Inlined because their branding rules require this exact artwork. */
function GoogleMark() {
    return (
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
            <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
            <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
            <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
        </svg>
    )
}

/**
 * "Sign in with Google", drawn to match the rest of the form rather than looking pasted in.
 *
 * Google's button is an iframe they render and we may not restyle — fixed corner radius, their font,
 * a pixel width that cannot follow a responsive card. So the button you see here is ours, and Google's
 * real one is laid over it at zero opacity to take the click. That is the standard way to do this and it
 * changes nothing about the flow: the click still reaches Google's button, so the credential still comes
 * back through their callback, and the token is still the one the server verifies.
 *
 * Consequences of that arrangement, each handled below:
 * - the visible button is `aria-hidden` and not focusable, because Google's invisible one is the real
 *   control and already carries an accessible name — two buttons would be announced for one action;
 * - keyboard focus therefore lands on something invisible, so the wrapper's `focus-within` draws the
 *   focus ring on the visible button instead;
 * - Google's button is given its maximum 400px width and the wrapper clips it, so the hit area always
 *   spans the full width of what you see, at any card size, with nothing to measure or keep in sync.
 *
 * Renders nothing at all when `VITE_GOOGLE_CLIENT_ID` was not set at build time: an installation with no
 * client id cannot offer Google sign-in, and an inert button is worse than none. That is also why the
 * provider lives here rather than around the whole app — mounting it fetches a script from Google, and
 * no signed-in page view has any reason to.
 *
 * @param onCredential called with the ID token once Google has authenticated the visitor.
 * @param onError      called when Google itself fails or the visitor dismisses the popup.
 * @param label        the visible caption.
 * @param text         Google's own caption id ('signin_with' / 'signup_with'). Invisible, but it is what
 *                     a screen reader announces, so it still has to say the right thing.
 */
export default function GoogleSignInButton({ onCredential, onError, label, text = 'signin_with' }) {
    const { t, i18n } = useTranslation()
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

    if (!clientId) {
        return null
    }

    return (
        <div className="group relative h-12 w-full">
            <div
                aria-hidden="true"
                className="pointer-events-none flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-700 transition-colors group-hover:bg-slate-50 group-focus-within:border-teal-500 group-focus-within:ring-2 group-focus-within:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:group-hover:bg-slate-900"
            >
                <GoogleMark />
                {label || t('login.google')}
            </div>

            {/*
              * `locale` belongs on the provider, not on the button: it is what puts `hl` on the URL the
              * Google script is loaded from, and the button has no say after that. Even invisible it
              * matters — it decides the language of the account-chooser popup the click opens.
              *
              * `resolvedLanguage` rather than `language`, for the same reason `nonExplicitSupportedLngs`
              * exists in i18n/index.js: `language` holds what was detected (`en-US`), while this holds
              * what the page is actually being rendered in.
              */}
            {/*
              * Google renders a 40px-tall `div[role=button]` (plus a 0x0 relay iframe, which is not it),
              * against our 48. So its wrapper is centred and stretched the rest of the way with `scale-y`:
              * a transform scales hit testing along with the pixels, where simply setting a height would
              * leave the top and bottom few pixels of what looks like a button doing nothing when clicked.
              * Distortion does not matter on something at zero opacity.
              *
              * Width is Google's 400px maximum and the wrapper clips it, so the hit area spans the whole
              * button at any card size, with nothing to measure or keep in sync as the viewport changes.
              */}
            <div className="absolute inset-0 flex cursor-pointer items-center overflow-hidden opacity-0 [&>div]:scale-y-125">
                <GoogleOAuthProvider clientId={clientId} locale={i18n.resolvedLanguage}>
                    <GoogleLogin
                        onSuccess={(response) => onCredential(response.credential)}
                        onError={onError}
                        text={text}
                        size="large"
                        width="400"
                    />
                </GoogleOAuthProvider>
            </div>
        </div>
    )
}
