/**
 * The name and address inside a Google ID token, so a form can show whose account is about to be created
 * instead of asking for what Google has already said.
 *
 * Reading the payload is not verifying it, and nothing here is trusted: the server checks the token's
 * signature and reads its own copy of these claims, so editing this in a debugger changes only what the
 * page displays. Returns blanks rather than throwing on a token it cannot parse — the server is about to
 * reject that token anyway, with a better message than a console error.
 */
export function readGoogleProfile(idToken) {
    try {
        const b64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const bytes = Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (ch) => ch.charCodeAt(0))
        // Decoded as UTF-8 rather than through the raw bytes, or every non-ASCII name arrives mojibake.
        const claims = JSON.parse(new TextDecoder().decode(bytes))
        return { email: claims.email || '', name: claims.name || '' }
    } catch {
        return { email: '', name: '' }
    }
}
