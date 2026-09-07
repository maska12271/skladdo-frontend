import LegalDocument from '../components/LegalDocument'
import { LAST_UPDATED } from '../config/legal'

/**
 * Order the sections appear in. Content lives in the locale files under `terms.sections.*`.
 *
 * `billing` describes the service as it is charged *today*, which is not at all: there is no payment
 * provider wired up, the signup card step is a preview that stores nothing, and `PlanService` applies a
 * plan change immediately without taking money. When billing goes live that section and `plans` are what
 * change — see the note each one carries.
 */
const SECTIONS = [
    'acceptance', 'service', 'accounts', 'roles', 'plans', 'billing',
    'yourData', 'acceptableUse', 'email', 'partners', 'availability',
    'thirdParty', 'ip', 'liability', 'termination', 'changes', 'law', 'contact',
]

/**
 * The terms of service, at `/terms`. Public: they are what somebody agrees to by creating an account, so
 * they have to be readable before there is an account to read them with.
 */
export default function TermsPage() {
    return <LegalDocument namespace="terms" sections={SECTIONS} updated={LAST_UPDATED.terms} />
}
