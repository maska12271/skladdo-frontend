// International dialling codes, keyed by the same country names `countries.js` stores verbatim on the
// entity. Keeping the two keyed alike is what lets a form preselect the code from the country already
// chosen on the record, with no ISO lookup in between.
//
// Codes only — no flags or ISO codes, because nothing here needs them and every extra column is one more
// thing to keep true. A country absent from this map simply gets no preselection; the picker still works.
export const DIAL_CODES = {
    Afghanistan: '+93', Albania: '+355', Algeria: '+213', Andorra: '+376', Angola: '+244',
    'Antigua and Barbuda': '+1268', Argentina: '+54', Armenia: '+374', Australia: '+61', Austria: '+43',
    Azerbaijan: '+994', Bahamas: '+1242', Bahrain: '+973', Bangladesh: '+880', Barbados: '+1246',
    Belarus: '+375', Belgium: '+32', Belize: '+501', Benin: '+229', Bhutan: '+975', Bolivia: '+591',
    'Bosnia and Herzegovina': '+387', Botswana: '+267', Brazil: '+55', Brunei: '+673', Bulgaria: '+359',
    'Burkina Faso': '+226', Burundi: '+257', Cambodia: '+855', Cameroon: '+237', Canada: '+1',
    'Cape Verde': '+238', 'Central African Republic': '+236', Chad: '+235', Chile: '+56', China: '+86',
    Colombia: '+57', Comoros: '+269', Congo: '+242', 'Costa Rica': '+506', Croatia: '+385', Cuba: '+53',
    Cyprus: '+357', Czechia: '+420', Denmark: '+45', Djibouti: '+253', Dominica: '+1767',
    'Dominican Republic': '+1809', Ecuador: '+593', Egypt: '+20', 'El Salvador': '+503',
    'Equatorial Guinea': '+240', Eritrea: '+291', Estonia: '+372', Eswatini: '+268', Ethiopia: '+251',
    Fiji: '+679', Finland: '+358', France: '+33', Gabon: '+241', Gambia: '+220', Georgia: '+995',
    Germany: '+49', Ghana: '+233', Greece: '+30', Grenada: '+1473', Guatemala: '+502', Guinea: '+224',
    'Guinea-Bissau': '+245', Guyana: '+592', Haiti: '+509', Honduras: '+504', Hungary: '+36',
    Iceland: '+354', India: '+91', Indonesia: '+62', Iran: '+98', Iraq: '+964', Ireland: '+353',
    Israel: '+972', Italy: '+39', 'Ivory Coast': '+225', Jamaica: '+1876', Japan: '+81', Jordan: '+962',
    Kazakhstan: '+7', Kenya: '+254', Kiribati: '+686', Kosovo: '+383', Kuwait: '+965', Kyrgyzstan: '+996',
    Laos: '+856', Latvia: '+371', Lebanon: '+961', Lesotho: '+266', Liberia: '+231', Libya: '+218',
    Liechtenstein: '+423', Lithuania: '+370', Luxembourg: '+352', Madagascar: '+261', Malawi: '+265',
    Malaysia: '+60', Maldives: '+960', Mali: '+223', Malta: '+356', 'Marshall Islands': '+692',
    Mauritania: '+222', Mauritius: '+230', Mexico: '+52', Micronesia: '+691', Moldova: '+373',
    Monaco: '+377', Mongolia: '+976', Montenegro: '+382', Morocco: '+212', Mozambique: '+258',
    Myanmar: '+95', Namibia: '+264', Nauru: '+674', Nepal: '+977', Netherlands: '+31',
    'New Zealand': '+64', Nicaragua: '+505', Niger: '+227', Nigeria: '+234', 'North Korea': '+850',
    'North Macedonia': '+389', Norway: '+47', Oman: '+968', Pakistan: '+92', Palau: '+680',
    Palestine: '+970', Panama: '+507', 'Papua New Guinea': '+675', Paraguay: '+595', Peru: '+51',
    Philippines: '+63', Poland: '+48', Portugal: '+351', Qatar: '+974', Romania: '+40', Russia: '+7',
    Rwanda: '+250', 'Saint Kitts and Nevis': '+1869', 'Saint Lucia': '+1758',
    'Saint Vincent and the Grenadines': '+1784', Samoa: '+685', 'San Marino': '+378',
    'Sao Tome and Principe': '+239', 'Saudi Arabia': '+966', Senegal: '+221', Serbia: '+381',
    Seychelles: '+248', 'Sierra Leone': '+232', Singapore: '+65', Slovakia: '+421', Slovenia: '+386',
    'Solomon Islands': '+677', Somalia: '+252', 'South Africa': '+27', 'South Korea': '+82',
    'South Sudan': '+211', Spain: '+34', 'Sri Lanka': '+94', Sudan: '+249', Suriname: '+597',
    Sweden: '+46', Switzerland: '+41', Syria: '+963', Taiwan: '+886', Tajikistan: '+992',
    Tanzania: '+255', Thailand: '+66', 'Timor-Leste': '+670', Togo: '+228', Tonga: '+676',
    'Trinidad and Tobago': '+1868', Tunisia: '+216', Turkey: '+90', Turkmenistan: '+993', Tuvalu: '+688',
    Uganda: '+256', Ukraine: '+380', 'United Arab Emirates': '+971', 'United Kingdom': '+44',
    'United States': '+1', Uruguay: '+598', Uzbekistan: '+998', Vanuatu: '+678', 'Vatican City': '+379',
    Venezuela: '+58', Vietnam: '+84', Yemen: '+967', Zambia: '+260', Zimbabwe: '+263',
}

/** Offered first in the picker, matching the country selector's own bias (this is an Estonian app). */
export const PRIORITY_DIAL_COUNTRIES = ['Estonia', 'Latvia', 'Lithuania', 'Finland', 'Sweden', 'Germany']

/**
 * Every distinct code, longest first.
 *
 * The ordering is what makes {@link splitPhone} correct: `+1` is a prefix of `+1868`, so matching in
 * arbitrary order would read a Trinidad number as an American one and leave "868…" in the national part.
 */
const CODES_BY_LENGTH = [...new Set(Object.values(DIAL_CODES))].sort((a, b) => b.length - a.length)

/** The dialling code for a country name, or null when it is unknown/absent. */
export function dialCodeFor(country) {
    return DIAL_CODES[country] || null
}

/**
 * Splits a stored phone string into `{ code, number }`.
 *
 * A number that carries no recognised code comes back with `code: null` and the whole string as the
 * national part, so pre-existing free-text values keep displaying exactly as they were typed rather than
 * being reinterpreted or silently truncated.
 */
export function splitPhone(value) {
    const raw = (value || '').trim()
    if (!raw.startsWith('+')) {
        return { code: null, number: raw }
    }
    const compact = raw.replace(/[\s()-]/g, '')
    const code = CODES_BY_LENGTH.find((c) => compact.startsWith(c))
    return code
        ? { code, number: compact.slice(code.length) }
        : { code: null, number: raw }
}

/** The inverse of {@link splitPhone}: what actually gets stored on the entity. */
export function joinPhone(code, number) {
    const national = (number || '').trim()
    if (!national) {
        // A code on its own is not a phone number, so an emptied field stores nothing rather than "+372".
        return ''
    }
    return code ? `${code} ${national}` : national
}

/**
 * Picker options: the usual suspects first, then every country with a code, alphabetically.
 *
 * Deduplicated **by code, not by country**. A dozen countries share one — +1 is Canada and the United
 * States, +7 is Russia and Kazakhstan — and one option per country would mean several entries with the
 * same value, which is both a duplicate React key and a list where picking either does the same thing.
 * The countries that lose the label are folded into `search`, so looking up "Kazakhstan" still finds +7.
 */
export function buildDialOptions(currentCode) {
    const byCode = new Map()
    const add = (country) => {
        const code = DIAL_CODES[country]
        if (!code) return
        const existing = byCode.get(code)
        if (existing) {
            existing.search += ` ${country}`
            return
        }
        // The code leads so the closed control reads correctly when the label is truncated; `search` is
        // what CustomSelect matches on besides the label, so the list is still findable by country name.
        byCode.set(code, { value: code, label: `${code}  ${country}`, search: `${country} ${code}` })
    }

    PRIORITY_DIAL_COUNTRIES.forEach(add)
    Object.keys(DIAL_CODES).sort((a, b) => a.localeCompare(b)).forEach(add)

    const options = [...byCode.values()]
    // A stored code no country in the map claims still has to render, or editing the record would
    // silently move the number to a different country.
    if (currentCode && !byCode.has(currentCode)) {
        options.unshift({ value: currentCode, label: currentCode })
    }
    return options
}
