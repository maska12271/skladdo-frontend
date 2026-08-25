// The selectable paid plans, shared by the landing page (pricing) and the register page (plan picker).
// Prices are the current placeholders. There is no free tier — every new company picks one of these and
// gets its first month before the first payment.
//
// A tier meters **seats and nothing else**, mirroring PlanType on the backend: catalogue size is the work
// a customer does in the product, not the value they take out of it, and capping it lands as a wall in
// the middle of an import.
export const UNLIMITED = -1

export const PLANS = [
    { id: 'STARTER', price: 29, popular: true, users: 5 },
    { id: 'BUSINESS', price: 79, popular: false, users: 25 },
    { id: 'ENTERPRISE', price: 199, popular: false, users: UNLIMITED },
]

export const PLAN_IDS = PLANS.map((p) => p.id)

/**
 * The purchasable extras, in the order the signup form offers them. Prices mirror AddonType on the
 * backend, which is also what enforces them — nothing here is trusted at checkout.
 *
 * Not a feature toggle: without the add-on the pages are gone and their endpoints are closed, which is
 * why signup asks up front rather than leaving it to be discovered in Settings.
 */
export const ADDONS = [
    { id: 'TENDERS', price: 15 },
    { id: 'MANUFACTURER_EMAILS', price: 19 },
]

export const ADDON_IDS = ADDONS.map((a) => a.id)

/** The monthly bill for a plan plus the chosen add-ons. */
export function monthlyTotal(planId, addonIds = []) {
    const plan = PLANS.find((p) => p.id === planId)
    return ADDONS.reduce(
        (sum, addon) => sum + (addonIds.includes(addon.id) ? addon.price : 0),
        plan ? plan.price : 0,
    )
}

export const DEFAULT_PLAN = 'STARTER'
