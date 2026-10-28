/** Country helpers for ISO 3166-1 alpha-2 codes, built on Intl so no country list has to be shipped. */

let displayNames: Intl.DisplayNames | null | undefined;
let codeByName: Map<string, string> | null = null;

function names(): Intl.DisplayNames | null {
  if (displayNames === undefined) {
    displayNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
  }
  return displayNames;
}

export function countryName(code?: string): string {
  if (!code) return 'Unknown';
  return names()?.of(code.toUpperCase()) ?? code.toUpperCase();
}

/** Flag emoji from two regional-indicator symbols, e.g. "SE" -> 🇸🇪 */
export function countryFlag(code?: string): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '🏳️';
  return String.fromCodePoint(...code.toUpperCase().split('').map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Reverse lookup ("Sweden" -> "SE"), used for data that only has country names */
export function countryCodeFromName(name?: string): string | undefined {
  if (!name) return undefined;
  if (!codeByName) {
    codeByName = new Map();
    const dn = names();
    for (let a = 65; a <= 90 && dn; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const n = dn.of(code);
        if (n && n !== code) codeByName.set(n.toLowerCase(), code);
      }
    }
  }
  return codeByName.get(name.toLowerCase());
}

export const NORDIC_COUNTRIES = ['SE', 'NO', 'DK', 'FI', 'IS'];

/** The viewer's own country from the browser language (e.g. "sv-SE" -> "SE"), if it names one */
export function localCountry(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  for (const lang of navigator.languages || [navigator.language]) {
    const region = lang?.split('-')[1];
    if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  }
  return undefined;
}

/** Ransomware.live group names are lower-case slugs ("akira", "ransomhub"); title-case them for display */
export function groupDisplayName(name: string): string {
  return name === name.toLowerCase() ? name.replace(/(^|[\s-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase()) : name;
}
