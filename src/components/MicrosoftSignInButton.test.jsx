// @vitest-environment jsdom
//
// Same reason as GoogleSignInButton.test.jsx: an installation with no client id must genuinely have no
// Microsoft sign-in, which is invisible in the configured case everyone develops against. This button also
// has no iframe overlay to get subtly wrong — unlike Google's, it is a real button from the first pixel —
// so what is worth pinning here is that a click actually reaches MSAL and that the resulting ID token
// reaches the caller unchanged.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import '../i18n'

const loginPopup = vi.fn()
const initialize = vi.fn().mockResolvedValue(undefined)

vi.mock('@azure/msal-browser', () => ({
    // A real `function`, not an arrow one: the component calls this with `new`, and an arrow function is
    // natively non-constructible - the mock has to behave like the class it stands in for. Returning a
    // plain object from a constructor function makes `new` yield that object instead of `this`.
    PublicClientApplication: vi.fn().mockImplementation(function MockPublicClientApplication() {
        return { initialize, loginPopup }
    }),
}))

const { default: MicrosoftSignInButton } = await import('./MicrosoftSignInButton')
const { PublicClientApplication } = await import('@azure/msal-browser')

afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
})

describe('MicrosoftSignInButton', () => {
    // Must run before anything else in this file creates the module-level MSAL singleton (see the
    // component's own comment on why one exists) - it is the one assertion here that needs a clean slate,
    // which declaration order gives it since Vitest runs a file's tests in the order they are written.
    it('renders nothing, and builds no MSAL instance, when the build has no Microsoft client id', () => {
        vi.stubEnv('VITE_MICROSOFT_CLIENT_ID', '')

        const { container } = render(<MicrosoftSignInButton onCredential={() => {}} />)

        expect(container).toBeEmptyDOMElement()
        expect(PublicClientApplication).not.toHaveBeenCalled()
    })

    it('renders a real, focusable button when a client id is configured', () => {
        vi.stubEnv('VITE_MICROSOFT_CLIENT_ID', 'test-client-id')

        render(<MicrosoftSignInButton onCredential={() => {}} label="Sign in with Microsoft" />)

        const button = screen.getByRole('button', { name: 'Sign in with Microsoft' })
        expect(button).toBeInTheDocument()
        expect(button).not.toBeDisabled()
    })

    it('hands the raw ID token to the caller on a successful popup', async () => {
        vi.stubEnv('VITE_MICROSOFT_CLIENT_ID', 'test-client-id')
        loginPopup.mockResolvedValueOnce({ idToken: 'an.id.token' })
        const onCredential = vi.fn()

        render(<MicrosoftSignInButton onCredential={onCredential} label="Sign in with Microsoft" />)
        fireEvent.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }))
        await vi.waitFor(() => expect(onCredential).toHaveBeenCalledWith('an.id.token'))

        // openid+email+profile: the same three claims Skladdo actually reads out of the token.
        expect(loginPopup).toHaveBeenCalledWith({ scopes: ['openid', 'profile', 'email'] })
    })

    it('reports popup failure or dismissal through onError, not as an unhandled rejection', async () => {
        vi.stubEnv('VITE_MICROSOFT_CLIENT_ID', 'test-client-id')
        const popupError = new Error('user_cancelled')
        loginPopup.mockRejectedValueOnce(popupError)
        const onCredential = vi.fn()
        const onError = vi.fn()

        render(<MicrosoftSignInButton onCredential={onCredential} onError={onError} label="Sign in with Microsoft" />)
        fireEvent.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }))
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(popupError))

        expect(onCredential).not.toHaveBeenCalled()
    })

    it('reuses the same MSAL instance across repeated clicks', async () => {
        // A relative check, not an absolute one: `PublicClientApplication` may already have been built by
        // an earlier test in this file, since the component's singleton is module-level by design and
        // Vitest does not give each test its own module instance. What must hold regardless of history is
        // that a SECOND click builds no additional instance beyond however many already existed.
        vi.stubEnv('VITE_MICROSOFT_CLIENT_ID', 'test-client-id')
        loginPopup.mockResolvedValue({ idToken: 'an.id.token' })

        render(<MicrosoftSignInButton onCredential={() => {}} label="Sign in with Microsoft" />)
        const button = screen.getByRole('button', { name: 'Sign in with Microsoft' })

        fireEvent.click(button)
        await vi.waitFor(() => expect(loginPopup).toHaveBeenCalledTimes(1))
        const instancesAfterFirstClick = PublicClientApplication.mock.calls.length

        fireEvent.click(button)
        await vi.waitFor(() => expect(loginPopup).toHaveBeenCalledTimes(2))

        expect(PublicClientApplication.mock.calls.length).toBe(instancesAfterFirstClick)
    })
})
