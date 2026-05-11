import type { ReactNode } from "react";
import { Fragment } from "react";
import { FormModal } from "./FormModal";
import { formatGregorianDate } from "../lib/formatDate";
import { parseFxCashInNote, sourceAmountFromFxTarget } from "../lib/fxCashInDeposit";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Hidden at every nesting level (internal DB ids, foreign keys, audit timestamps). */
const HIDDEN_DETAIL_KEYS = new Set(["id", "createdAt", "updatedAt", "customerId", "partnerId"]);

function isHiddenDetailKey(key: string): boolean {
  if (HIDDEN_DETAIL_KEYS.has(key)) return true;
  if (key === "idNumber") return false;
  if (/Id$/i.test(key)) return true;
  return false;
}

/** i18n key for each API field name (falls back to fieldGeneric + humanized key). */
const FIELD_TO_I18N: Record<string, string> = {
  fullName: "fullName",
  phone: "phone",
  idNumber: "idNumber",
  notes: "notes",
  note: "notes",
  currencyCode: "currency",
  amount: "amount",
  balance: "balance",
  status: "status",
  slipCode: "slipCode",
  receiverName: "accountName",
  paidToName: "slipPaidToName",
  paidAt: "fieldPaidAt",
  customer: "customers",
  partner: "partners",
  name: "partnerName",
  country: "country",
  city: "city",
  contact: "contact",
  direction: "direction",
  beneficiaryName: "beneficiaryName",
  referenceNo: "referenceNo",
  reconciliationStatus: "reconciliationStatus",
};

const KEY_SORT_PRIORITY = [
  "fullName",
  "name",
  "slipCode",
  "phone",
  "idNumber",
  "currencyCode",
  "amount",
  "balance",
  "status",
  "direction",
  "reconciliationStatus",
  "beneficiaryName",
  "referenceNo",
  "receiverName",
  "paidToName",
  "note",
  "notes",
  "contact",
  "country",
  "city",
  "customer",
  "partner",
  "paidAt",
];

function sortKeys(keys: string[]) {
  return [...keys].sort((a, b) => {
    const ia = KEY_SORT_PRIORITY.indexOf(a);
    const ib = KEY_SORT_PRIORITY.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

function labelForField(key: string, t: (k: string) => string): string {
  const mapped = FIELD_TO_I18N[key];
  if (mapped) return t(mapped);
  return `${t("fieldGeneric")}: ${key}`;
}

function formatScalarCell(key: string, val: string, t: (k: string) => string): string {
  if ((key === "paidAt" || key.endsWith("At")) && ISO_DATE.test(val)) {
    return formatGregorianDate(val);
  }
  if ((key === "amount" || key === "balance") && val.trim() !== "" && Number.isFinite(Number(val))) {
    return Number(val).toLocaleString("fa-AF");
  }
  if (key === "status" && ["issued", "paid", "cancelled", "expired"].includes(val)) {
    return t(val);
  }
  if (key === "direction" && (val === "in" || val === "out")) {
    return val === "in" ? t("incomingDirection") : t("outgoingDirection");
  }
  if (key === "reconciliationStatus" && ["pending", "confirmed", "disputed"].includes(val)) {
    return t(val);
  }
  return val;
}

type Translate = (key: string, options?: Record<string, string | number>) => string;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  record: unknown;
  closeLabel: string;
  t: Translate;
  /** Uppercase currency code → localized name (e.g. for FX deposit narrative). */
  currencyNames?: Record<string, string>;
};

function depositFxNarrativePashto(record: unknown, t: Translate, currencyNames?: Record<string, string>): string | null {
  if (!record || typeof record !== "object") return null;
  const o = record as Record<string, unknown>;
  if (typeof o.currencyCode !== "string" || o.amount === undefined) return null;
  const note = typeof o.note === "string" ? o.note : null;
  const parsed = parseFxCashInNote(note);
  if (!parsed) return null;
  const targetNet = Number(o.amount);
  if (!Number.isFinite(targetNet)) return null;

  const sourceAmount = sourceAmountFromFxTarget(targetNet, parsed.rate, parsed.fee);
  let customerName = "—";
  const cust = o.customer;
  if (cust && typeof cust === "object" && cust !== null && "fullName" in cust) {
    const fn = (cust as { fullName?: unknown }).fullName;
    if (typeof fn === "string" && fn.trim()) customerName = fn.trim();
  }

  const code = (c: string) => c.toUpperCase();
  const srcC = code(parsed.fromCurrency);
  const tgtC = code(parsed.toCurrency);
  const srcName = currencyNames?.[srcC] ?? parsed.fromCurrency;
  const tgtName = currencyNames?.[tgtC] ?? parsed.toCurrency;

  const feePart =
    parsed.fee > 0
      ? t("depositFxFeePart", {
          fee: parsed.fee.toLocaleString("fa-AF"),
          currency: tgtC,
        })
      : "";

  return t("depositFxNarrative", {
    customerName,
    sourceAmount: sourceAmount.toLocaleString("fa-AF"),
    sourceCurrency: srcC,
    sourceCurrencyName: srcName,
    targetAmount: targetNet.toLocaleString("fa-AF"),
    targetCurrency: tgtC,
    targetCurrencyName: tgtName,
    rate: parsed.rate.toLocaleString("fa-AF"),
    feePart,
  });
}

export function RawDetailModal({ isOpen, onClose, title, record, closeLabel, t, currencyNames }: Props) {
  const narrative = depositFxNarrativePashto(record, t, currencyNames);
  const body = renderRecord(record, t, 0);
  return (
    <FormModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="recordDetailScroll">
        {narrative ? <p className="recordDetailNarrative">{narrative}</p> : null}
        {body}
      </div>
      <div className="modalActions">
        <button className="navItem" type="button" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </FormModal>
  );
}

function renderRecord(record: unknown, t: (k: string) => string, depth: number): ReactNode {
  if (record === null || record === undefined) {
    return <p className="recordDetailEmpty">{t("noData")}</p>;
  }
  if (Array.isArray(record)) {
    if (record.length === 0) return <p className="recordDetailEmpty">—</p>;
    return (
      <ul className="recordDetailList">
        {record.map((item, i) => (
          <li key={i}>{typeof item === "object" && item !== null ? renderRecord(item, t, depth + 1) : String(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof record !== "object") {
    return <p className="recordDetailScalar">{String(record)}</p>;
  }
  const obj = record as Record<string, unknown>;
  const keys = sortKeys(Object.keys(obj).filter((k) => obj[k] !== undefined && !isHiddenDetailKey(k)));
  if (keys.length === 0) return <p className="recordDetailEmpty">—</p>;

  return (
    <dl className={`recordDetailDl${depth > 0 ? " recordDetailDl--nested" : ""}`}>
      {keys.map((key) => (
        <Fragment key={key}>
          <dt>{labelForField(key, t)}</dt>
          <dd>{renderValue(key, obj[key], t, depth)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function renderValue(key: string, val: unknown, t: (k: string) => string, depth: number): ReactNode {
  if (val === null || val === undefined) {
    return <span className="recordDetailEmpty">—</span>;
  }
  if (typeof val === "boolean") {
    return val ? t("yes") : t("no");
  }
  if (typeof val === "number") {
    return Number.isFinite(val) ? val.toLocaleString("fa-AF") : String(val);
  }
  if (typeof val === "string") {
    return formatScalarCell(key, val, t);
  }
  if (Array.isArray(val)) {
    return renderRecord(val, t, depth + 1);
  }
  if (typeof val === "object") {
    return <div className="recordDetailNested">{renderRecord(val, t, depth + 1)}</div>;
  }
  return String(val);
}
