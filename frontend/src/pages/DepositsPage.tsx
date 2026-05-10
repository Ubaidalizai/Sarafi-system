import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { FormModal } from "../components/FormModal";
import { PaginationControls } from "../components/PaginationControls";

type DepositHistoryFilters = { customerId: string; currencyCode: string };

type Props = {
  t: (key: string) => string;
  customers: Array<{ id: string; fullName: string }>;
  currencies: Array<{ code: string; name: string }>;
  accounts: Array<{ id: string; currencyCode: string; balance: string }>;
  deposits: Array<{ id: string; customerId: string; currencyCode: string; amount: string; note?: string | null; createdAt: string; customer?: { fullName: string } }>;
  depositForm: {
    customerId: string;
    currencyCode: string;
    amount: string;
    note: string;
    convertToOtherCurrency: boolean;
    targetCurrencyCode: string;
    rate: string;
    feeAmount: string;
  };
  setDepositForm: Dispatch<
    SetStateAction<{
      customerId: string;
      currencyCode: string;
      amount: string;
      note: string;
      convertToOtherCurrency: boolean;
      targetCurrencyCode: string;
      rate: string;
      feeAmount: string;
    }>
  >;
  depositSaving: boolean;
  depositMessage: string;
  onDepositSubmit: (e: FormEvent) => Promise<void>;
  loadAccounts: (customerId: string) => Promise<void>;
  depositHistoryFilters: DepositHistoryFilters;
  setDepositHistoryFilters: Dispatch<SetStateAction<DepositHistoryFilters>>;
  loadDeposits: () => Promise<void>;
  onUpdateDeposit: (depositId: string, payload: { customerId: string; currencyCode: string; amount: number; note: string }) => Promise<boolean>;
  onDeleteDeposit: (depositId: string, customerId: string) => Promise<boolean>;
};

export function DepositsPage(props: Props) {
  const {
    t,
    customers,
    currencies,
    accounts,
    deposits,
    depositForm,
    setDepositForm,
    depositSaving,
    depositMessage,
    onDepositSubmit,
    loadAccounts,
    depositHistoryFilters,
    setDepositHistoryFilters,
    loadDeposits,
    onUpdateDeposit,
    onDeleteDeposit,
  } = props;
  const [isDepositModalOpen, setDepositModalOpen] = useState(false);
  const [editingDepositId, setEditingDepositId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ customerId: "", currencyCode: "AFN", amount: "", note: "" });
  const [historyPage, setHistoryPage] = useState(1);
  const pageSize = 10;
  const pagedDeposits = useMemo(
    () => deposits.slice((historyPage - 1) * pageSize, historyPage * pageSize),
    [deposits, historyPage]
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [depositHistoryFilters.customerId, depositHistoryFilters.currencyCode]);

  const submitFromModal = async (e: FormEvent) => {
    await onDepositSubmit(e);
    setDepositModalOpen(false);
  };

  const parseLocalizedAmount = (value: string) => {
    const normalized = value
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      .replace(/٬/g, "")
      .replace(/،/g, ".")
      .trim();
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : NaN;
  };

  const openEditModal = (item: Props["deposits"][number]) => {
    setEditingDepositId(item.id);
    setEditForm({
      customerId: item.customerId,
      currencyCode: item.currencyCode,
      amount: String(item.amount),
      note: item.note || "",
    });
  };

  const submitEditModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingDepositId) return;
    const amount = parseLocalizedAmount(editForm.amount);
    if (!editForm.customerId || !amount || amount <= 0) return;
    const ok = await onUpdateDeposit(editingDepositId, {
      customerId: editForm.customerId,
      currencyCode: editForm.currencyCode,
      amount,
      note: editForm.note,
    });
    if (ok) setEditingDepositId(null);
  };

  const deleteDepositRow = async (item: Props["deposits"][number]) => {
    if (!window.confirm(t("deleteDepositConfirm"))) return;
    await onDeleteDeposit(item.id, item.customerId);
  };

  return (
    <section className="customersPageRoot">
      <div className="card formCard customersPageHeaderCard">
        <div className="heroTitle" style={{ marginBottom: 0 }}>{t("depositModule")}</div>
      </div>
      <div className="card listCard customersListCard">
        <div className="listHeader">
          <div className="heroTitle">{t("currentBalances")}</div>
          <div className="listHeaderActions">
            <button className="primaryBtn" type="button" onClick={() => setDepositModalOpen(true)}>
              + {t("addDeposit")}
            </button>
          </div>
        </div>
        <p className="depositBalancesHint">{t("depositBalancesHint")}</p>
        <div className="depositBalanceCustomerBox">
          <label className="depositBalanceCustomerLabel" htmlFor="deposit-balance-customer">
            {t("selectCustomer")}
          </label>
          <select
            id="deposit-balance-customer"
            className="sarafiSelect"
            value={depositForm.customerId}
            onChange={(e) => {
              const customerId = e.target.value;
              setDepositForm((p) => ({ ...p, customerId }));
              void loadAccounts(customerId);
            }}
          >
            <option value="">—</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.fullName}
              </option>
            ))}
          </select>
        </div>
        {depositMessage ? <div className="emptyText" style={{ marginBottom: "8px" }}>{depositMessage}</div> : null}
        {!depositForm.customerId ? (
          <div className="emptyText">{t("chooseCustomerFirst")}</div>
        ) : accounts.length === 0 ? (
          <div className="emptyText">{t("noBalances")}</div>
        ) : (
          <div className="customerTableWrap">
            <table className="customerTable">
              <thead>
                <tr>
                  <th>{t("currency")}</th>
                  <th>{t("balance")}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="customerName">{account.currencyCode}</td>
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
          <div>
            <div className="heroTitle">{t("depositsHistory")}</div>
            <div className="reportFilterSubtitle">{t("depositsHistoryFilterHint")}</div>
          </div>
          <div className="listHeaderActions">
            <button className="navItem" type="button" onClick={() => void loadDeposits()}>
              {t("refresh")}
            </button>
          </div>
        </div>
        <div className="depositsHistoryFilters">
          <label>
            <span className="depositsFilterLabel">{t("filterByCustomer")}</span>
            <select
              className="sarafiSelect"
              value={depositHistoryFilters.customerId}
              onChange={(e) =>
                setDepositHistoryFilters((p) => ({ ...p, customerId: e.target.value }))
              }
              aria-label={t("filterByCustomer")}
            >
              <option value="">{t("allCustomers")}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="depositsFilterLabel">{t("filterByCurrency")}</span>
            <select
              className="sarafiSelect"
              value={depositHistoryFilters.currencyCode}
              onChange={(e) =>
                setDepositHistoryFilters((p) => ({ ...p, currencyCode: e.target.value }))
              }
              aria-label={t("filterByCurrency")}
            >
              <option value="">{t("all")}</option>
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} — {currency.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="navItem"
            onClick={() => setDepositHistoryFilters({ customerId: "", currencyCode: "" })}
          >
            {t("clearFilters")}
          </button>
        </div>
        {deposits.length === 0 ? (
          <div className="emptyText">{t("noDeposits")}</div>
        ) : (
          <div className="customerTableWrap">
            <table className="customerTable">
              <thead>
                <tr>
                  <th>{t("customers")}</th>
                  <th>{t("currency")}</th>
                  <th>{t("amount")}</th>
                  <th>{t("createdAt")}</th>
                  <th>{t("quickActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedDeposits.map((item) => (
                  <tr key={item.id}>
                    <td className="customerName">{item.customer?.fullName || "-"}</td>
                    <td>{item.currencyCode}</td>
                    <td>{Number(item.amount).toLocaleString("fa-AF")}</td>
                    <td>{new Date(item.createdAt).toLocaleDateString("fa-AF")}</td>
                    <td>
                      <div className="customerActions">
                        <button className="navItem" type="button" onClick={() => openEditModal(item)}>
                          {t("edit")}
                        </button>
                        <button className="navItem slipDeleteBtn" type="button" onClick={() => void deleteDepositRow(item)}>
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
          page={historyPage}
          totalItems={deposits.length}
          pageSize={pageSize}
          onPageChange={setHistoryPage}
          t={t}
        />
      </div>
      <FormModal isOpen={isDepositModalOpen} onClose={() => setDepositModalOpen(false)} title={t("addDeposit")}>
        <form className="customerForm" onSubmit={submitFromModal}>
          <label>
            {t("selectCustomer")}
            <select
              className="sarafiSelect"
              value={depositForm.customerId}
              onChange={(e) => {
                const customerId = e.target.value;
                setDepositForm((p) => ({ ...p, customerId }));
                void loadAccounts(customerId);
              }}
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
              value={depositForm.currencyCode}
              onChange={(e) => setDepositForm((p) => ({ ...p, currencyCode: e.target.value }))}
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
              value={depositForm.amount}
              onChange={(e) => setDepositForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </label>
          <label>
            {t("notes")}
            <textarea
              rows={2}
              value={depositForm.note}
              onChange={(e) => setDepositForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <label>
            <span>{t("depositWithConversion")}</span>
            <input
              type="checkbox"
              checked={depositForm.convertToOtherCurrency}
              onChange={(e) => setDepositForm((p) => ({ ...p, convertToOtherCurrency: e.target.checked }))}
            />
          </label>
          {depositForm.convertToOtherCurrency ? (
            <>
              <label>
                {t("toCurrency")}
                <select
                  className="sarafiSelect"
                  value={depositForm.targetCurrencyCode}
                  onChange={(e) => setDepositForm((p) => ({ ...p, targetCurrencyCode: e.target.value }))}
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
                {t("rate")}
                <input
                  type="text"
                  inputMode="decimal"
                  value={depositForm.rate}
                  onChange={(e) => setDepositForm((p) => ({ ...p, rate: e.target.value }))}
                  required
                />
              </label>
              <label>
                {t("feeAmount")}
                <input
                  type="text"
                  inputMode="decimal"
                  value={depositForm.feeAmount}
                  onChange={(e) => setDepositForm((p) => ({ ...p, feeAmount: e.target.value }))}
                />
              </label>
            </>
          ) : null}
          <div className="modalActions">
            <button className="primaryBtn" type="submit" disabled={depositSaving}>
              {depositSaving ? `${t("save")}...` : t("save")}
            </button>
            <button className="navItem" type="button" onClick={() => setDepositModalOpen(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </FormModal>
      <FormModal isOpen={Boolean(editingDepositId)} onClose={() => setEditingDepositId(null)} title={t("editDeposit")}>
        <form className="customerForm" onSubmit={submitEditModal}>
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
            {t("notes")}
            <textarea
              rows={2}
              value={editForm.note}
              onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <div className="modalActions">
            <button className="primaryBtn" type="submit" disabled={depositSaving}>
              {depositSaving ? `${t("save")}...` : t("save")}
            </button>
            <button className="navItem" type="button" onClick={() => setEditingDepositId(null)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </FormModal>
    </section>
  );
}
