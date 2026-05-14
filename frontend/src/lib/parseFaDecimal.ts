/** Parse amount from Persian/Arabic digits and common separators. */
export function parseFaDecimal(value: string): number {
  const normalized = value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/٬/g, "")
    .replace(/,/g, "")
    .replace(/،/g, ".")
    .trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}
