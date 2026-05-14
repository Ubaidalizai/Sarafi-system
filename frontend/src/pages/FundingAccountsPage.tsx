import type { FormEvent, MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FormModal } from "../components/FormModal";
import { apiUrl } from "../lib/apiBase";

type Summary = { currencyCode: string; slipPaidTotal: number; repaidTotal: number; netOwed: number };

type FundingListRow = {
  id: string;
  displayName: string;
  phone?: string | null;
  notes?: string | null;
  isActive: boolean;
  summaries: Summary[];
};

type Props = {
  t: (key: string, options?: Record<string, string | number>) => string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
};

function CurrencyIso({ code }: { code: string }) {
  return (
    <span className="currencyIso" dir="ltr" translate="no">
      {code}
    </span>
  );
}

export function FundingAccountsPage({ t, apiFetch }: Props) {
  const [accounts, setAccounts] = useState<FundingListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const r = await apiFetch(apiUrl("/funding-accounts"));
      const d = (await r.json()) as { accounts?: FundingListRow[] };
      if (!r.ok) {
        setMessage(t("fundingAccountsLoadFailed"));
        return;
      }
      setAccounts(d.accounts ?? []);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, t]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreateSaving(true);
    setMessage("");
    try {
      const r = await apiFetch(apiUrl("/funding-accounts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: createName.trim(),
          phone: createPhone.trim() || undefined,
          notes: createNotes.trim() || undefined,
        }),
      });
      if (!r.ok) {
        setMessage(t("fundingAccountSaveFailed"));
        return;
      }
      setCreateOpen(false);
      setCreateName("");
      setCreatePhone("");
      setCreateNotes("");
      await loadList();
      setMessage(t("savedSuccessfully"));
    } finally {
      setCreateSaving(false);
    }
  };

  const toggleActive = async (id: string, next: boolean, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMessage("");
    const r = await apiFetch(apiUrl(`/funding-accounts/${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    if (!r.ok) {
      setMessage(t("fundingAccountSaveFailed"));
      return;
    }
    await loadList();
  };

  return (
    <section className="customersPageRoot">
      <div className="card formCard customersPageHeaderCard">
        <div className="heroTitle" style={{ marginBottom: 8 }}>
          {t("fundingAccountsModule")}
        </div>
        <p className="reportFilterSubtitle" style={{ margin: 0 }}>
          {t("fundingAccountsHint")}
        </p>
      </div>

      <FormModal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t("fundingAccountNew")}>
        <form className="customerForm" onSubmit={submitCreate}>
          <label>
            {t("fundingAccountDisplayName")}
            <input value={createName} onChange={(e) => setCreateName(e.target.value)} required />
          </label>
          <label>
            {t("phone")}
            <input value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} />
          </label>
          <label>
            {t("notes")}
            <textarea rows={2} value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} />
          </label>
          <div className="modalActions">
            <button className="primaryBtn" type="submit" disabled={createSaving}>
              {createSaving ? `${t("save")}…` : t("save")}
            </button>
            <button className="navItem" type="button" onClick={() => setCreateOpen(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </FormModal>

      <section className="card listCard customersListCard">
        <div className="listHeader">
          <div className="heroTitle">{t("fundingAccountsList")}</div>
          <div className="listHeaderActions">
            <button className="primaryBtn" type="button" onClick={() => setCreateOpen(true)}>
              + {t("fundingAccountNew")}
            </button>
            <button className="navItem" type="button" onClick={() => void loadList()} disabled={loading}>
              {t("refresh")}
            </button>
          </div>
        </div>
        {message ? <div className="emptyText fundingPageMessage">{message}</div> : null}
        {loading ? (
          <div className="emptyText">{t("loading")}</div>
        ) : accounts.length === 0 ? (
          <div className="emptyText">{t("fundingAccountsEmpty")}</div>
        ) : (
          <div className="fundingAccountsGrid">
            {accounts.map((a) => (
              <article key={a.id} className="fundingAccountCard">
                <Link to={`/funding-accounts/${a.id}`} className="fundingAccountCardMain">
                  <div className="fundingAccountCardHead">
                    <span className="fundingAccountCardName">{a.displayName}</span>
                    <span className={`fundingStatusPill ${a.isActive ? "fundingStatusPill--on" : "fundingStatusPill--off"}`}>
                      {a.isActive ? t("active") : t("inactive")}
                    </span>
                  </div>
                  {a.summaries.length === 0 ? (
                    <p className="reportFilterSubtitle fundingCardMuted">—</p>
                  ) : (
                    <ul className="fundingSummaryList fundingCardSummaryList">
                      {a.summaries.map((s) => (
                        <li key={s.currencyCode}>
                          <strong>
                            <CurrencyIso code={s.currencyCode} />
                          </strong>
                          {": "}
                          {s.netOwed === 0 ? (
                            s.slipPaidTotal === 0 && s.repaidTotal === 0 ? (
                              <span className="fundingNetClear">{t("fundingCardNoMovement")}</span>
                            ) : (
                              <span className="fundingNetClear">
                                {t("fundingCardBalancedLine", { amount: s.slipPaidTotal.toLocaleString("fa-AF") })}
                              </span>
                            )
                          ) : (
                            <>
                              {t("fundingSlipPaidShort")} {s.slipPaidTotal.toLocaleString("fa-AF")}
                              {" · "}
                              {t("fundingRepaidShort")} {s.repaidTotal.toLocaleString("fa-AF")}
                              {" · "}
                              <span className={s.netOwed > 0 ? "fundingNetOwed" : "fundingNetCredit"}>
                                {t("fundingNetOwedShort")} {s.netOwed.toLocaleString("fa-AF")}
                              </span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <span className="fundingAccountCardCta">{t("fundingOpenAccount")}</span>
                </Link>
                <div className="fundingAccountCardFooter">
                  <button className="navItem" type="button" onClick={(e) => void toggleActive(a.id, !a.isActive, e)}>
                    {a.isActive ? t("fundingAccountDeactivate") : t("fundingAccountActivate")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
