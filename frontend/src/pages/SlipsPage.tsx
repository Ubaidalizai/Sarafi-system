import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { FormModal } from "../components/FormModal";
import { PaginationControls } from "../components/PaginationControls";

function IconClock() {
  return (
    <svg className="slipPaidSvg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 7v6l4 2" />
    </svg>
  );
}

function IconPaid() {
  return (
    <svg className="slipPaidSvg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M6 9v6M18 9v6" />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg className="slipPaidCheckSvg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M8 12l3 3 5-6" />
    </svg>
  );
}

function parseSlipAmount(value: string) {
  const normalized = value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/٬/g, "")
    .replace(/،/g, ".")
    .trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

type Slip = {
  id: string;
  slipCode: string;
  customerId: string;
  currencyCode: string;
  amount: string;
  status: "issued" | "paid" | "cancelled" | "expired";
  createdAt: string;
  receiverName?: string | null;
  note?: string | null;
  customer?: { fullName: string; phone?: string | null };
};

type Props = {
  t: (key: string) => string;
  customers: Array<{ id: string; fullName: string }>;
  currencies: Array<{ code: string }>;
  slipForm: {
    customerId: string;
    currencyCode: string;
    amount: string;
    receiverName: string;
    receiverTazkira: string;
    receiverPhone: string;
    note: string;
    markPaid: boolean;
  };
  setSlipForm: Dispatch<
    SetStateAction<{
      customerId: string;
      currencyCode: string;
      amount: string;
      receiverName: string;
      receiverTazkira: string;
      receiverPhone: string;
      note: string;
      markPaid: boolean;
    }>
  >;
  slipSaving: boolean;
  onIssueSlip: (e: FormEvent) => Promise<boolean>;
  slipMessage: string;
  clearSlipMessage: () => void;
  slipsLoading: boolean;
  slips: Slip[];
  slipFilters: { customerId: string; status: string; currencyCode: string; from: string; to: string };
  setSlipFilters: Dispatch<
    SetStateAction<{
      customerId: string;
      status: string;
      currencyCode: string;
      from: string;
      to: string;
    }>
  >;
  loadSlips: () => Promise<void>;
  setSlipStatus: (slipCode: string, status: "cancelled" | "expired") => Promise<void>;
  slipMutating: boolean;
  onUpdateSlip: (
    slipCode: string,
    payload: { customerId: string; currencyCode: string; amount: number; receiverName: string; note: string }
  ) => Promise<boolean>;
  onDeleteSlip: (slipCode: string) => Promise<boolean>;
};

export function SlipsPage(props: Props) {
  const {
    t,
    customers,
    currencies,
    slipForm,
    setSlipForm,
    slipSaving,
    onIssueSlip,
    slipMessage,
    clearSlipMessage,
    slipsLoading,
    slips,
    slipFilters,
    setSlipFilters,
    loadSlips,
    setSlipStatus,
    slipMutating,
    onUpdateSlip,
    onDeleteSlip,
  } = props;
  const [isIssueModalOpen, setIssueModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editSlipCode, setEditSlipCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    customerId: "",
    currencyCode: "AFN",
    amount: "",
    receiverName: "",
    note: "",
  });
  const [slipsPage, setSlipsPage] = useState(1);
  const pageSize = 10;
  const pagedSlips = useMemo(() => slips.slice((slipsPage - 1) * pageSize, slipsPage * pageSize), [slips, slipsPage]);
  const activeFilterCount = useMemo(
    () => [slipFilters.customerId, slipFilters.status, slipFilters.currencyCode, slipFilters.from, slipFilters.to].filter(Boolean).length,
    [slipFilters]
  );
  const clearSlipFilters = () => {
    setSlipFilters({ customerId: "", status: "", currencyCode: "", from: "", to: "" });
    setSlipsPage(1);
  };

  useEffect(() => {
    setSlipsPage(1);
  }, [slipFilters.customerId, slipFilters.status, slipFilters.currencyCode, slipFilters.from, slipFilters.to]);

  const openIssueModal = () => {
    clearSlipMessage();
    setIssueModalOpen(true);
  };

  const submitIssueModal = async (e: FormEvent) => {
    const ok = await onIssueSlip(e);
    if (ok) setIssueModalOpen(false);
  };

  const openEditModal = (slip: Slip) => {
    if (slip.status !== "issued") return;
    clearSlipMessage();
    setEditSlipCode(slip.slipCode);
    setEditForm({
      customerId: slip.customerId,
      currencyCode: slip.currencyCode,
      amount: String(Number(slip.amount)),
      receiverName: slip.receiverName?.trim() || "",
      note: slip.note?.trim() || "",
    });
    setEditModalOpen(true);
  };

  const submitEditModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!editSlipCode) return;
    const amount = parseSlipAmount(editForm.amount);
    if (!editForm.customerId || !amount || amount <= 0) return;
    const ok = await onUpdateSlip(editSlipCode, {
      customerId: editForm.customerId,
      currencyCode: editForm.currencyCode,
      amount,
      receiverName: editForm.receiverName.trim(),
      note: editForm.note.trim(),
    });
    if (ok) {
      setEditModalOpen(false);
      setEditSlipCode(null);
    }
  };

  const deleteSlipRow = async (slip: Slip) => {
    const msg =
      slip.status === "paid"
        ? `${t("deleteSlipConfirm")}\n\n${t("deleteSlipConfirmPaidHint")}`
        : t("deleteSlipConfirm");
    if (!window.confirm(msg)) return;
    await onDeleteSlip(slip.slipCode);
  };

  return (
    <section className="customersPageRoot">
      <div className="card formCard customersPageHeaderCard">
        <div className="heroTitle" style={{ marginBottom: 0 }}>{t("slipModule")}</div>
      </div>

      <FormModal
        isOpen={isIssueModalOpen}
        onClose={() => {
          setIssueModalOpen(false);
          clearSlipMessage();
        }}
        title={t("issueSlip")}
      >
        <form className="customerForm" onSubmit={submitIssueModal}>
          <label>
            {t("selectCustomer")}
            <select
              className="sarafiSelect"
              value={slipForm.customerId}
              onChange={(e) => setSlipForm((p) => ({ ...p, customerId: e.target.value }))}
              required
            >
              <option value="">—</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("currency")}
            <select
              className="sarafiSelect"
              value={slipForm.currencyCode}
              onChange={(e) => setSlipForm((p) => ({ ...p, currencyCode: e.target.value }))}
              required
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("amount")}
            <input
              type="text"
              inputMode="decimal"
              value={slipForm.amount}
              onChange={(e) => setSlipForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </label>
          <label>
            {t("receiverName")}
            <input
              value={slipForm.receiverName}
              onChange={(e) => setSlipForm((p) => ({ ...p, receiverName: e.target.value }))}
              required
            />
          </label>
          <label>
            {t("receiverTazkira")}
            <input
              value={slipForm.receiverTazkira}
              onChange={(e) => setSlipForm((p) => ({ ...p, receiverTazkira: e.target.value }))}
              required
            />
          </label>
          <label>
            {t("receiverPhone")}
            <input
              value={slipForm.receiverPhone}
              onChange={(e) => setSlipForm((p) => ({ ...p, receiverPhone: e.target.value }))}
            />
          </label>
          <label>
            {t("notes")}
            <textarea
              rows={2}
              value={slipForm.note}
              onChange={(e) => setSlipForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <div className="slipPaidShell" role="radiogroup" aria-labelledby="slip-paid-heading">
            <div className="slipPaidTop">
              <p id="slip-paid-heading" className="slipPaidTitle">
                {t("slipMoneyPaidStatus")}
              </p>
              <p className="slipPaidHint">{t("slipMoneyPaidHint")}</p>
            </div>
            <div className="slipPaidGrid">
              <label
                className={`slipPaidCard slipPaidCard--later ${!slipForm.markPaid ? "slipPaidCard--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="slipMarkPaid"
                  className="sr-only"
                  checked={!slipForm.markPaid}
                  onChange={() => setSlipForm((p) => ({ ...p, markPaid: false }))}
                />
                <span className="slipPaidCardAccent" aria-hidden />
                <span className="slipPaidCardInner">
                  <span className="slipPaidCardIconWrap slipPaidCardIconWrap--later" aria-hidden>
                    <IconClock />
                  </span>
                  <span className="slipPaidCardText">
                    <span className="slipPaidCardLabel">{t("slipNotPaidYet")}</span>
                    <span className="slipPaidCardDesc">{t("slipNotPaidYetSub")}</span>
                  </span>
                  <span className="slipPaidCardMark" aria-hidden>
                    {!slipForm.markPaid ? <IconCheckCircle /> : null}
                  </span>
                </span>
              </label>
              <label
                className={`slipPaidCard slipPaidCard--now ${slipForm.markPaid ? "slipPaidCard--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="slipMarkPaid"
                  className="sr-only"
                  checked={slipForm.markPaid}
                  onChange={() => setSlipForm((p) => ({ ...p, markPaid: true }))}
                />
                <span className="slipPaidCardAccent" aria-hidden />
                <span className="slipPaidCardInner">
                  <span className="slipPaidCardIconWrap slipPaidCardIconWrap--now" aria-hidden>
                    <IconPaid />
                  </span>
                  <span className="slipPaidCardText">
                    <span className="slipPaidCardLabel">{t("slipPaidNow")}</span>
                    <span className="slipPaidCardDesc">{t("slipPaidNowSub")}</span>
                  </span>
                  <span className="slipPaidCardMark" aria-hidden>
                    {slipForm.markPaid ? <IconCheckCircle /> : null}
                  </span>
                </span>
              </label>
            </div>
          </div>
          {slipMessage ? <div className="slipModalFeedback">{slipMessage}</div> : null}
          <div className="modalActions">
            <button className="primaryBtn" type="submit" disabled={slipSaving}>
              {slipSaving ? `${t("save")}...` : t("save")}
            </button>
            <button className="navItem" type="button" onClick={() => setIssueModalOpen(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </FormModal>
      <FormModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditSlipCode(null);
          clearSlipMessage();
        }}
        title={t("editSlip")}
      >
        <form className="customerForm" onSubmit={submitEditModal}>
          <p className="slipEditCodeLine">
            <span className="slipEditCodeLabel">{t("slipCode")}:</span>{" "}
            <span className="slipEditCodeValue">{editSlipCode || "—"}</span>
          </p>
          <label>
            {t("selectCustomer")}
            <select
              className="sarafiSelect"
              value={editForm.customerId}
              onChange={(e) => setEditForm((p) => ({ ...p, customerId: e.target.value }))}
              required
            >
              <option value="">—</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("currency")}
            <select
              className="sarafiSelect"
              value={editForm.currencyCode}
              onChange={(e) => setEditForm((p) => ({ ...p, currencyCode: e.target.value }))}
              required
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("amount")}
            <input
              type="text"
              inputMode="decimal"
              value={editForm.amount}
              onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </label>
          <label>
            {t("receiverName")}
            <input
              value={editForm.receiverName}
              onChange={(e) => setEditForm((p) => ({ ...p, receiverName: e.target.value }))}
            />
          </label>
          <label>
            {t("notes")}
            <textarea
              rows={2}
              value={editForm.note}
              onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <p className="slipEditHint">{t("slipEditHint")}</p>
          {slipMessage ? <div className="slipModalFeedback">{slipMessage}</div> : null}
          <div className="modalActions">
            <button className="primaryBtn" type="submit" disabled={slipMutating}>
              {slipMutating ? `${t("save")}...` : t("save")}
            </button>
            <button
              className="navItem"
              type="button"
              onClick={() => {
                setEditModalOpen(false);
                setEditSlipCode(null);
                clearSlipMessage();
              }}
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      </FormModal>
      <section className="card listCard customersListCard">
        <div className="reportFilterHeader">
          <div className="reportFilterTitleWrap">
            <div className="heroTitle">{t("slipsReport")}</div>
            <div className="reportFilterSubtitle">{t("filters")}</div>
          </div>
          <div className="reportFilterMeta">
            <div className="reportMetaPill">
              {t("all")}: {slips.length.toLocaleString("fa-AF")}
            </div>
            <div className="reportMetaPill reportMetaPillActive">
              {t("filters")}: {activeFilterCount.toLocaleString("fa-AF")}
            </div>
          </div>
          <div className="listHeaderActions reportFilterActions slipsReportActions">
            <button className="primaryBtn" type="button" onClick={openIssueModal}>
              + {t("issueSlip")}
            </button>
            <button className="navItem" onClick={loadSlips} type="button">
              {t("refresh")}
            </button>
          </div>
        </div>
        <div className="reportFilterToolbar">
          <div className="reportFilterGrid">
            <label>
              <span className="filterLabelText">{t("selectCustomer")}</span>
              <select
                value={slipFilters.customerId}
                onChange={(e) => setSlipFilters((p) => ({ ...p, customerId: e.target.value }))}
              >
                <option value="">{t("all")}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="filterLabelText">{t("status")}</span>
              <select
                value={slipFilters.status}
                onChange={(e) => setSlipFilters((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="">{t("all")}</option>
                <option value="issued">{t("issued")}</option>
                <option value="paid">{t("paid")}</option>
                <option value="cancelled">{t("cancelled")}</option>
                <option value="expired">{t("expired")}</option>
              </select>
            </label>
            <label>
              <span className="filterLabelText">{t("currency")}</span>
              <select
                value={slipFilters.currencyCode}
                onChange={(e) => setSlipFilters((p) => ({ ...p, currencyCode: e.target.value }))}
              >
                <option value="">{t("all")}</option>
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="filterLabelText">{t("fromDate")}</span>
              <input
                type="date"
                value={slipFilters.from}
                onChange={(e) => setSlipFilters((p) => ({ ...p, from: e.target.value }))}
              />
            </label>
            <label>
              <span className="filterLabelText">{t("toDate")}</span>
              <input
                type="date"
                value={slipFilters.to}
                onChange={(e) => setSlipFilters((p) => ({ ...p, to: e.target.value }))}
              />
            </label>
          </div>
          <div className="reportFilterActionsRow">
            <button className="primaryBtn" type="button" onClick={loadSlips} disabled={slipsLoading}>
              {slipsLoading ? t("loading") : t("search")}
            </button>
            <button className="navItem ghostBtn" type="button" onClick={clearSlipFilters}>
              {t("clearFilters")}
            </button>
          </div>
        </div>
        {slipMessage ? <div className="emptyText" style={{ marginTop: "8px", marginBottom: "8px" }}>{slipMessage}</div> : null}

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
                  <th>{t("quickActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedSlips.map((slip) => (
                  <tr key={slip.id}>
                    <td className="customerName">{slip.slipCode}</td>
                    <td>{slip.customer?.fullName || "-"}</td>
                    <td>{slip.currencyCode}</td>
                    <td>{Number(slip.amount).toLocaleString("fa-AF")}</td>
                    <td>{t(slip.status)}</td>
                    <td>{new Date(slip.createdAt).toLocaleDateString("fa-AF")}</td>
                    <td>
                      <div className="customerActions slipRowActions">
                        {slip.status === "issued" ? (
                          <>
                            <button className="navItem" type="button" onClick={() => openEditModal(slip)}>
                              {t("edit")}
                            </button>
                            <button className="navItem" type="button" onClick={() => setSlipStatus(slip.slipCode, "cancelled")}>
                              {t("cancelSlip")}
                            </button>
                            <button className="navItem" type="button" onClick={() => setSlipStatus(slip.slipCode, "expired")}>
                              {t("expireSlip")}
                            </button>
                          </>
                        ) : null}
                        <button
                          className="navItem slipDeleteBtn"
                          type="button"
                          disabled={slipMutating}
                          onClick={() => void deleteSlipRow(slip)}
                        >
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
          page={slipsPage}
          totalItems={slips.length}
          pageSize={pageSize}
          onPageChange={setSlipsPage}
          t={t}
        />
      </section>
    </section>
  );
}

