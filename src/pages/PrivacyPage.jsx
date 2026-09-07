import LegalDocument from '../components/LegalDocument'
import { LAST_UPDATED } from '../config/legal'

/**
 * Order the sections appear in. The content lives entirely in the locale files under `privacy.sections.*`
 * — see `LegalDocument`, which all three legal pages share.
 */
const SECTIONS = [
    'controller', 'collect', 'google', 'use', 'legal', 'sharing',
    'location', 'retention', 'rights', 'tracking', 'storage', 'security',
    'children', 'changes', 'contact',
]

/**
 * The privacy policy, at `/privacy`. Public, and deliberately reachable without an account: Google's
 * consent screen links straight here from the "Sign in with Google" dialog, which is shown to people who
 * by definition have not signed in yet.
 */
export default function PrivacyPage() {
    return <LegalDocument namespace="privacy" sections={SECTIONS} updated={LAST_UPDATED.privacy} />
}
