type SlipPrintRow = {
  slipCode: string;
  customer?: { fullName: string; phone?: string | null } | null;
  currencyCode: string;
  amount: string;
  receiverName?: string | null;
  paidToName?: string | null;
  note?: string | null;
  createdAt: string;
};

function escHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Opens a minimal slip receipt window and triggers print. */
export function printSlipDocument(
  slip: SlipPrintRow,
  labels: Record<string, string> & { slipStatusValue: string; slipReviewValue: string; slipPrintHeading: string }
) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rows: [string, string][] = [
    [labels.slipCode, slip.slipCode],
    [labels.customers, slip.customer?.fullName?.trim() || "—"],
    [labels.accountName, slip.receiverName?.trim() || "—"],
    [labels.slipPaidToName, slip.paidToName?.trim() || "—"],
    [labels.currency, slip.currencyCode],
    [labels.amount, String(Number(slip.amount))],
    [labels.status, labels.slipStatusValue],
    [labels.slipReviewStatus, labels.slipReviewValue],
    [labels.createdAt, slip.createdAt],
  ];
  if (slip.note?.trim()) rows.push([labels.notes, slip.note.trim()]);
  const body = rows
    .map(
      ([k, v]) =>
        `<div class="r"><span class="k">${escHtml(k)}</span><span class="v">${escHtml(v)}</span></div>`
    )
    .join("");
  w.document.write(`<!DOCTYPE html><html lang="ps" dir="rtl"><head><meta charset="utf-8"><title>${escHtml(
    slip.slipCode
  )}</title><style>
body{font-family:system-ui,Tahoma,sans-serif;padding:20px;max-width:420px;margin:0 auto;color:#111}
h1{font-size:1rem;margin:0 0 16px;font-weight:800}
.r{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #e5e7eb;font-size:13px}
.k{color:#555;font-weight:650}.v{font-weight:700;text-align:left}
</style></head><body>
<h1>${escHtml(labels.slipPrintHeading)}</h1>
${body}
<script>addEventListener("load",function(){setTimeout(function(){print()},150)})<\/script>
</body></html>`);
  w.document.close();
}
