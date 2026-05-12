import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PaginationControls } from "../components/PaginationControls";
import { apiUrl } from "../lib/apiBase";
import { formatGregorianDate } from "../lib/formatDate";

type Partner = {
  id: string;
  name: string;
  country?: string | null;
  city?: string | null;
  contact?: string | null;
  notes?: string | null;
  createdAt: string;
};

type AccountRow = { id: string; currencyCode: string; balance: string };

type PartnerTxRow = {
  id: string;
  partnerId: string;
  currencyCode: string;
  amount: string;
  direction: "in" | "out";
  beneficiaryName?: string | null;
  referenceNo?: string | null;
  note?: string | null;
  reconciliationStatus: "pending" | "confirmed" | "disputed";
  createdAt: string;
};

type Props = {
  t: (key: string) => string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  currencies: Array<{ code: string; name: string }>;
};

const pageSize = 8;

export function PartnerDetailPage({ t, apiFetch, currencies }: Props) {
  const { partnerId } = useParams();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [transactions, setTransactions] = useState<PartnerTxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [txPage, setTxPage] = useState(1);

  const currencyNameByCode = useMemo(
    () => new Map(currencies.map((c) => [c.code.toUpperCase(), c.name])),
    [currencies]
  );

  const loadAll = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const [pRes, aRes, txRes] = await Promise.all([
        apiFetch(apiUrl(`/partners/${partnerId}`)),
        apiFetch(apiUrl(`/partners/${partnerId}/accounts`)),
        apiFetch(apiUrl(`/partner-transactions?partnerId=${encodeURIComponent(partnerId)}`)),
      ]);
      if (!pRes.ok) {
        setPartner(null);
        setNotFound(pRes.status === 404);
        setAccounts([]);
        setTransactions([]);
        return;
      }
      const pJson = (await pRes.json()) as { partner?: Partner };
      setPartner(pJson.partner ?? null);
      const aJson = (await aRes.json()) as { accounts?: AccountRow[] };
      setAccounts(aJson.accounts ?? []);
      const txJson = (await txRes.json()) as { transactions?: PartnerTxRow[] };
      setTransactions(txJson.transactions ?? []);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, partnerId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setTxPage(1);
  }, [partnerId]);

  const pagedTxs = useMemo(
    () => transactions.slice((txPage - 1) * pageSize, txPage * pageSize),
    [transactions, txPage]
  );

  if (!partnerId) {
    return (
      <section className="customersPageRoot">
        <div className="emptyText">{t("notFound")}</div>
        <Link className="navItem" to="/partners">
          {t("backToPartnersList")}
        </Link>
      </section>
    );
  }

  return (
    <section className="customersPageRoot">
      <div className="card formCard customersPageHeaderCard customerDetailHeader">
        <div className="customerDetailHeaderRow">
          <Link className="navItem customerDetailBack" to="/partners">
            ← {t("backToPartnersList")}
          </Link>
          <button className="navItem" type="button" onClick={() => void loadAll()}>
            {t("refresh")}
          </button>
        </div>
        {loading ? (
          <div className="emptyText">{t("loading")}</div>
        ) : notFound || !partner ? (
          <div className="emptyText">{t("partnerNotFound")}</div>
        ) : (
          <>
            <div className="heroTitle" style={{ marginBottom: 8 }}>
              {partner.name}
            </div>
            <div className="reportFilterSubtitle">
              {t("country")}: {partner.country?.trim() || "—"} · {t("city")}: {partner.city?.trim() || "—"} · {t("contact")}:{" "}
              {partner.contact?.trim() || "—"}
            </div>
            {partner.notes?.trim() ? (
              <p className="customerDetailNotes">
                <strong>{t("notes")}:</strong> {partner.notes}
              </p>
            ) : null}
            <div className="reportFilterSubtitle" style={{ marginTop: 6 }}>
              {t("createdAt")}: {formatGregorianDate(partner.createdAt)}
            </div>
          </>
        )}
      </div>

      {!loading && partner ? (
        <>
          <div className="card listCard customersListCard">
            <div className="listHeader">
              <div className="heroTitle">{t("partnerBalances")}</div>
            </div>
            {accounts.length === 0 ? (
              <div className="emptyText">{t("noBalances")}</div>
            ) : (
              <div className="customerTableWrap customerDetailTableWrap">
                <table className="customerTable">
                  <thead>
                    <tr>
                      <th>{t("partnerAccountKataHeader")}</th>
                      <th>{t("balance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id}>
                        <td>
                          <div className="customerName">
                            {t("kataPrefix")} — {account.currencyCode}
                          </div>
                          {currencyNameByCode.get(account.currencyCode.toUpperCase())?.trim() ? (
                            <div className="reportFilterSubtitle" style={{ marginTop: 4 }}>
                              {currencyNameByCode.get(account.currencyCode.toUpperCase())}
                            </div>
                          ) : null}
                        </td>
                        <td>{Number(account.balance).toLocaleString("fa-AF")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card listCard customersListCard">
            <div className="listHeader">
              <div className="heroTitle">{t("partnerDetailTxHistory")}</div>
            </div>
            {transactions.length === 0 ? (
              <div className="emptyText">{t("noPartnerTx")}</div>
            ) : (
              <>
                <div className="customerTableWrap customerDetailTableWrap">
                  <table className="customerTable">
                    <thead>
                      <tr>
                        <th>{t("currency")}</th>
                        <th>{t("amount")}</th>
                        <th>{t("direction")}</th>
                        <th>{t("beneficiaryName")}</th>
                        <th>{t("referenceNo")}</th>
                        <th>{t("reconciliationStatus")}</th>
                        <th>{t("notes")}</th>
                        <th>{t("createdAt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTxs.map((tx) => (
                        <tr key={tx.id}>
                          <td>{tx.currencyCode}</td>
                          <td>{Number(tx.amount).toLocaleString("fa-AF")}</td>
                          <td>
                            <span className={`statusPill ${tx.direction === "in" ? "statusIn" : "statusOut"}`}>
                              {tx.direction === "in" ? t("incomingDirection") : t("outgoingDirection")}
                            </span>
                          </td>
                          <td>{tx.direction === "out" ? tx.beneficiaryName?.trim() || "—" : "—"}</td>
                          <td>{tx.referenceNo?.trim() || "—"}</td>
                          <td>
                            <span className={`statusPill status-${tx.reconciliationStatus}`}>{t(tx.reconciliationStatus)}</span>
                          </td>
                          <td className="customerDetailNoteCell">{tx.note?.trim() || "—"}</td>
                          <td>{formatGregorianDate(tx.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  page={txPage}
                  totalItems={transactions.length}
                  pageSize={pageSize}
                  onPageChange={setTxPage}
                  t={t}
                />
              </>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
