// The operator's identity and the dates the legal documents last changed — the facts the privacy policy,
// cookie policy and terms all have to agree on, kept in one place so they cannot drift apart.
//
// **The entity fields below are placeholders and must be filled in before launch.** A GDPR controller
// notice is expected to name the controller, its registry code and its registered address, and terms of
// service are only enforceable by a party that is actually identified. Until they are real, the pages
// render a visible "not yet published" line rather than a convincing-looking lie — see `isEntityPublished`.

/**
 * The company that operates Skladdo and is the counterparty to every account.
 *
 * Fill each TODO with the value from the commercial register. Nothing else needs changing: all three
 * legal pages read this object, and the one that is displayed differently when it is incomplete
 * (the controller/contracting-party block) handles that itself.
 */
export const LEGAL_ENTITY = {
    /** Registered company name, exactly as it appears in the register (e.g. 'Skladdo OÜ'). */
    name: 'TODO_LEGAL_NAME',
    /** Commercial-register code (Estonian: äriregistri kood, 8 digits). */
    registryCode: 'TODO_REGISTRY_CODE',
    /** VAT number, or null when the company is not VAT-registered — the row is then omitted. */
    vatNumber: null,
    /** Registered address, one line: street, city, postal code. */
    address: 'TODO_REGISTERED_ADDRESS',
    /** Country of establishment. Decides which supervisory authority and which law the terms name. */
    country: 'Estonia',
}

/** Where to write about any of the three documents, and the address the GDPR requests go to. */
export const LEGAL_CONTACT_EMAIL = 'support@skladdo.eu'

/** The site the documents describe, used where they have to refer to the service by address. */
export const SERVICE_URL = 'https://skladdo.eu'

/**
 * Whether {@link LEGAL_ENTITY} has been filled in. False while any required field is still a TODO, which
 * is what makes an unfinished entity block say so instead of printing the literal word "TODO" at a
 * customer — the failure mode this check exists to prevent.
 */
export const isEntityPublished = () =>
    ![LEGAL_ENTITY.name, LEGAL_ENTITY.registryCode, LEGAL_ENTITY.address]
        .some((value) => !value || value.startsWith('TODO_'))

/**
 * When each document last changed, as a constant rather than a build timestamp: it states when the
 * *document* changed, which is a decision somebody makes, not a side effect of deploying an unrelated fix.
 *
 * Bump the one you edited. The pages format these in the reader's own locale.
 */
export const LAST_UPDATED = {
    privacy: '2026-09-07',
    cookies: '2026-09-07',
    terms: '2026-09-07',
}
