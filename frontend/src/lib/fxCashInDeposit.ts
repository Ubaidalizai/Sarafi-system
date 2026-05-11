/** Parses server-generated FX CASH-IN deposit notes (see backend exchange + deposit create). */
const FX_NOTE =
  /^FX CASH-IN\s+([A-Z]{2,10})->([A-Z]{2,10})\s+@\s+([0-9]+(?:\.[0-9]+)?)(?:\s+\|\s+fee\s+([0-9]+(?:\.[0-9]+)?))?/i;

export type ParsedFxCashIn = {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  fee: number;
};

export function parseFxCashInNote(note: string | null | undefined): ParsedFxCashIn | null {
  const m = FX_NOTE.exec((note || "").trim());
  if (!m) return null;
  const rate = Number(m[3]);
  const fee = Number(m[4] || 0);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { fromCurrency: m[1].toUpperCase(), toCurrency: m[2].toUpperCase(), rate, fee };
}

/** Source (cash-in) amount implied by credited target net, rate, and fee in target currency. */
export function sourceAmountFromFxTarget(targetNet: number, rate: number, fee: number): number {
  return (targetNet + fee) / rate;
}
