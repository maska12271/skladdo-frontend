/**
 * The dim behind anything that covers the page: modals, the nav drawer, the quick-create sheet.
 *
 * One constant because there were three different values in the app — `bg-slate-950/60` with a small
 * blur, `bg-slate-900/50` with a 1px blur, and `bg-slate-950/70` with no blur at all — so which one you
 * got depended on which control you happened to open. Anything that dims the page should import this
 * rather than write its own.
 */
export const OVERLAY_BACKDROP = 'bg-slate-950/60 backdrop-blur-sm'
