/** "MX$193.0M" / "-MX$1.1B" - Monte Carlo amounts span orders of magnitude, so cards and axes use compact notation. */
export function compactCurrency(value, currency) {
  if (!Number.isFinite(value)) return "—";
  try {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
  } catch {
    return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
  }
}

export const pct = (value, digits = 1) =>
  Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "N/A";
