// The selectable paid plans, shared by the landing page (pricing) and the register page (plan picker).
// Caps mirror PlanType on the backend; prices are the current placeholders. There is no free tier —
// every new company picks one of these and gets its first month before the first payment.
export const UNLIMITED = -1

export const PLANS = [
    { id: 'STARTER', price: 29, popular: true, caps: { users: 5, manufacturers: 25, products: 250 } },
    { id: 'BUSINESS', price: 79, popular: false, caps: { users: 25, manufacturers: UNLIMITED, products: UNLIMITED } },
    { id: 'ENTERPRISE', price: 199, popular: false, caps: { users: UNLIMITED, manufacturers: UNLIMITED, products: UNLIMITED } },
]

export const PLAN_IDS = PLANS.map((p) => p.id)

export const DEFAULT_PLAN = 'STARTER'
