import { installMatchMedia } from './src/test/matchMedia'

// Node-environment tests have no `window` and this no-ops for them; jsdom ones get a working
// `matchMedia`, which several components now read on their first render.
installMatchMedia()
