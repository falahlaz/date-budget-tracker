/**
 * Merchant name normalisation (PRD section 7.3, NORMATIVE).
 *
 * `merchant` stores exactly what the user typed and is the only thing ever displayed.
 * `merchant_key` is this function's output and is the ONLY column allowed for GROUP BY,
 * dedupe and autocomplete matching -- without it "Bakmi GM", "bakmi gm " and "Bakmi-GM"
 * become three different places and the "where does the money go" report is useless.
 *
 * Whitespace is removed outright rather than collapsed, because spacing is one of the
 * biggest sources of spelling variation for the same place. Word order still matters, so
 * genuinely different places never collide.
 */
export function normalizeMerchant(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const key = raw
    .normalize('NFKD') // split diacritics off their base letter
    .replace(/[\u0300-\u036f]/g, '') // drop the diacritics ("Café" -> "Cafe")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // drop ALL whitespace, punctuation and symbols
  return key.length === 0 ? null : key;
}
