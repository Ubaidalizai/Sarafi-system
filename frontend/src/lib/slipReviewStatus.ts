/** Coerce API / DB values so controlled <select> always matches an option value. */
export function normalizeSlipReviewStatus(v: string | null | undefined): "waiting" | "confirmed" | "rejected" {
  if (v === "confirmed" || v === "rejected" || v === "waiting") return v;
  return "waiting";
}
