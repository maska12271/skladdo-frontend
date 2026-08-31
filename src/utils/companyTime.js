// Converting between a wall-clock date + time (what DateField and TimeField hand over) and a real
// instant, in the *company's* timezone rather than the browser's.
//
// Neither field carries a zone: together they name a reading on a clock and leave the meaning to the
// page. Left to the browser's own zone, a colleague travelling (or simply a laptop set to the wrong
// place) would schedule an email an hour out from what everyone else on the team reads on the same
// screen. The company timezone is the one reading everybody shares, so it is the one used here.
//
// The offset is measured with Intl at that particular moment, so daylight saving comes from the same
// data the rest of the app formats dates with instead of being assumed.
//
// `hourCycle: 'h23'` rather than `hour12: false`: the latter lets an engine report midnight as hour "24",
// which parses as the wrong day.

const PARTS = {
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
}

function partsIn(date, timezone, withSeconds) {
    return new Intl.DateTimeFormat('en-CA', {
        ...(timezone ? { timeZone: timezone } : {}),
        ...PARTS,
        ...(withSeconds ? { second: '2-digit' } : {}),
    }).formatToParts(date).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {})
}

/**
 * The instant that a wall-clock date and time name in `timezone`.
 *
 * @param {string} date  ISO `yyyy-MM-dd`, as DateField reports it
 * @param {string} time  24-hour `HH:mm`, as TimeField reports it
 * @param {string|null} timezone  IANA zone; null falls back to the browser's own
 * @returns {string|null} an ISO instant, or null when either half is missing
 */
export function localPartsToInstant(date, time, timezone) {
    if (!date || !time) return null
    const value = `${date}T${time}`
    const asUtc = new Date(`${value}:00Z`)
    if (Number.isNaN(asUtc.getTime())) return null
    if (!timezone) return new Date(`${value}:00`).toISOString()
    // What the zone calls that UTC instant, read back as if it were UTC, gives the offset to remove.
    const parts = partsIn(asUtc, timezone, true)
    const seenAsUtc = Date.parse(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)
    return new Date(asUtc.getTime() * 2 - seenAsUtc).toISOString()
}

/**
 * The inverse: how `timezone` reads an instant, split into the two fields' own shapes. Paired with
 * {@link localPartsToInstant} so a time opened for editing round-trips to exactly what it already was.
 *
 * @returns {{date: string, time: string}} empty strings when there is nothing to read
 */
export function instantToLocalParts(instant, timezone) {
    if (!instant) return { date: '', time: '' }
    const date = new Date(instant)
    if (Number.isNaN(date.getTime())) return { date: '', time: '' }
    const parts = partsIn(date, timezone, false)
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}`,
    }
}
