/** Stable labels for <select> options: duplicate Pashto names get a short id suffix (RTL-safe). */
export function buildCustomerOptionLabels(
  customers: Array<{ id: string; fullName: string }>
): Map<string, string> {
  const nameOccurrences = new Map<string, number>();
  for (const c of customers) {
    const key = (c.fullName || "").trim().normalize("NFC");
    nameOccurrences.set(key, (nameOccurrences.get(key) || 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const c of customers) {
    const key = (c.fullName || "").trim().normalize("NFC");
    const dup = (nameOccurrences.get(key) || 0) > 1;
    const base = (c.fullName || "").trim() || "—";
    labels.set(c.id, dup ? `${base}\u200E · ${c.id.slice(-6)}` : base);
  }
  return labels;
}
