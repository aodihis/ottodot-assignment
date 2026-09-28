/**
 * The API sends money as a JSON number at 2 decimal places, so this only has to
 * pin the formatting — `50` and `100` would otherwise render without their cents.
 *
 * `currency` is optional because a class payload carries a price but no currency
 * (a booking does), and inventing one here would be the UI making up a fact.
 */
export function formatMoney(amount: number, currency?: string): string {
  return currency ? `${currency} ${amount.toFixed(2)}` : amount.toFixed(2);
}
