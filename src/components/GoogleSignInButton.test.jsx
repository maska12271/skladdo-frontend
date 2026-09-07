// @vitest-environment jsdom
//
// The Google button is the one part of sign-in that an installation can be without: no client id means no
// Google sign-in, and the button — along with the "or" divider the pages draw beside it — has to disappear
// rather than sit there inert. That switch is what this covers, because getting it wrong is invisible in
// the configured case that everyone develops against and only shows up on an installation that has no
// Google project.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import '../i18n'
import GoogleSignInButton from './GoogleSignInButton'

// Google's own component reaches for accounts.google.com the moment it mounts, which a test must not do.
// Stubbed down to a plain button that hands back a credential, so what is asserted here is our wiring:
// whether the thing renders at all, and whether the token reaches the caller unchanged.
vi.mock('@react-oauth/google', () => ({
    GoogleOAuthProvider: ({ children }) => <div data-testid="google-provider">{children}</div>,
    GoogleLogin: ({ onSuccess }) => (
        <button type="button" onClick={() => onSuccess({ credential: 'an.id.token' })}>
            Google
        </button>
    ),
}))

afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
})

describe('GoogleSignInButton', () => {
    it('renders nothing when the build has no Google client id', () => {
        vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')

        const { container } = render(<GoogleSignInButton onCredential={() => {}} />)

        // Not merely hidden: the provider is never mounted, so nothing is fetched from Google either.
        expect(container).toBeEmptyDOMElement()
        expect(screen.queryByTestId('google-provider')).not.toBeInTheDocument()
    })

    it('renders the button when a client id is configured', () => {
        vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com')

        render(<GoogleSignInButton onCredential={() => {}} />)

        expect(screen.getByTestId('google-provider')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument()
    })

    it('hands the raw ID token to the caller', () => {
        vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com')
        const onCredential = vi.fn()

        render(<GoogleSignInButton onCredential={onCredential} />)
        screen.getByRole('button', { name: 'Google' }).click()

        // The token travels untouched: only the server may take it apart, because only the server can
        // check the signature that makes any of its claims worth reading.
        expect(onCredential).toHaveBeenCalledWith('an.id.token')
    })
})
