import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { IconPencil, IconTrash } from "../components/ActionIcons";
import { FormModal } from "../components/FormModal";
import { IconTooltipButton } from "../components/IconTooltipButton";
import { apiUrl } from "../lib/apiBase";
import { parseFaDecimal } from "../lib/parseFaDecimal";
import { formatGregorianDate } from "../lib/formatDate";

type Summary = { currencyCode: string; slipPaidTotal: number; repaidTotal: number; netOwed: number };

type AccountRow = {
  id: string;
  displayName: string;
  phone?: string | null;
  notes?: string | null;
  isActive: boolean;
};

type SlipLite = {
  id: string;
  slipCode: string;
  customerId: string;
  currencyCode: string;
  amount: string;
  status: string;
  createdAt: string;
  paidToName?: string | null;
  customer?: { fullName: string };
};

type RepaymentRow = {
  id: string;
  fundingAccountId: string;
  currencyCode: string;
  amount: string;
  note?: string | null;
  createdAt: string;
};

type LastPaidSlipDetail = {
  slipCode: string;
  currencyCode: string;
  amount: number;
  createdAt: string;
  paidAt: string | null;
  customerName: string | null;
  paidToName: string | null;
  repaidSinceSlip: number;
};

type Props = {
  t: (key: string, options?: Record<string, string | number>) => string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  currencies: Array<{ code: string; name: string }>;
};

function fmt(n: number) {
  return n.toLocaleString("fa-AF");
}

function CurrencyIso({ code }: { code: string }) {
  return (
    <span className="currencyIso" dir="ltr" translate="no">
      {code}
    </span>
  );
}

function FundingMetricCard({
  title,
  hint,
  value,
  valueClass,
  foot,
}: {
  title: string;
  hint: string;
  value: string;
  valueClass?: string;
  foot?: string;
}) {
  return (
    <article className="fundingMetricCard">
      <h4 className="fundingMetricCardTitle">{title}</h4>
      <p className="fundingMetricCardHint">{hint}</p>
      <p className={`fundingMetricCardValue ${valueClass ?? ""}`}>{value}</p>
      {foot ? <p className="fundingMetricCardFoot">{foot}</p> : null}
    </article>
  );
}

function FundingAggregateCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ code: string; amount: number; amountClass?: string }>;
}) {
  return (
    <article className="fundingAggregateCard">
      <h3 className="fundingAggregateCardTitle">{title}</h3>
      <ul className="fundingAggregateList">
        {rows.map((r) => (
          <li key={r.code} className="fundingAggregateRow">
            <span className="fundingAggregateCode">
              <CurrencyIso code={r.code} />
            </span>
            <span className={`fundingAggregateAmount ${r.amountClass ?? ""}`}>{fmt(r.amount)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function FundingAccountDetailPage({ t, apiFetch, currencies }: Props) {
  const { fundingAccountId } = useParams();
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [slips, setSlips] = useState<SlipLite[]>([]);
  const [repayments, setRepayments] = useState<RepaymentRow[]>([]);
  const [lastPaidSlip, setLastPaidSlip] = useState<LastPaidSlipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState("");
  const [repCurrency, setRepCurrency] = useState("AFN");
  const [repAmount, setRepAmount] = useState("");
  const [repNote, setRepNote] = useState("");
  const [repSaving, setRepSaving] = useState(false);
  const [editRepayment, setEditRepayment] = useState<RepaymentRow | null>(null);
  const [editCurrency, setEditCurrency] = useState("AFN");
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    if (!fundingAccountId) return;
    setLoading(true);
    setNotFound(false);
    setMessage("");
    try {
      const r = await apiFetch(apiUrl(`/funding-accounts/${encodeURIComponent(fundingAccountId)}`));
      const d = (await r.json()) as {
        account?: AccountRow;
        summaries?: Summary[];
        slips?: SlipLite[];
        repayments?: RepaymentRow[];
        lastPaidSlip?: LastPaidSlipDetail | null;
      };
      if (!r.ok || !d.account) {
        setNotFound(true);
        setAccount(null);
        return;
      }
      setAccount(d.account);
      setSummaries(d.summaries ?? []);
      setSlips(d.slips ?? []);
      setRepayments(d.repayments ?? []);
      setLastPaidSlip(d.lastPaidSlip ?? null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, fundingAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRepayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!fundingAccountId || !account?.isActive) return;
    const amount = parseFaDecimal(repAmount);
    if (!amount || amount <= 0) return;
    setRepSaving(true);
    setMessage("");
    try {
      const r = await apiFetch(apiUrl(`/funding-accounts/${encodeURIComponent(fundingAccountId)}/repayments`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currencyCode: repCurrency,
          amount,
          note: repNote.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const d = (await r.json()) as { error?: string };
        setMessage(
          d.error === "FUNDING_ACCOUNT_INACTIVE"
            ? t("fundingAccountInactive")
            : d.error === "CURRENCY_NOT_FOUND"
              ? t("notFound")
              : t("fundingRepaymentFailed")
        );
        return;
      }
      setRepAmount("");
      setRepNote("");
      await load();
      setMessage(t("savedSuccessfully"));
    } finally {
      setRepSaving(false);
    }
  };

  const openEdit = (row: RepaymentRow) => {
    setEditRepayment(row);
    setEditCurrency(row.currencyCode);
    setEditAmount(String(Number(row.amount)));
    setEditNote(row.note?.trim() ?? "");
    setMessage("");
  };

  const submitEditRepayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!fundingAccountId || !editRepayment) return;
    const amount = parseFaDecimal(editAmount);
    if (!amount || amount <= 0) return;
    setEditSaving(true);
    setMessage("");
    try {
      const r = await apiFetch(
        apiUrl(`/funding-accounts/${encodeURIComponent(fundingAccountId)}/repayments/${encodeURIComponent(editRepayment.id)}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currencyCode: editCurrency,
            amount,
            note: editNote.trim() || null,
          }),
        }
      );
      if (!r.ok) {
        setMessage(t("fundingRepaymentUpdateFailed"));
        return;
      }
      setEditRepayment(null);
      await load();
      setMessage(t("savedSuccessfully"));
    } finally {
      setEditSaving(false);
    }
  };

  const deleteRepayment = async (row: RepaymentRow) => {
    if (!fundingAccountId) return;
    if (!window.confirm(t("fundingRepaymentDeleteConfirm"))) return;
    setMessage("");
    const r = await apiFetch(
      apiUrl(`/funding-accounts/${encodeURIComponent(fundingAccountId)}/repayments/${encodeURIComponent(row.id)}`),
      { method: "DELETE" }
    );
    if (!r.ok) {
      setMessage(t("fundingRepaymentDeleteFailed"));
      return;
    }
    await load();
    setMessage(t("savedSuccessfully"));
  };

  const slipAnchorLabel = lastPaidSlip
    ? formatGregorianDate(lastPaidSlip.paidAt ?? lastPaidSlip.createdAt)
    : "";

  const hasOutstandingBorrow = useMemo(() => summaries.some((s) => s.netOwed > 0), [summaries]);
  const allNetZero = useMemo(
    () => summaries.length > 0 && summaries.every((s) => s.netOwed === 0),
    [summaries]
  );
  const hasCreditOnly = useMemo(
    () => summaries.some((s) => s.netOwed < 0) && !hasOutstandingBorrow,
    [summaries, hasOutstandingBorrow]
  );

  const sortedSummaries = useMemo(
    () => [...summaries].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode)),
    [summaries]
  );

  if (!fundingAccountId) {
    return (
      <section className="customersPageRoot">
        <div className="emptyText">{t("notFound")}</div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="customersPageRoot">
        <div className="emptyText">{t("loading")}</div>
      </section>
    );
  }

  if (notFound || !account) {
    return (
      <section className="customersPageRoot">
        <div className="emptyText">{t("notFound")}</div>
        <Link className="navItem" to="/funding-accounts" style={{ marginTop: 12, display: "inline-block" }}>
          {t("fundingBackToList")}
        </Link>
      </section>
    );
  }

  return (
    <section className="customersPageRoot">
      <div className="fundingDetailHeaderBar">
        <Link className="navItem fundingBackLink" to="/funding-accounts">
          ← {t("fundingBackToList")}
        </Link>
        <Link className="navItem" to="/slips">
          {t("slips")}
        </Link>
      </div>

      <div className="card formCard customersPageHeaderCard fundingDetailHero">
        <div className="fundingDetailHeroTop">
          <div>
            <div className="heroTitle" style={{ marginBottom: 6 }}>
              {account.displayName}
            </div>
            {account.phone ? (
              <p className="reportFilterSubtitle" style={{ marginTop: 6 }}>
                {t("phone")}: {account.phone}
              </p>
            ) : null}
            {account.notes ? (
              <p className="reportFilterSubtitle" style={{ marginTop: 4 }}>
                {t("notes")}: {account.notes}
              </p>
            ) : null}
          </div>
          <div className={`fundingStatusPill ${account.isActive ? "fundingStatusPill--on" : "fundingStatusPill--off"}`}>
            {account.isActive ? t("active") : t("inactive")}
          </div>
        </div>
      </div>

      {message ? <div className="emptyText fundingPageMessage">{message}</div> : null}

      {summaries.length === 0 ? (
        <div className="card listCard customersListCard">
          <div className="emptyText">{t("fundingNoActivityYet")}</div>
        </div>
      ) : (
        <section className="card listCard customersListCard fundingReportCard" dir="rtl">
          <header className="fundingReportHeader">
            <h2 className="heroTitle fundingReportTitle">{t("fundingDetailReportTitle")}</h2>
            <p className="reportFilterSubtitle fundingReportSub">
              {allNetZero
                ? t("fundingDetailReportSubAllClear")
                : hasCreditOnly
                  ? t("fundingDetailReportSubCredit")
                  : t("fundingDetailReportSub")}
            </p>
          </header>

          <div className="fundingAggregateStrip">
            <FundingAggregateCard
              title={t("fundingAggSlipsCardTitle")}
              rows={sortedSummaries.map((s) => ({ code: s.currencyCode, amount: s.slipPaidTotal }))}
            />
            <FundingAggregateCard
              title={t("fundingAggRepaidCardTitle")}
              rows={sortedSummaries.map((s) => ({ code: s.currencyCode, amount: s.repaidTotal }))}
            />
            <FundingAggregateCard
              title={t("fundingAggNetCardTitle")}
              rows={sortedSummaries.map((s) => ({
                code: s.currencyCode,
                amount: s.netOwed,
                amountClass:
                  s.netOwed > 0 ? "fundingNetOwed" : s.netOwed < 0 ? "fundingNetCredit" : "fundingNetClear",
              }))}
            />
            <FundingAggregateCard
              title={t("fundingAggPayableCardTitle")}
              rows={sortedSummaries.map((s) => ({
                code: s.currencyCode,
                amount: Math.max(0, s.netOwed),
                amountClass: s.netOwed > 0 ? "fundingNetOwed" : "",
              }))}
            />
          </div>

          {sortedSummaries.map((s) => {
            if (s.netOwed === 0) {
              return (
                <div key={s.currencyCode} className="fundingCurrencyKpiBlock">
                  <div
                    className={`fundingCurrencySettledBanner ${
                      s.slipPaidTotal === 0 && s.repaidTotal === 0 ? "fundingCurrencySettledBanner--empty" : ""
                    }`}
                  >
                    <div className="fundingCurrencySettledBannerTitle">
                      <CurrencyIso code={s.currencyCode} />
                      <span className="fundingCurrencySettledDash"> — </span>
                      <span>{t("fundingDetailCurrencyZeroTitle")}</span>
                    </div>
                    <p className="fundingCurrencySettledBannerText">
                      {s.slipPaidTotal === 0 && s.repaidTotal === 0
                        ? t("fundingDetailCurrencyNoFlow")
                        : t("fundingDetailCurrencyZeroBody", { amount: fmt(s.slipPaidTotal) })}
                    </p>
                  </div>
                </div>
              );
            }

            const payable = Math.max(0, s.netOwed);
            const surplus = Math.max(0, -s.netOwed);
            const foot =
              surplus > 0 ? t("fundingKpiSurplusFoot", { amount: fmt(surplus) }) : undefined;
            return (
              <div key={s.currencyCode} className="fundingCurrencyKpiBlock">
                <div className="fundingCurrencyKpiBlockHead">
                  <CurrencyIso code={s.currencyCode} />
                </div>
                <div className="fundingMetricCards">
                  <FundingMetricCard
                    title={t("fundingKpiSlipTitle")}
                    hint={t("fundingKpiSlipHint")}
                    value={fmt(s.slipPaidTotal)}
                  />
                  <FundingMetricCard
                    title={t("fundingKpiRepaidTitle")}
                    hint={t("fundingKpiRepaidHint")}
                    value={fmt(s.repaidTotal)}
                  />
                  <FundingMetricCard
                    title={t("fundingKpiBalanceTitle")}
                    hint={t("fundingKpiBalanceHint")}
                    value={fmt(s.netOwed)}
                    valueClass={
                      s.netOwed > 0 ? "fundingNetOwed" : s.netOwed < 0 ? "fundingNetCredit" : "fundingNetClear"
                    }
                  />
                  <FundingMetricCard
                    title={t("fundingKpiPayableTitle")}
                    hint={t("fundingKpiPayableHint")}
                    value={fmt(payable)}
                    valueClass={payable > 0 ? "fundingNetOwed" : ""}
                    foot={foot}
                  />
                </div>
              </div>
            );
          })}

          {lastPaidSlip && hasOutstandingBorrow ? (
            <article className="fundingLastSlipCard">
              <h3 className="fundingLastSlipCardTitle">{t("fundingLastSlipTitle")}</h3>
              <p className="fundingLastSlipCardSub">{t("fundingLastSlipSub")}</p>
              <div className="fundingLastSlipGrid">
                <div className="fundingLastSlipField">
                  <span className="fundingLastSlipLabel">{t("slipCode")}</span>
                  <span className="fundingLastSlipValue">{lastPaidSlip.slipCode}</span>
                </div>
                <div className="fundingLastSlipField">
                  <span className="fundingLastSlipLabel">{t("fundingLastSlipAmountLabel")}</span>
                  <span className="fundingLastSlipValue fundingLastSlipEm">
                    {fmt(lastPaidSlip.amount)} <CurrencyIso code={lastPaidSlip.currencyCode} />
                  </span>
                </div>
                <div className="fundingLastSlipField">
                  <span className="fundingLastSlipLabel">{t("fundingLastSlipRepaidLabel")}</span>
                  <span className="fundingLastSlipValue">
                    {fmt(lastPaidSlip.repaidSinceSlip)} <CurrencyIso code={lastPaidSlip.currencyCode} />
                  </span>
                </div>
                <div className="fundingLastSlipField">
                  <span className="fundingLastSlipLabel">{t("fundingLastSlipWhenLabel")}</span>
                  <span className="fundingLastSlipValue">{slipAnchorLabel}</span>
                </div>
                {lastPaidSlip.customerName ? (
                  <div className="fundingLastSlipField">
                    <span className="fundingLastSlipLabel">{t("customers")}</span>
                    <span className="fundingLastSlipValue">{lastPaidSlip.customerName}</span>
                  </div>
                ) : null}
                {lastPaidSlip.paidToName ? (
                  <div className="fundingLastSlipField">
                    <span className="fundingLastSlipLabel">{t("beneficiaryName")}</span>
                    <span className="fundingLastSlipValue">{lastPaidSlip.paidToName}</span>
                  </div>
                ) : null}
              </div>
            </article>
          ) : null}
        </section>
      )}

      <div className="card listCard customersListCard">
        <div className="heroTitle" style={{ fontSize: "1.05rem" }}>
          {t("fundingRecordRepayment")}
        </div>
        <p className="fundingFormHint">{t("fundingRecordRepaymentHint")}</p>
        <form className="customerForm fundingRepayForm" onSubmit={submitRepayment}>
          <label>
            {t("currency")}
            <select className="sarafiSelect" value={repCurrency} onChange={(e) => setRepCurrency(e.target.value)} disabled={!account.isActive}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("amount")}
            <input value={repAmount} onChange={(e) => setRepAmount(e.target.value)} inputMode="decimal" required disabled={!account.isActive} />
          </label>
          <label>
            {t("notes")}
            <input value={repNote} onChange={(e) => setRepNote(e.target.value)} disabled={!account.isActive} />
          </label>
          <button className="primaryBtn" type="submit" disabled={repSaving || !account.isActive}>
            {repSaving ? `${t("save")}…` : t("save")}
          </button>
        </form>
      </div>

      <div className="card listCard customersListCard">
        <div className="heroTitle" style={{ fontSize: "1.05rem" }}>
          {t("fundingRepaymentsHistory")}
        </div>
        {repayments.length === 0 ? (
          <div className="emptyText">{t("noData")}</div>
        ) : (
          <div className="customerTableWrap">
            <table className="customerTable">
              <thead>
                <tr>
                  <th>{t("createdAt")}</th>
                  <th>{t("currency")}</th>
                  <th>{t("amount")}</th>
                  <th>{t("notes")}</th>
                  <th>{t("fundingActionsColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {repayments.map((r) => (
                  <tr key={r.id}>
                    <td>{formatGregorianDate(r.createdAt)}</td>
                    <td>{r.currencyCode}</td>
                    <td>{Number(r.amount).toLocaleString("fa-AF")}</td>
                    <td>{r.note?.trim() || "—"}</td>
                    <td>
                      <div className="customerActions slipRowActions">
                        <IconTooltipButton className="iconActionBtn" tooltip={t("edit")} type="button" onClick={() => openEdit(r)}>
                          <IconPencil />
                        </IconTooltipButton>
                        <IconTooltipButton
                          className="iconActionBtn iconActionBtn--danger"
                          tooltip={t("delete")}
                          type="button"
                          onClick={() => void deleteRepayment(r)}
                        >
                          <IconTrash />
                        </IconTooltipButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card listCard customersListCard">
        <div className="heroTitle" style={{ fontSize: "1.05rem" }}>
          {t("fundingSlipsForAccount")}
        </div>
        {slips.length === 0 ? (
          <div className="emptyText">{t("noSlips")}</div>
        ) : (
          <div className="customerTableWrap">
            <table className="customerTable">
              <thead>
                <tr>
                  <th>{t("slipCode")}</th>
                  <th>{t("customers")}</th>
                  <th>{t("currency")}</th>
                  <th>{t("amount")}</th>
                  <th>{t("status")}</th>
                  <th>{t("createdAt")}</th>
                </tr>
              </thead>
              <tbody>
                {slips.map((s) => (
                  <tr key={s.id}>
                    <td className="customerName">{s.slipCode}</td>
                    <td>{s.customer?.fullName || "—"}</td>
                    <td>{s.currencyCode}</td>
                    <td>{Number(s.amount).toLocaleString("fa-AF")}</td>
                    <td>{t(s.status)}</td>
                    <td>{formatGregorianDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FormModal isOpen={editRepayment !== null} onClose={() => setEditRepayment(null)} title={t("fundingRepaymentEditTitle")}>
        {editRepayment ? (
          <form className="customerForm" onSubmit={submitEditRepayment}>
            <label>
              {t("currency")}
              <select className="sarafiSelect" value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)}>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("amount")}
              <input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} inputMode="decimal" required />
            </label>
            <label>
              {t("notes")}
              <input value={editNote} onChange={(e) => setEditNote(e.target.value)} />
            </label>
            <div className="modalActions">
              <button className="primaryBtn" type="submit" disabled={editSaving}>
                {editSaving ? `${t("save")}…` : t("save")}
              </button>
              <button className="navItem" type="button" onClick={() => setEditRepayment(null)}>
                {t("cancel")}
              </button>
            </div>
          </form>
        ) : null}
      </FormModal>
    </section>
  );
}
