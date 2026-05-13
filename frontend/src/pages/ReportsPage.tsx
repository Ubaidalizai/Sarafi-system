import { useMemo, useState } from "react";
import { IconEye, IconPrint } from "../components/ActionIcons";
import { IconTooltipButton } from "../components/IconTooltipButton";
import { PaginationControls } from "../components/PaginationControls";
import { RawDetailModal } from "../components/RawDetailModal";
import { formatGregorianDate } from "../lib/formatDate";
import { printSlipDocument } from "../lib/printSlip";
import { normalizeSlipReviewStatus } from "../lib/slipReviewStatus";

type Props = {
  t: (key: string) => string;
  loadBalanceReports: () => Promise<void>;
  loadSlips: () => Promise<void>;
  slips: Array<{
    id: string;
    slipCode: string;
    currencyCode: string;
    amount: string;
    status: "issued" | "paid" | "cancelled" | "expired";
    reviewStatus?: "waiting" | "confirmed" | "rejected";
    createdAt: string;
    receiverName?: string | null;
    paidToName?: string | null;
    note?: string | null;
    fundingAccountId?: string | null;
    fundingAccount?: { id: string; displayName: string } | null;
    partnerAccountId?: string | null;
    partnerAccount?: { id: string; currencyCode: string; partner: { id: string; name: string } } | null;
    customer?: { fullName: string; phone?: string | null };
  }>;
  customerBalanceReport: Array<{
    id: string;
    currencyCode: string;
    balance: string;
    customer?: { fullName: string };
  }>;
  partnerBalanceReport: Array<{
    id: string;
    currencyCode: string;
    balance: string;
    partner?: { name: string };
  }>;
};

export function ReportsPage(props: Props) {
  const { t, loadBalanceReports, loadSlips, slips, customerBalanceReport, partnerBalanceReport } = props;
  const slipCashSourceCell = (slip: (typeof slips)[number]) =>
    slip.partnerAccountId && slip.partnerAccount?.partner?.name
      ? `${slip.partnerAccount.partner.name} — ${t("slipSourcePartnerTag")} (${slip.currencyCode})`
      : slip.fundingAccount?.displayName?.trim() || slip.receiverName?.trim() || "—";
  const [customerPage, setCustomerPage] = useState(1);
  const [slipsPage, setSlipsPage] = useState(1);
  const [partnerPage, setPartnerPage] = useState(1);
  const [rawDetail, setRawDetail] = useState<{ title: string; record: unknown } | null>(null);
  const pageSize = 10;
  const pagedCustomerBalances = useMemo(
    () => customerBalanceReport.slice((customerPage - 1) * pageSize, customerPage * pageSize),
    [customerBalanceReport, customerPage]
  );
  const pagedSlips = useMemo(() => slips.slice((slipsPage - 1) * pageSize, slipsPage * pageSize), [slips, slipsPage]);
  const pagedPartnerBalances = useMemo(
    () => partnerBalanceReport.slice((partnerPage - 1) * pageSize, partnerPage * pageSize),
    [partnerBalanceReport, partnerPage]
  );
  const customerCurrencyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of customerBalanceReport) {
      totals.set(row.currencyCode, (totals.get(row.currencyCode) || 0) + Number(row.balance || 0));
    }
    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [customerBalanceReport]);
  const partnerCurrencyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of partnerBalanceReport) {
      totals.set(row.currencyCode, (totals.get(row.currencyCode) || 0) + Number(row.balance || 0));
    }
    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [partnerBalanceReport]);
  const slipStatusTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of slips) {
      totals.set(row.status, (totals.get(row.status) || 0) + 1);
    }
    return Array.from(totals.entries()).map(([label, value]) => ({ label: t(label), value }));
  }, [slips, t]);
  const maxCustomerTotal = Math.max(1, ...customerCurrencyTotals.map((x) => x.value));
  const maxPartnerTotal = Math.max(1, ...partnerCurrencyTotals.map((x) => x.value));
  const maxSlipStatus = Math.max(1, ...slipStatusTotals.map((x) => x.value));
  const slipReviewLabel = (slip: (typeof slips)[number]) => {
    const r = normalizeSlipReviewStatus(slip.reviewStatus);
    return r === "confirmed" ? t("slipReviewConfirmed") : r === "rejected" ? t("slipReviewRejected") : t("slipReviewWaiting");
  };
  return (
    <section className="customersPageRoot">
      <div className="card formCard customersPageHeaderCard">
        <div className="heroTitle" style={{ marginBottom: 0 }}>{t("reports")}</div>
      </div>
      <div className="reportsChartsGrid">
        <div className="card listCard">
          <div className="heroTitle">{t("customerBalanceReport")} - {t("currency")}</div>
          {customerCurrencyTotals.length === 0 ? (
            <div className="emptyText">{t("noData")}</div>
          ) : (
            <div className="chartStack">
              {customerCurrencyTotals.map((item) => (
                <div className="chartRow" key={`c-${item.label}`}>
                  <div className="chartLabel">{item.label}</div>
                  <div className="chartTrack">
                    <div className="chartFill" style={{ width: `${(item.value / maxCustomerTotal) * 100}%` }} />
                  </div>
                  <div className="chartValue">{item.value.toLocaleString("fa-AF")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card listCard">
          <div className="heroTitle">{t("partnerBalanceReport")} - {t("currency")}</div>
          {partnerCurrencyTotals.length === 0 ? (
            <div className="emptyText">{t("noData")}</div>
          ) : (
            <div className="chartStack">
              {partnerCurrencyTotals.map((item) => (
                <div className="chartRow" key={`p-${item.label}`}>
                  <div className="chartLabel">{item.label}</div>
                  <div className="chartTrack">
                    <div className="chartFill chartFillAlt" style={{ width: `${(item.value / maxPartnerTotal) * 100}%` }} />
                  </div>
                  <div className="chartValue">{item.value.toLocaleString("fa-AF")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="card listCard">
        <div className="heroTitle">{t("slipsReport")} - {t("status")}</div>
        {slipStatusTotals.length === 0 ? (
          <div className="emptyText">{t("noData")}</div>
        ) : (
          <div className="chartStack">
            {slipStatusTotals.map((item) => (
              <div className="chartRow" key={`s-${item.label}`}>
                <div className="chartLabel">{item.label}</div>
                <div className="chartTrack">
                  <div className="chartFill chartFillStatus" style={{ width: `${(item.value / maxSlipStatus) * 100}%` }} />
                </div>
                <div className="chartValue">{item.value.toLocaleString("fa-AF")}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card listCard customersListCard">
        <div className="listHeader">
          <div className="heroTitle">{t("customerBalanceReport")}</div>
          <button className="navItem" onClick={loadBalanceReports} type="button">
            {t("refresh")}
          </button>
        </div>
        {customerBalanceReport.length === 0 ? (
          <div className="emptyText">{t("noData")}</div>
        ) : (
          <div className="customerTableWrap">
            <table className="customerTable">
              <thead>
                <tr>
                  <th>{t("customers")}</th>
                  <th>{t("currency")}</th>
                  <th>{t("balance")}</th>
                  <th>{t("quickActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedCustomerBalances.map((row) => (
                  <tr key={row.id}>
                    <td className="customerName">{row.customer?.fullName || "-"}</td>
                    <td>{row.currencyCode}</td>
                    <td>{Number(row.balance).toLocaleString("fa-AF")}</td>
                    <td>
                      <div className="customerActions slipRowActions">
                        <IconTooltipButton
                          className="iconActionBtn"
                          tooltip={t("view")}
                          onClick={() => setRawDetail({ title: t("recordDetails"), record: row })}
                        >
                          <IconEye />
                        </IconTooltipButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={customerPage}
          totalItems={customerBalanceReport.length}
          pageSize={pageSize}
          onPageChange={setCustomerPage}
          t={t}
        />
      </div>

      <div className="card listCard customersListCard">
        <div className="listHeader">
          <div className="heroTitle">{t("slipsReport")}</div>
          <button className="navItem" onClick={loadSlips} type="button">
            {t("refresh")}
          </button>
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
                  <th>{t("slipCashSource")}</th>
                  <th>{t("currency")}</th>
                  <th>{t("amount")}</th>
                  <th>{t("status")}</th>
                  <th>{t("slipReviewStatus")}</th>
                  <th>{t("createdAt")}</th>
                  <th>{t("quickActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedSlips.map((slip) => (
                  <tr key={slip.id}>
                    <td className="customerName">{slip.slipCode}</td>
                    <td>{slip.customer?.fullName || "-"}</td>
                    <td>{slipCashSourceCell(slip)}</td>
                    <td>{slip.currencyCode}</td>
                    <td>{Number(slip.amount).toLocaleString("fa-AF")}</td>
                    <td>{t(slip.status)}</td>
                    <td>
                      {normalizeSlipReviewStatus(slip.reviewStatus) === "confirmed"
                        ? t("slipReviewConfirmed")
                        : normalizeSlipReviewStatus(slip.reviewStatus) === "rejected"
                          ? t("slipReviewRejected")
                          : t("slipReviewWaiting")}
                    </td>
                    <td>{formatGregorianDate(slip.createdAt)}</td>
                    <td>
                      <div className="customerActions slipRowActions">
                        <IconTooltipButton
                          className="iconActionBtn"
                          tooltip={t("view")}
                          onClick={() => setRawDetail({ title: t("recordDetails"), record: slip })}
                        >
                          <IconEye />
                        </IconTooltipButton>
                        <IconTooltipButton
                          className="iconActionBtn"
                          tooltip={t("printSlip")}
                          onClick={() =>
                            printSlipDocument(slip, {
                              slipPrintHeading: t("slipDetails"),
                              slipCode: t("slipCode"),
                              customers: t("customers"),
                              accountName: t("accountName"),
                              slipPaidToName: t("slipPaidToName"),
                              currency: t("currency"),
                              amount: t("amount"),
                              status: t("status"),
                              slipReviewStatus: t("slipReviewStatus"),
                              createdAt: t("createdAt"),
                              notes: t("notes"),
                              slipStatusValue: t(slip.status),
                              slipReviewValue: slipReviewLabel(slip),
                            })
                          }
                        >
                          <IconPrint />
                        </IconTooltipButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={slipsPage}
          totalItems={slips.length}
          pageSize={pageSize}
          onPageChange={setSlipsPage}
          t={t}
        />
      </div>

      <div className="card listCard customersListCard">
        <div className="listHeader">
          <div className="heroTitle">{t("partnerBalanceReport")}</div>
          <button className="navItem" onClick={loadBalanceReports} type="button">
            {t("refresh")}
          </button>
        </div>
        {partnerBalanceReport.length === 0 ? (
          <div className="emptyText">{t("noData")}</div>
        ) : (
          <div className="customerTableWrap">
            <table className="customerTable">
              <thead>
                <tr>
                  <th>{t("partners")}</th>
                  <th>{t("currency")}</th>
                  <th>{t("balance")}</th>
                  <th>{t("quickActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedPartnerBalances.map((row) => (
                  <tr key={row.id}>
                    <td className="customerName">{row.partner?.name || "-"}</td>
                    <td>{row.currencyCode}</td>
                    <td>{Number(row.balance).toLocaleString("fa-AF")}</td>
                    <td>
                      <div className="customerActions slipRowActions">
                        <IconTooltipButton
                          className="iconActionBtn"
                          tooltip={t("view")}
                          onClick={() => setRawDetail({ title: t("recordDetails"), record: row })}
                        >
                          <IconEye />
                        </IconTooltipButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={partnerPage}
          totalItems={partnerBalanceReport.length}
          pageSize={pageSize}
          onPageChange={setPartnerPage}
          t={t}
        />
      </div>
      <RawDetailModal
        isOpen={rawDetail !== null}
        onClose={() => setRawDetail(null)}
        title={rawDetail?.title ?? ""}
        record={rawDetail?.record}
        closeLabel={t("cancel")}
        t={t}
      />
    </section>
  );
}

