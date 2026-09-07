import LegalDocument from '../components/LegalDocument'
import { LAST_UPDATED } from '../config/legal'

/**
 * Order the sections appear in. Content lives in the locale files under `cookies.sections.*`.
 *
 * The `stored` section is the one that has to stay true as the app changes: it names the actual keys the
 * application writes to `localStorage`. Adding a new one without adding it there makes this page wrong.
 */
const SECTIONS = [
    'summary', 'whatCookies', 'noCookies', 'stored', 'google',
    'emailPixel', 'thirdParty', 'consent', 'control', 'changes', 'contact',
]

/**
 * The cookie policy, at `/cookies`. Public, and reachable without an account — the people it concerns
 * most are visitors who have not signed in.
 */
export default function CookiesPage() {
    return <LegalDocument namespace="cookies" sections={SECTIONS} updated={LAST_UPDATED.cookies} />
}
