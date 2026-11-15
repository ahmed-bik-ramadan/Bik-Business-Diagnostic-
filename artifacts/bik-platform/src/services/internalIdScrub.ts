/**
 * Internal identifiers never reach client-facing text.
 *
 * Question codes (u06, hd01, cod02), formula keys (fnb_food_waste), answer ids
 * (high_commit) and field-name pairs (hasDebt / debtMonthlyPct) are engineering
 * vocabulary. The client, the owner message and the consultant's WhatsApp receive
 * Arabic prose only. Ordinary words a client may legitimately see (BIK, USD, KPI)
 * carry no digits and no underscore pairs, so they pass untouched.
 */

// snake_case and kebab-case keys with two or more segments: fnb_food_waste, re_cancellation_leak.
const MULTI_PART_ID_LIKE = /\b[a-zA-Z][a-zA-Z0-9]*(?:[_-][a-zA-Z0-9]+)+\b/g;
// Short letter+digits codes: u06, hd01, s11, cod02, ud01. Requires a Latin run of one to
// four letters directly followed by one to three digits, standing alone.
const SHORT_CODE_LIKE = /(?<![a-zA-Z0-9_])[a-zA-Z]{1,4}\d{1,3}(?![a-zA-Z0-9_])/g;
// Slash-separated Latin identifier chains: hasDebt / debtMonthlyPct. In Arabic business
// prose a Latin chain around slashes is always a field reference, never a phrase.
const FIELD_CHAIN_LIKE = /\b[a-zA-Z][a-zA-Z0-9]*(?:\s*\/\s*[a-zA-Z][a-zA-Z0-9]+)+\b/g;

/** Removes every id-shaped token from a display string, then repairs the leftover seams. */
export function scrubInternalIds(text: string): string {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(MULTI_PART_ID_LIKE, '')
    .replace(FIELD_CHAIN_LIKE, '')
    .replace(SHORT_CODE_LIKE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\(\s*([،.؛:.])/g, '$1')
    .replace(/\s+([،.؛:.])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** True when a string still carries at least one id-shaped token. */
export function hasInternalId(text: string): boolean {
  if (!text) return false;
  const hit = MULTI_PART_ID_LIKE.test(text) || SHORT_CODE_LIKE.test(text) || FIELD_CHAIN_LIKE.test(text);
  MULTI_PART_ID_LIKE.lastIndex = 0;
  SHORT_CODE_LIKE.lastIndex = 0;
  FIELD_CHAIN_LIKE.lastIndex = 0;
  return hit;
}
