import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FormModal } from "../components/FormModal";
import { PaginationControls } from "../components/PaginationControls";
import { RawDetailModal } from "../components/RawDetailModal";
import { formatGregorianDate } from "../lib/formatDate";

type Props = {
  t: (key: string) => string;
  partners: Array<{ id: string; name: string; country?: string | null; city?: string | null; contact?: string | null; notes?: string | null }>;
  partnerForm: { name: string; country: string; city: string; contact: string; notes: string };
  setPartnerForm: Dispatch<
    SetStateAction<{ name: string; country: string; city: string; contact: string; notes: string }>
  >;
  partnerSaving: boolean;
  onCreatePartner: (e: FormEvent) => Promise<boolean>;
  onUpdatePartner: (
    partnerId: string,
    payload: { name: string; country: string; city: string; contact: string; notes: string }
  ) => Promise<boolean>;
  onDeletePartner: (partnerId: string) => Promise<boolean>;
  currencies: Array<{ code: string; name?: string }>;
  partnerTxForm: {
    partnerId: string;
    currencyCode: string;
    amount: string;
    direction: "in" | "out";
    beneficiaryName: string;
    referenceNo: string;
    note: string;
    reconciliationStatus: "pending" | "confirmed" | "disputed";
  };
  setPartnerTxForm: Dispatch<
    SetStateAction<{
      partnerId: string;
      currencyCode: string;
      amount: string;
      direction: "in" | "out";
      beneficiaryName: string;
      referenceNo: string;
      note: string;
      reconciliationStatus: "pending" | "confirmed" | "disputed";
    }>
  >;
  loadPartnerAccounts: (partnerId: string) => Promise<void>;
  onCreatePartnerTx: (e: FormEvent) => Promise<boolean>;
  onUpdatePartnerTx: (txId: string, payload: {
    partnerId: string;
    currencyCode: string;
    amount: number;
    direction: "in" | "out";
    beneficiaryName: string;
    referenceNo: string;
    note: string;
    reconciliationStatus: "pending" | "confirmed" | "disputed";
  }) => Promise<boolean>;
  onDeletePartnerTx: (txId: string, partnerId?: string) => Promise<boolean>;
  partnerTxSaving: boolean;
  partnerMessage: string;
  partnerAccounts: Array<{ id: string; currencyCode: string; balance: string }>;
  partnerTxs: Array<{
    id: string;
    currencyCode: string;
    amount: string;
    direction: "in" | "out";
    beneficiaryName?: string | null;
    referenceNo?: string | null;
    note?: string | null;
    partnerId: string;
    reconciliationStatus: "pending" | "confirmed" | "disputed";
    createdAt: string;
    partner?: { id: string; name: string };
  }>;
  loadPartnerTxs: () => Promise<void>;
};

export function PartnersPage(props: Props) {
  const {
    t,
    partners,
    partnerForm,
    setPartnerForm,
    partnerSaving,
    onCreatePartner,
    onUpdatePartner,
    onDeletePartner,
    currencies,
    partnerTxForm,
    setPartnerTxForm,
    loadPartnerAccounts,
    onCreatePartnerTx,
    onUpdatePartnerTx,
    onDeletePartnerTx,
    partnerTxSaving,
    partnerMessage,
    partnerAccounts,
    partnerTxs,
    loadPartnerTxs,
  } = props;
  const [isPartnerModalOpen, setPartnerModalOpen] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [settlementMode, setSettlementMode] = useState<"in" | "out" | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [txEditForm, setTxEditForm] = useState({
    partnerId: "",
    currencyCode: "AFN",
    amount: "",
    direction: "in" as "in" | "out",
    beneficiaryName: "",
    referenceNo: "",
    note: "",
    reconciliationStatus: "pending" as "pending" | "confirmed" | "disputed",
  });
  const [partnersPage, setPartnersPage] = useState(1);
  const [balancesPage, setBalancesPage] = useState(1);
  const [txPage, setTxPage] = useState(1);
  const [partnersFilters, setPartnersFilters] = useState({ name: "", country: "", city: "" });
  const [txFilters, setTxFilters] = useState({
    partnerId: "",
    currencyCode: "",
    direction: "",
    reconciliationStatus: "",
  });
  const pageSize = 10;
  const [rawDetail, setRawDetail] = useState<{ title: string; record: unknown } | null>(null);
  const filteredPartners = useMemo(() => {
    const name = partnersFilters.name.trim().toLowerCase();
    return partners.filter((partner) => {
      const byName = !name || partner.name.toLowerCase().includes(name);
      const byCountry = !partnersFilters.country || (partner.country || "") === partnersFilters.country;
      const byCity = !partnersFilters.city || (partner.city || "") === partnersFilters.city;
      return byName && byCountry && byCity;
    });
  }, [partners, partnersFilters]);
  const pagedPartners = useMemo(
    () => filteredPartners.slice((partnersPage - 1) * pageSize, partnersPage * pageSize),
    [filteredPartners, partnersPage]
  );
  const pagedBalances = useMemo(
    () => partnerAccounts.slice((balancesPage - 1) * pageSize, balancesPage * pageSize),
    [partnerAccounts, balancesPage]
  );
  const filteredTxs = useMemo(() => {
    return partnerTxs.filter((tx) => {
      const byPartner = !txFilters.partnerId || tx.partner?.id === txFilters.partnerId;
      const byCurrency = !txFilters.currencyCode || tx.currencyCode === txFilters.currencyCode;
      const byDirection = !txFilters.direction || tx.direction === txFilters.direction;
      const byStatus = !txFilters.reconciliationStatus || tx.reconciliationStatus === txFilters.reconciliationStatus;
      return byPartner && byCurrency && byDirection && byStatus;
    });
  }, [partnerTxs, txFilters, partners]);
  const pagedTxs = useMemo(() => filteredTxs.slice((txPage - 1) * pageSize, txPage * pageSize), [filteredTxs, txPage]);
  const partnerTotals = useMemo(() => {
    const map: Record<string, { incoming: number; outgoing: number; balance: number }> = {};
    for (const tx of partnerTxs) {
      const partnerId = tx.partner?.id;
      if (!partnerId) continue;
      const amount = Number(tx.amount || 0);
      if (!map[partnerId]) map[partnerId] = { incoming: 0, outgoing: 0, balance: 0 };
      if (tx.direction === "in") {
        map[partnerId].incoming += amount;
      } else {
        map[partnerId].outgoing += amount;
      }
      map[partnerId].balance = map[partnerId].incoming - map[partnerId].outgoing;
    }
    return map;
  }, [partnerTxs]);

  const countryOptions = useMemo(
    () => Array.from(new Set(partners.map((p) => (p.country || "").trim()).filter(Boolean))),
    [partners]
  );
  const cityOptions = useMemo(
    () => Array.from(new Set(partners.map((p) => (p.city || "").trim()).filter(Boolean))),
    [partners]
  );
  const currencyNameByCode = useMemo(
    () => new Map(currencies.map((c) => [c.code.toUpperCase(), c.name || ""])),
    [currencies]
  );

  useEffect(() => {
    setPartnersPage(1);
  }, [partnersFilters.name, partnersFilters.country, partnersFilters.city]);

  useEffect(() => {
    setTxPage(1);
  }, [txFilters.partnerId, txFilters.currencyCode, txFilters.direction, txFilters.reconciliationStatus]);

  const submitPartnerModal = async (e: FormEvent) => {
    const ok = editingPartnerId
      ? await onUpdatePartner(editingPartnerId, partnerForm)
      : await onCreatePartner(e);
    if (ok) {
      setPartnerModalOpen(false);
      setEditingPartnerId(null);
    }
  };

  const openAddPartnerModal = () => {
    setEditingPartnerId(null);
    setPartnerForm({ name: "", country: "", city: "", contact: "", notes: "" });
    setPartnerModalOpen(true);
  };

  const openEditPartnerModal = (partner: { id: string; name: string; country?: string | null; city?: string | null; contact?: string | null; notes?: string | null }) => {
    setEditingPartnerId(partner.id);
    setPartnerForm((p) => ({
      ...p,
      name: partner.name,
      country: partner.country || "",
      city: partner.city || "",
      contact: partner.contact || "",
      notes: partner.notes || "",
    }));
    setPartnerModalOpen(true);
  };

  const deletePartnerRow = async (partnerId: string) => {
    if (!window.confirm(t("deletePartnerConfirm"))) return;
    await onDeletePartner(partnerId);
  };

  const submitSettlementModal = async (e: FormEvent) => {
    const ok = await onCreatePartnerTx(e);
    if (ok) setSettlementMode(null);
  };

  const parseLocalizedAmount = (value: string) => {
    const normalized = value
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      .replace(/٬/g, "")
      .replace(/,/g, "")
      .replace(/،/g, ".")
      .trim();
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : NaN;
  };

  const openEditTxModal = (tx: Props["partnerTxs"][number]) => {
    setEditingTxId(tx.id);
    setTxEditForm({
      partnerId: tx.partner?.id || tx.partnerId,
      currencyCode: tx.currencyCode,
      amount: String(tx.amount ?? ""),
      direction: tx.direction,
      beneficiaryName: tx.beneficiaryName || "",
      referenceNo: tx.referenceNo || "",
      note: tx.note || "",
      reconciliationStatus: tx.reconciliationStatus,
    });
  };

  const submitEditTxModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingTxId) return;
    const amount = parseLocalizedAmount(txEditForm.amount);
    if (!amount || amount <= 0) return;
    const ok = await onUpdatePartnerTx(editingTxId, {
      partnerId: txEditForm.partnerId,
      currencyCode: txEditForm.currencyCode,
      amount,
      direction: txEditForm.direction,
      beneficiaryName: txEditForm.beneficiaryName,
      referenceNo: txEditForm.referenceNo,
      note: txEditForm.note,
      reconciliationStatus: txEditForm.reconciliationStatus,
    });
    if (ok) setEditingTxId(null);
  };

  const deleteTxRow = async (tx: Props["partnerTxs"][number]) => {
    if (!window.confirm(t("deletePartnerTxConfirm"))) return;
    await onDeletePartnerTx(tx.id, tx.partner?.id || tx.partnerId);
  };

  return (
    <section className="customersPageRoot">
      <div className="card formCard customersPageHeaderCard">
        <div className="heroTitle" style={{ marginBottom: 0 }}>{t("partnerModule")}</div>
      </div>
      <div className="partnersSummaryRow partnersModernSummaryRow">
        <div className="card partnersSummaryCard partnersSummaryCardModern">
          <div className="card-title">{t("partnersList")}</div>
          <div className="card-hint">{t("partners")}</div>
          <div className="card-value">{partners.length.toLocaleString("fa-AF")}</div>
        </div>
        <div className="card partnersSummaryCard partnersSummaryCardModern">
          <div className="card-title">{t("partnerReport")}</div>
          <div className="card-hint">{t("settlementModule")}</div>
          <div className="card-value">{partnerTxs.length.toLocaleString("fa-AF")}</div>
        </div>
      </div>
      <section className="customersSection">
        <div className="card listCard customersListCard partnersListCardModern">
          <div className="listHeader">
            <div className="heroTitle">{t("partnersList")}</div>
            <div className="listHeaderActions">
              <button className="primaryBtn" type="button" onClick={openAddPartnerModal}>
                + {t("addPartner")}
              </button>
            </div>
          </div>
          <div className="depositsHistoryFilters">
            <label>
              <span className="depositsFilterLabel">{t("partnerName")}</span>
              <input
                type="text"
                value={partnersFilters.name}
                onChange={(e) => setPartnersFilters((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("search")}
              />
            </label>
            <label>
              <span className="depositsFilterLabel">{t("country")}</span>
              <select
                className="sarafiSelect"
                value={partnersFilters.country}
                onChange={(e) => setPartnersFilters((p) => ({ ...p, country: e.target.value }))}
              >
                <option value="">{t("all")}</option>
                {countryOptions.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="depositsFilterLabel">{t("city")}</span>
              <select
                className="sarafiSelect"
                value={partnersFilters.city}
                onChange={(e) => setPartnersFilters((p) => ({ ...p, city: e.target.value }))}
              >
                <option value="">{t("all")}</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="navItem"
              onClick={() => setPartnersFilters({ name: "", country: "", city: "" })}
            >
              {t("clearFilters")}
            </button>
          </div>
          <div className="partnersMetaPill">
            <span className="partnersMetaPillTitle">{t("all")}</span>
            <span className="partnersMetaPillValue">{filteredPartners.length.toLocaleString("fa-AF")}</span>
          </div>
          {filteredPartners.length === 0 ? (
            <div className="emptyText">{t("noPartners")}</div>
          ) : (
            <div className="customerTableWrap">
              <table className="customerTable">
                <thead>
                  <tr>
                    <th>{t("partnerName")}</th>
                    <th>{t("country")}</th>
                    <th>{t("city")}</th>
                    <th>{t("partnerIncomingTotal")}</th>
                    <th>{t("partnerOutgoingTotal")}</th>
                    <th>{t("withPartnerBalance")}</th>
                    <th>{t("quickActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPartners.map((partner) => (
                    <tr key={partner.id}>
                      <td className="customerName">
                        <Link className="customerProfileLink" to={`/partners/${partner.id}`}>
                          {partner.name}
                        </Link>
                      </td>
                      <td>{partner.country || "-"}</td>
                      <td>{partner.city || "-"}</td>
                      <td>{(partnerTotals[partner.id]?.incoming ?? 0).toLocaleString("fa-AF")}</td>
                      <td>{(partnerTotals[partner.id]?.outgoing ?? 0).toLocaleString("fa-AF")}</td>
                      <td>{(partnerTotals[partner.id]?.balance ?? 0).toLocaleString("fa-AF")}</td>
                      <td>
                        <div className="customerActions">
                          <button className="navItem" type="button" onClick={() => setRawDetail({ title: t("recordDetails"), record: partner })}>
                            {t("view")}
                          </button>
                          <button className="navItem" type="button" onClick={() => openEditPartnerModal(partner)}>
                            {t("edit")}
                          </button>
                          <button className="navItem slipDeleteBtn" type="button" onClick={() => void deletePartnerRow(partner.id)}>
                            {t("delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PaginationControls
            page={partnersPage}
            totalItems={filteredPartners.length}
            pageSize={pageSize}
            onPageChange={setPartnersPage}
            t={t}
          />
        </div>
      </section>

      <section className="customersSection partnersSplitSection partnersSplitSectionModern">
        <div className="card formCard partnersActionCardModern partnersActionCardModern--in">
          <div className="partnersActionTop">
            <span className="partnersActionBadge">{t("incomingDirection")}</span>
            <div className="heroTitle">{t("settlementPartInTitle")}</div>
          </div>
          <div className="partnersActionHint">{t("settlementPartInHint")}</div>
          <button
            className="primaryBtn partnersActionBtn"
            type="button"
            onClick={() => {
              setPartnerTxForm((p) => ({ ...p, direction: "in" }));
              setSettlementMode("in");
            }}
          >
            {t("addSettlementIn")}
          </button>
          {partnerMessage ? <div className="partnersActionMessage">{partnerMessage}</div> : null}
        </div>
        <div className="card formCard partnersActionCardModern partnersActionCardModern--out">
          <div className="partnersActionTop">
            <span className="partnersActionBadge">{t("outgoingDirection")}</span>
            <div className="heroTitle">{t("settlementPartOutTitle")}</div>
          </div>
          <div className="partnersActionHint">{t("settlementPartOutHint")}</div>
          <button
            className="primaryBtn partnersActionBtn"
            type="button"
            onClick={() => {
              setPartnerTxForm((p) => ({ ...p, direction: "out" }));
              setSettlementMode("out");
            }}
          >
            {t("addSettlementOut")}
          </button>
          {partnerMessage ? <div className="partnersActionMessage">{partnerMessage}</div> : null}
        </div>

        <div className="card listCard customersListCard partnersBalancesCardModern">
          <div className="heroTitle">{t("partnerBalances")}</div>
          {!partnerTxForm.partnerId ? (
            <div className="emptyText">{t("chooseCustomerFirst")}</div>
          ) : partnerAccounts.length === 0 ? (
            <div className="emptyText">{t("noBalances")}</div>
          ) : (
            <div className="customerTableWrap">
              <table className="customerTable">
                <thead>
                  <tr>
                    <th>{t("partnerAccountKataHeader")}</th>
                    <th>{t("balance")}</th>
                    <th>{t("quickActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBalances.map((account) => (
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
                      <td>
                        <div className="customerActions">
                          <button className="navItem" type="button" onClick={() => setRawDetail({ title: t("recordDetails"), record: account })}>
                            {t("view")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PaginationControls
            page={balancesPage}
            totalItems={partnerAccounts.length}
            pageSize={pageSize}
            onPageChange={setBalancesPage}
            t={t}
          />
        </div>
      </section>

      <FormModal
        isOpen={Boolean(settlementMode)}
        onClose={() => setSettlementMode(null)}
        title={settlementMode === "out" ? t("addSettlementOut") : t("addSettlementIn")}
      >
        <form className="customerForm" onSubmit={submitSettlementModal}>
          <label>
            {t("partners")}
            <select
              value={partnerTxForm.partnerId}
              onChange={(e) => {
                const partnerId = e.target.value;
                setPartnerTxForm((p) => ({ ...p, partnerId }));
                loadPartnerAccounts(partnerId);
              }}
              required
            >
              <option value="">--</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("currency")}
            <select
              value={partnerTxForm.currencyCode}
              onChange={(e) => setPartnerTxForm((p) => ({ ...p, currencyCode: e.target.value }))}
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {t("kataPrefix")} — {currency.code}
                  {currency.name?.trim() ? ` (${currency.name.trim()})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("amount")}
            <input
              type="text"
              inputMode="decimal"
              value={partnerTxForm.amount}
              onChange={(e) => setPartnerTxForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </label>
          {settlementMode === "out" ? (
            <label>
              {t("beneficiaryName")}
              <input
                value={partnerTxForm.beneficiaryName}
                onChange={(e) => setPartnerTxForm((p) => ({ ...p, beneficiaryName: e.target.value }))}
                placeholder={t("beneficiaryHint")}
                required
              />
            </label>
          ) : null}
          <label>
            {t("referenceNo")}
            <input
              value={partnerTxForm.referenceNo}
              onChange={(e) => setPartnerTxForm((p) => ({ ...p, referenceNo: e.target.value }))}
            />
          </label>
          <label>
            {t("reconciliationStatus")}
            <select
              value={partnerTxForm.reconciliationStatus}
              onChange={(e) =>
                setPartnerTxForm((p) => ({
                  ...p,
                  reconciliationStatus: e.target.value as "pending" | "confirmed" | "disputed",
                }))
              }
            >
              <option value="pending">{t("pending")}</option>
              <option value="confirmed">{t("confirmed")}</option>
              <option value="disputed">{t("disputed")}</option>
            </select>
          </label>
          <label>
            {t("notes")}
            <textarea
              rows={2}
              value={partnerTxForm.note}
              onChange={(e) => setPartnerTxForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <div className="modalActions">
            <button className="primaryBtn" type="submit" disabled={partnerTxSaving}>
              {partnerTxSaving ? `${t("save")}...` : t("save")}
            </button>
            <button className="navItem" type="button" onClick={() => setSettlementMode(null)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </FormModal>
      <FormModal isOpen={isPartnerModalOpen} onClose={() => { setPartnerModalOpen(false); setEditingPartnerId(null); }} title={editingPartnerId ? t("editPartner") : t("addPartner")}>
        <form className="customerForm" onSubmit={submitPartnerModal}>
          <label>
            {t("partnerName")}
            <input
              value={partnerForm.name}
              onChange={(e) => setPartnerForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </label>
          <label>
            {t("country")}
            <input
              value={partnerForm.country}
              onChange={(e) => setPartnerForm((p) => ({ ...p, country: e.target.value }))}
            />
          </label>
          <label>
            {t("city")}
            <input
              value={partnerForm.city}
              onChange={(e) => setPartnerForm((p) => ({ ...p, city: e.target.value }))}
            />
          </label>
          <label>
            {t("contact")}
            <input
              value={partnerForm.contact}
              onChange={(e) => setPartnerForm((p) => ({ ...p, contact: e.target.value }))}
            />
          </label>
          <label>
            {t("notes")}
            <textarea
              rows={2}
              value={partnerForm.notes}
              onChange={(e) => setPartnerForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
          <div className="modalActions">
            <button className="primaryBtn" type="submit" disabled={partnerSaving}>
              {partnerSaving ? `${t("save")}...` : t("save")}
            </button>
            <button className="navItem" type="button" onClick={() => setPartnerModalOpen(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </FormModal>
      <section className="card listCard customersListCard partnersTxCardModern">
        <div className="listHeader">
          <div className="heroTitle">{t("partnerReport")}</div>
          <button className="navItem" onClick={loadPartnerTxs} type="button">
            {t("refresh")}
          </button>
        </div>
        <div className="depositsHistoryFilters">
          <label>
            <span className="depositsFilterLabel">{t("partners")}</span>
            <select
              className="sarafiSelect"
              value={txFilters.partnerId}
              onChange={(e) => setTxFilters((p) => ({ ...p, partnerId: e.target.value }))}
            >
              <option value="">{t("all")}</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="depositsFilterLabel">{t("currency")}</span>
            <select
              className="sarafiSelect"
              value={txFilters.currencyCode}
              onChange={(e) => setTxFilters((p) => ({ ...p, currencyCode: e.target.value }))}
            >
              <option value="">{t("all")}</option>
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {t("kataPrefix")} — {currency.code}
                  {currency.name?.trim() ? ` (${currency.name.trim()})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="depositsFilterLabel">{t("direction")}</span>
            <select
              className="sarafiSelect"
              value={txFilters.direction}
              onChange={(e) => setTxFilters((p) => ({ ...p, direction: e.target.value }))}
            >
              <option value="">{t("all")}</option>
              <option value="in">{t("incomingDirection")}</option>
              <option value="out">{t("outgoingDirection")}</option>
            </select>
          </label>
          <label>
            <span className="depositsFilterLabel">{t("reconciliationStatus")}</span>
            <select
              className="sarafiSelect"
              value={txFilters.reconciliationStatus}
              onChange={(e) => setTxFilters((p) => ({ ...p, reconciliationStatus: e.target.value }))}
            >
              <option value="">{t("all")}</option>
              <option value="pending">{t("pending")}</option>
              <option value="confirmed">{t("confirmed")}</option>
              <option value="disputed">{t("disputed")}</option>
            </select>
          </label>
          <button
            type="button"
            className="navItem"
            onClick={() => setTxFilters({ partnerId: "", currencyCode: "", direction: "", reconciliationStatus: "" })}
          >
            {t("clearFilters")}
          </button>
        </div>
        {filteredTxs.length === 0 ? (
          <div className="emptyText">{t("noPartnerTx")}</div>
        ) : (
          <div className="customerTableWrap">
            <table className="customerTable">
              <thead>
                <tr>
                  <th>{t("partners")}</th>
                  <th>{t("currency")}</th>
                  <th>{t("amount")}</th>
                  <th>{t("direction")}</th>
                  <th>{t("beneficiaryName")}</th>
                  <th>{t("reconciliationStatus")}</th>
                  <th>{t("createdAt")}</th>
                  <th>{t("quickActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedTxs.map((tx) => (
                  <tr key={tx.id}>
                    <td className="customerName">{tx.partner?.name || "-"}</td>
                    <td>{tx.currencyCode}</td>
                    <td>{Number(tx.amount).toLocaleString("fa-AF")}</td>
                    <td>
                      <span className={`statusPill ${tx.direction === "in" ? "statusIn" : "statusOut"}`}>
                        {tx.direction === "in" ? t("incomingDirection") : t("outgoingDirection")}
                      </span>
                    </td>
                    <td>{tx.direction === "out" ? tx.beneficiaryName || "-" : "-"}</td>
                    <td>
                      <span className={`statusPill status-${tx.reconciliationStatus}`}>{t(tx.reconciliationStatus)}</span>
                    </td>
                    <td>{formatGregorianDate(tx.createdAt)}</td>
                    <td>
                      <div className="customerActions">
                        <button className="navItem" type="button" onClick={() => setRawDetail({ title: t("recordDetails"), record: tx })}>
                          {t("view")}
                        </button>
                        <button className="navItem" type="button" onClick={() => openEditTxModal(tx)}>
                          {t("edit")}
                        </button>
                        <button className="navItem slipDeleteBtn" type="button" onClick={() => void deleteTxRow(tx)}>
                          {t("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={txPage}
          totalItems={filteredTxs.length}
          pageSize={pageSize}
          onPageChange={setTxPage}
          t={t}
        />
      </section>
      <FormModal isOpen={Boolean(editingTxId)} onClose={() => setEditingTxId(null)} title={t("editPartnerTx")}>
        <form className="customerForm" onSubmit={submitEditTxModal}>
          <label>
            {t("partners")}
            <select
              value={txEditForm.partnerId}
              onChange={(e) => setTxEditForm((p) => ({ ...p, partnerId: e.target.value }))}
              required
            >
              <option value="">--</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("currency")}
            <select
              value={txEditForm.currencyCode}
              onChange={(e) => setTxEditForm((p) => ({ ...p, currencyCode: e.target.value }))}
              required
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {t("kataPrefix")} — {currency.code}
                  {currency.name?.trim() ? ` (${currency.name.trim()})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("amount")}
            <input
              type="text"
              inputMode="decimal"
              value={txEditForm.amount}
              onChange={(e) => setTxEditForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </label>
          <label>
            {t("direction")}
            <select
              value={txEditForm.direction}
              onChange={(e) => setTxEditForm((p) => ({ ...p, direction: e.target.value as "in" | "out" }))}
              required
            >
              <option value="in">{t("incomingDirection")}</option>
              <option value="out">{t("outgoingDirection")}</option>
            </select>
          </label>
          {txEditForm.direction === "out" ? (
            <label>
              {t("beneficiaryName")}
              <input
                value={txEditForm.beneficiaryName}
                onChange={(e) => setTxEditForm((p) => ({ ...p, beneficiaryName: e.target.value }))}
                required
              />
            </label>
          ) : null}
          <label>
            {t("referenceNo")}
            <input
              value={txEditForm.referenceNo}
              onChange={(e) => setTxEditForm((p) => ({ ...p, referenceNo: e.target.value }))}
            />
          </label>
          <label>
            {t("reconciliationStatus")}
            <select
              value={txEditForm.reconciliationStatus}
              onChange={(e) =>
                setTxEditForm((p) => ({
                  ...p,
                  reconciliationStatus: e.target.value as "pending" | "confirmed" | "disputed",
                }))
              }
              required
            >
              <option value="pending">{t("pending")}</option>
              <option value="confirmed">{t("confirmed")}</option>
              <option value="disputed">{t("disputed")}</option>
            </select>
          </label>
          <label>
            {t("notes")}
            <textarea
              rows={2}
              value={txEditForm.note}
              onChange={(e) => setTxEditForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <div className="modalActions">
            <button className="primaryBtn" type="submit" disabled={partnerTxSaving}>
              {partnerTxSaving ? `${t("save")}...` : t("save")}
            </button>
            <button className="navItem" type="button" onClick={() => setEditingTxId(null)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </FormModal>
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

