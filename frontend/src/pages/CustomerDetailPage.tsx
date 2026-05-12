import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PaginationControls } from "../components/PaginationControls";
import { apiUrl } from "../lib/apiBase";
import { formatGregorianDate } from "../lib/formatDate";
import { parseFxCashInNote, sourceAmountFromFxTarget } from "../lib/fxCashInDeposit";

type Customer = {
  id: string;
  fullName: string;
  phone?: string | null;
  idNumber?: string | null;
  notes?: string | null;
  createdAt: string;
};

type AccountRow = { id: string; currencyCode: string; balance: string };

type DepositRow = {
  id: string;
  customerId: string;
  currencyCode: string;
  amount: string;
  note?: string | null;
  createdAt: string;
};

type SlipRow = {
  id: string;
  slipCode: string;
  customerId: string;
  currencyCode: string;
  amount: string;
  status: "issued" | "paid" | "cancelled" | "expired";
  receiverName?: string | null;
  paidToName?: string | null;
  createdAt: string;
};

type ExchangeRow = {
  id: string;
  referenceNo: string;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  sourceAmount: string | number;
  rate: string | number;
  targetAmountNet: string | number;
  createdAt: string;
};

type Props = {
  t: (key: string) => string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  currencies: Array<{ code: string; name: string }>;
};

const pageSize = 8;

export function CustomerDetailPage({ t, apiFetch, currencies }: Props) {
  const { customerId } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [slips, setSlips] = useState<SlipRow[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [depositsPage, setDepositsPage] = useState(1);
  const [slipsPage, setSlipsPage] = useState(1);
  const [exchangesPage, setExchangesPage] = useState(1);

  const currencyNameByCode = useMemo(
    () => new Map(currencies.map((c) => [c.code.toUpperCase(), c.name])),
    [currencies]
  );

  const loadAll = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const [cRes, aRes, dRes, sRes, xRes] = await Promise.all([
        apiFetch(apiUrl(`/customers/${customerId}`)),
        apiFetch(apiUrl(`/customers/${customerId}/accounts`)),
        apiFetch(apiUrl(`/deposits?customerId=${encodeURIComponent(customerId)}`)),
        apiFetch(apiUrl(`/slips?customerId=${encodeURIComponent(customerId)}`)),
        apiFetch(apiUrl(`/api/v1/exchanges?customerId=${encodeURIComponent(customerId)}`)),
      ]);
      if (!cRes.ok) {
        setCustomer(null);
        setNotFound(cRes.status === 404);
        setAccounts([]);
        setDeposits([]);
        setSlips([]);
        setExchanges([]);
        return;
      }
      const cJson = (await cRes.json()) as { customer?: Customer };
      setCustomer(cJson.customer ?? null);
      const aJson = (await aRes.json()) as { accounts?: AccountRow[] };
      setAccounts(aJson.accounts ?? []);
      const dJson = (await dRes.json()) as { deposits?: DepositRow[] };
      setDeposits(dJson.deposits ?? []);
      const sJson = (await sRes.json()) as { slips?: SlipRow[] };
      setSlips(sJson.slips ?? []);
      const xJson = (await xRes.json()) as { exchanges?: ExchangeRow[] };
      setExchanges(xJson.exchanges ?? []);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, customerId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setDepositsPage(1);
    setSlipsPage(1);
    setExchangesPage(1);
  }, [customerId]);

  const depositFxLine = (row: DepositRow) => {
    const parsed = parseFxCashInNote(row.note);
    if (!parsed) return "";
    const net = Number(row.amount);
    if (!Number.isFinite(net)) return "";
    const src = sourceAmountFromFxTarget(net, parsed.rate, parsed.fee);
    const srcName = currencyNameByCode.get(parsed.fromCurrency) ?? parsed.fromCurrency;
    const tgtName = currencyNameByCode.get(parsed.toCurrency) ?? parsed.toCurrency;
    return `${src.toLocaleString("fa-AF")} ${parsed.fromCurrency} (${srcName}) → ${net.toLocaleString("fa-AF")} ${parsed.toCurrency} (${tgtName}) @ ${parsed.rate.toLocaleString("fa-AF")}`;
  };

  const pagedDeposits = useMemo(
    () => deposits.slice((depositsPage - 1) * pageSize, depositsPage * pageSize),
    [deposits, depositsPage]
  );
  const pagedSlips = useMemo(() => slips.slice((slipsPage - 1) * pageSize, slipsPage * pageSize), [slips, slipsPage]);
  const pagedExchanges = useMemo(
    () => exchanges.slice((exchangesPage - 1) * pageSize, exchangesPage * pageSize),
    [exchanges, exchangesPage]
  );

  if (!customerId) {
    return (
      <section className="customersPageRoot">
        <div className="emptyText">{t("notFound")}</div>
        <Link className="navItem" to="/customers">
          {t("backToCustomersList")}
        </Link>
      </section>
    );
  }

  return (
    <section className="customersPageRoot">
      <div className="card formCard customersPageHeaderCard customerDetailHeader">
        <div className="customerDetailHeaderRow">
          <Link className="navItem customerDetailBack" to="/customers">
            ← {t("backToCustomersList")}
          </Link>
          <button className="navItem" type="button" onClick={() => void loadAll()}>
            {t("refresh")}
          </button>
        </div>
        {loading ? (
          <div className="emptyText">{t("loading")}</div>
        ) : notFound || !customer ? (
          <div className="emptyText">{t("deleteCustomerNotFound")}</div>
        ) : (
          <>
            <div className="heroTitle" style={{ marginBottom: 8 }}>
              {customer.fullName}
            </div>
            <div className="reportFilterSubtitle">
              {t("phone")}: {customer.phone?.trim() || "—"} · {t("idNumber")}: {customer.idNumber?.trim() || "—"}
            </div>
            {customer.notes?.trim() ? (
              <p className="customerDetailNotes">
                <strong>{t("notes")}:</strong> {customer.notes}
              </p>
            ) : null}
            <div className="reportFilterSubtitle" style={{ marginTop: 6 }}>
              {t("createdAt")}: {formatGregorianDate(customer.createdAt)}
            </div>
          </>
        )}
      </div>

      {!loading && customer ? (
        <>
          <div className="card listCard customersListCard">
            <div className="listHeader">
              <div className="heroTitle">{t("customerDetailBalances")}</div>
            </div>
            {accounts.length === 0 ? (
              <div className="emptyText">{t("noBalances")}</div>
            ) : (
              <div className="customerTableWrap customerDetailTableWrap">
                <table className="customerTable">
                  <thead>
                    <tr>
                      <th>{t("currency")}</th>
                      <th>{t("balance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((acc) => (
                      <tr key={acc.id}>
                        <td>
                          {acc.currencyCode}
                          {currencyNameByCode.get(acc.currencyCode.toUpperCase())
                            ? ` — ${currencyNameByCode.get(acc.currencyCode.toUpperCase())}`
                            : ""}
                        </td>
                        <td>{Number(acc.balance).toLocaleString("fa-AF")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card listCard customersListCard">
            <div className="listHeader">
              <div className="heroTitle">{t("customerDetailDeposits")}</div>
            </div>
            {deposits.length === 0 ? (
              <div className="emptyText">{t("noDeposits")}</div>
            ) : (
              <>
                <div className="customerTableWrap customerDetailTableWrap">
                  <table className="customerTable">
                    <thead>
                      <tr>
                        <th>{t("currency")}</th>
                        <th>{t("amount")}</th>
                        <th>{t("createdAt")}</th>
                        <th>{t("notes")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedDeposits.map((row) => {
                        const fx = depositFxLine(row);
                        return (
                          <tr key={row.id}>
                            <td>{row.currencyCode}</td>
                            <td>
                              <div>{Number(row.amount).toLocaleString("fa-AF")}</div>
                              {fx ? (
                                <div className="reportFilterSubtitle" style={{ marginTop: 4 }}>
                                  {fx}
                                </div>
                              ) : null}
                            </td>
                            <td>{formatGregorianDate(row.createdAt)}</td>
                            <td className="customerDetailNoteCell">{row.note?.trim() || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  page={depositsPage}
                  totalItems={deposits.length}
                  pageSize={pageSize}
                  onPageChange={setDepositsPage}
                  t={t}
                />
              </>
            )}
          </div>

          <div className="card listCard customersListCard">
            <div className="listHeader">
              <div className="heroTitle">{t("customerDetailSlips")}</div>
            </div>
            {slips.length === 0 ? (
              <div className="emptyText">{t("noSlips")}</div>
            ) : (
              <>
                <div className="customerTableWrap customerDetailTableWrap">
                  <table className="customerTable">
                    <thead>
                      <tr>
                        <th>{t("slipCode")}</th>
                        <th>{t("currency")}</th>
                        <th>{t("amount")}</th>
                        <th>{t("accountName")}</th>
                        <th>{t("slipPaidToName")}</th>
                        <th>{t("status")}</th>
                        <th>{t("createdAt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSlips.map((row) => (
                        <tr key={row.id}>
                          <td className="customerName">{row.slipCode}</td>
                          <td>{row.currencyCode}</td>
                          <td>{Number(row.amount).toLocaleString("fa-AF")}</td>
                          <td>{row.receiverName?.trim() || "—"}</td>
                          <td>{row.paidToName?.trim() || "—"}</td>
                          <td>{t(row.status)}</td>
                          <td>{formatGregorianDate(row.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  page={slipsPage}
                  totalItems={slips.length}
                  pageSize={pageSize}
                  onPageChange={setSlipsPage}
                  t={t}
                />
              </>
            )}
          </div>

          <div className="card listCard customersListCard">
            <div className="listHeader">
              <div className="heroTitle">{t("customerDetailExchanges")}</div>
            </div>
            {exchanges.length === 0 ? (
              <div className="emptyText">{t("noData")}</div>
            ) : (
              <>
                <div className="customerTableWrap customerDetailTableWrap">
                  <table className="customerTable">
                    <thead>
                      <tr>
                        <th>{t("referenceNo")}</th>
                        <th>{t("createdAt")}</th>
                        <th>{t("currency")}</th>
                        <th>{t("amount")}</th>
                        <th>{t("rate")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedExchanges.map((row) => (
                        <tr key={row.id}>
                          <td className="customerName">{row.referenceNo}</td>
                          <td>{formatGregorianDate(row.createdAt)}</td>
                          <td>
                            {row.fromCurrencyCode} → {row.toCurrencyCode}
                          </td>
                          <td>
                            {Number(row.sourceAmount).toLocaleString("fa-AF")} /{" "}
                            {Number(row.targetAmountNet).toLocaleString("fa-AF")}
                          </td>
                          <td>{Number(row.rate).toLocaleString("fa-AF")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  page={exchangesPage}
                  totalItems={exchanges.length}
                  pageSize={pageSize}
                  onPageChange={setExchangesPage}
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
