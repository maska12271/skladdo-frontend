// @vitest-environment jsdom
//
// What an invited colleague is asked for when they accept with Google, which is the whole point of the
// Google path: their name and address come from the verified token, so the form must not ask again — and
// must not let them edit what it shows, because the server reads those from the token and would silently
// ignore an edit. The two things Google does NOT supply, their date of birth and a photo, still have to be
// asked for. Getting this wrong is invisible in a build and in a click-through by anyone who already knows
// which fields to expect.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'

const apiGet = vi.fn()
const apiPost = vi.fn()
vi.mock('../api/client', () => ({
    apiGet: (...args) => apiGet(...args),
    apiPost: (...args) => apiPost(...args),
}))

// Google's own component reaches for accounts.google.com on mount, which a test must not do. Stubbed to a
// plain button handing back a credential, so what is exercised here is this page's reaction to one.
vi.mock('@react-oauth/google', () => ({
    GoogleOAuthProvider: ({ children }) => <div>{children}</div>,
    GoogleLogin: ({ onSuccess }) => (
        <button type="button" onClick={() => onSuccess({ credential: ID_TOKEN })}>google</button>
    ),
}))

const { default: JoinPage } = await import('./JoinPage')

/** A syntactically real ID token — this page decodes the payload to show whose account it will be. */
function idTokenFor(claims) {
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(claims))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `header.${b64}.signature`
}

const ID_TOKEN = idTokenFor({ email: 'kart@acme.test', name: 'Kärt Sõber', email_verified: true, sub: '42' })

const renderPage = () => render(
    <MemoryRouter initialEntries={['/join?token=invite-token']}><JoinPage /></MemoryRouter>,
)

/** Lets the invitation lookup settle inside act(), so the form is rendered. */
const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com')
    apiGet.mockReset()
    apiPost.mockReset()
    apiGet.mockResolvedValue({ valid: true, companyName: 'Nordic Trade OÜ' })
    apiPost.mockResolvedValue({ companyName: 'Nordic Trade OÜ' })
})

afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
})

/** Renders the page and accepts the Google credential, leaving the form in its post-sign-in state. */
async function signInWithGoogle() {
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'google' }))
}

describe('JoinPage with Google', () => {
    it('asks for a name, address and password when Google is not used', async () => {
        renderPage()
        await flush()

        expect(screen.getByLabelText(/your name/i)).toBeEnabled()
        expect(screen.getByLabelText(/your email/i)).toBeEnabled()
        expect(document.querySelector('#join-password')).toBeInTheDocument()
    })

    it('takes the name and address from Google, and will not let them be edited', async () => {
        await signInWithGoogle()

        const name = screen.getByLabelText(/your name/i)
        const email = screen.getByLabelText(/your email/i)
        expect(name).toHaveValue('Kärt Sõber')
        expect(email).toHaveValue('kart@acme.test')
        // Disabled because the server reads both from the token; an editable field would be a lie.
        expect(name).toBeDisabled()
        expect(email).toBeDisabled()
    })

    it('stops asking for a password once Google has authenticated them', async () => {
        await signInWithGoogle()

        // Gone rather than merely disabled: a disabled `required` field blocks form submission.
        expect(document.querySelector('#join-password')).not.toBeInTheDocument()
        expect(document.querySelector('#join-confirm')).not.toBeInTheDocument()
    })

    it('still asks for the date of birth and a photo, which Google does not supply', async () => {
        await signInWithGoogle()

        const birthDate = document.querySelector('#join-birth-date')
        expect(birthDate).toBeInTheDocument()
        expect(birthDate).toBeRequired()
        expect(screen.getByText(/profile picture/i)).toBeInTheDocument()
    })

    it('sends the token and the date of birth, and no name, address or password', async () => {
        await signInWithGoogle()

        // The date goes through the app's own picker, which parses the company's display order and only
        // commits on blur — hence MM/dd/yyyy in, ISO out. See DateField.test.jsx.
        const birthDate = document.querySelector('#join-birth-date')
        fireEvent.change(birthDate, { target: { value: '04/17/1990' } })
        fireEvent.blur(birthDate)
        await act(async () => {
            fireEvent.submit(document.querySelector('form'))
        })

        expect(apiPost).toHaveBeenCalledTimes(1)
        const [path, body] = apiPost.mock.calls[0]
        expect(path).toBe('/public/user-invite/google')
        expect(body).toMatchObject({ token: 'invite-token', idToken: ID_TOKEN, birthDate: '1990-04-17' })
        // The claims travel inside the signed token only. Sending them alongside would raise the question
        // of which copy the server honoured.
        expect(body).not.toHaveProperty('fullName')
        expect(body).not.toHaveProperty('email')
        expect(body).not.toHaveProperty('password')
    })

    it('goes back to the password form if they change their mind', async () => {
        await signInWithGoogle()
        fireEvent.click(screen.getByRole('button', { name: /use a password instead/i }))

        expect(document.querySelector('#join-password')).toBeInTheDocument()
        expect(screen.getByLabelText(/your name/i)).toBeEnabled()
    })
})
