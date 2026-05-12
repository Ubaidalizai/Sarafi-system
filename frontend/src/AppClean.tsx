import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { PartnerDetailPage } from "./pages/PartnerDetailPage";
import { DepositsPage } from "./pages/DepositsPage";
import { SlipsPage } from "./pages/SlipsPage";
import { PartnersPage } from "./pages/PartnersPage";
import { ReportsPage } from "./pages/ReportsPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import "./style.css";

type PageKey = "dashboard" | "customers" | "deposits" | "slips" | "partners" | "reports" | "profile";

export default function AppClean() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState(() => localStorage.getItem("auth_token") || "");
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: string } | null>(() => {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [authSaving, setAuthSaving] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const pageMap: Record<string, PageKey> = {
    "/dashboard": "dashboard",
    "/customers": "customers",
    "/deposits": "deposits",
    "/slips": "slips",
    "/partners": "partners",
    "/reports": "reports",
    "/profile": "profile",
  };
  const activePage: PageKey = (() => {
    const p = location.pathname;
    if (p.startsWith("/customers")) return "customers";
    if (p.startsWith("/deposits")) return "deposits";
    if (p.startsWith("/slips")) return "slips";
    if (p.startsWith("/partners")) return "partners";
    if (p.startsWith("/reports")) return "reports";
    if (p.startsWith("/profile")) return "profile";
    if (p.startsWith("/dashboard")) return "dashboard";
    return pageMap[p] ?? "dashboard";
  })();

  const [dashboard, setDashboard] = useState({ currencyCode: "AFN", incoming: 0, outgoing: 0, balance: 0, todayNet: 0, pendingSettlements: 0 });
  const [customers, setCustomers] = useState<
    Array<{
      id: string;
      fullName: string;
      phone?: string | null;
      idNumber?: string | null;
      notes?: string | null;
      createdAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currencies, setCurrencies] = useState<Array<{ code: string; name: string }>>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; currencyCode: string; balance: string }>>([]);
  const [depositForm, setDepositForm] = useState(() => ({
    customerId: localStorage.getItem("last_deposit_customer_id") || "",
    currencyCode: "AFN",
    amount: "",
    note: "",
    convertToOtherCurrency: false,
    targetCurrencyCode: "PKR",
    rate: "",
    feeAmount: "",
  }));
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositMessage, setDepositMessage] = useState("");
  const [deposits, setDeposits] = useState<Array<{ id: string; customerId: string; currencyCode: string; amount: string; note?: string | null; createdAt: string; customer?: { fullName: string } }>>([]);
  const [depositHistoryFilters, setDepositHistoryFilters] = useState({ customerId: "", currencyCode: "" });
  const [slipForm, setSlipForm] = useState({
    customerId: "",
    currencyCode: "AFN",
    amount: "",
    receiverName: "",
    paidToName: "",
    note: "",
    /** always paid now at issue time */
    markPaid: true,
  });
  const [slipSaving, setSlipSaving] = useState(false);
  const [slipMutating, setSlipMutating] = useState(false);
  const [slipMessage, setSlipMessage] = useState("");
  const [slipLookup, setSlipLookup] = useState<{
    slipCode: string;
    customerId: string;
    currencyCode: string;
    amount: string;
    status: "issued" | "paid" | "cancelled" | "expired";
    receiverName?: string | null;
    paidToName?: string | null;
    customer?: { fullName: string; phone?: string | null };
  } | null>(null);
  const [slipsLoading, setSlipsLoading] = useState(false);
  const [slips, setSlips] = useState<
    Array<{
      id: string;
      slipCode: string;
      customerId: string;
      currencyCode: string;
      amount: string;
      status: "issued" | "paid" | "cancelled" | "expired";
      createdAt: string;
      receiverName?: string | null;
      paidToName?: string | null;
      customer?: { fullName: string; phone?: string | null };
    }>
  >([]);
  const [slipFilters, setSlipFilters] = useState({ customerId: "", status: "", currencyCode: "", from: "", to: "" });
  const slipFiltersRef = useRef(slipFilters);
  slipFiltersRef.current = slipFilters;
  const [slipCustomerAccounts, setSlipCustomerAccounts] = useState<Array<{ id: string; currencyCode: string; balance: string }>>([]);
  const [partners, setPartners] = useState<Array<{ id: string; name: string; country?: string | null; city?: string | null; contact?: string | null; notes?: string | null }>>([]);
  const [partnerForm, setPartnerForm] = useState({ name: "", country: "", city: "", contact: "", notes: "" });
  const [partnerSaving, setPartnerSaving] = useState(false);
  const [partnerTxSaving, setPartnerTxSaving] = useState(false);
  const [partnerMessage, setPartnerMessage] = useState("");
  const [partnerTxForm, setPartnerTxForm] = useState({ partnerId: "", currencyCode: "AFN", amount: "", direction: "in" as "in" | "out", beneficiaryName: "", referenceNo: "", note: "", reconciliationStatus: "pending" as "pending" | "confirmed" | "disputed" });
  const [partnerAccounts, setPartnerAccounts] = useState<Array<{ id: string; currencyCode: string; balance: string }>>([]);
  const [partnerTxs, setPartnerTxs] = useState<Array<{ id: string; partnerId: string; currencyCode: string; amount: string; direction: "in" | "out"; beneficiaryName?: string | null; referenceNo?: string | null; note?: string | null; reconciliationStatus: "pending" | "confirmed" | "disputed"; createdAt: string; partner?: { id: string; name: string } }>>([]);
  const [customerBalanceReport, setCustomerBalanceReport] = useState<Array<{ id: string; currencyCode: string; balance: string; customer?: { fullName: string } }>>([]);
  const [partnerBalanceReport, setPartnerBalanceReport] = useState<Array<{ id: string; currencyCode: string; balance: string; partner?: { name: string } }>>([]);
  const [profileForm, setProfileForm] = useState({
    username: currentUser?.username ?? "",
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

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

  const apiFetch = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { ...init, headers: { ...(init?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (response.status === 401 && token) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      setToken("");
      setCurrentUser(null);
    }
    return response;
  }, [token]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("http://localhost:4000/customers");
      const data = await response.json();
      const list = data.customers ?? [];
      setCustomers(list);
      const ids = new Set(list.map((c: { id: string }) => c.id));
      setDepositForm((p) => {
        if (!p.customerId || ids.has(p.customerId)) return p;
        localStorage.removeItem("last_deposit_customer_id");
        return { ...p, customerId: "" };
      });
      setDepositHistoryFilters((p) => {
        if (!p.customerId || ids.has(p.customerId)) return p;
        return { ...p, customerId: "" };
      });
      setSlipForm((p) => {
        if (!p.customerId || ids.has(p.customerId)) return p;
        return { ...p, customerId: "" };
      });
      setSlipFilters((p) => {
        if (!p.customerId || ids.has(p.customerId)) return p;
        return { ...p, customerId: "" };
      });
    } finally {
      setLoading(false);
    }
  };
  const loadPartners = async () => { const r = await apiFetch("http://localhost:4000/partners"); setPartners((await r.json()).partners ?? []); };
  const loadCurrencies = async () => { const r = await apiFetch("http://localhost:4000/currencies"); setCurrencies((await r.json()).currencies ?? []); };
  const loadAccounts = async (customerId: string) => { if (!customerId) return setAccounts([]); const r = await apiFetch(`http://localhost:4000/customers/${customerId}/accounts`); setAccounts((await r.json()).accounts ?? []); };
  const loadDeposits = async () => {
    const q = new URLSearchParams();
    if (depositHistoryFilters.customerId) q.set("customerId", depositHistoryFilters.customerId);
    if (depositHistoryFilters.currencyCode) q.set("currencyCode", depositHistoryFilters.currencyCode);
    const r = await apiFetch(`http://localhost:4000/deposits?${q.toString()}`);
    setDeposits((await r.json()).deposits ?? []);
  };
  const loadPartnerAccounts = async (partnerId: string) => { if (!partnerId) return setPartnerAccounts([]); const r = await apiFetch(`http://localhost:4000/partners/${partnerId}/accounts`); setPartnerAccounts((await r.json()).accounts ?? []); };
  const refreshSelectedCustomerAccounts = async () => {
    if (!depositForm.customerId) return;
    await loadAccounts(depositForm.customerId);
  };
  const loadDashboard = async () => { const r = await apiFetch(`http://localhost:4000/dashboard/summary?currencyCode=${dashboard.currencyCode}`); const d = await r.json(); if (r.ok) setDashboard({ currencyCode: d.currencyCode, incoming: Number(d.incoming || 0), outgoing: Number(d.outgoing || 0), balance: Number(d.balance || 0), todayNet: Number(d.todayNet || 0), pendingSettlements: Number(d.pendingSettlements || 0) }); };
  const loadBalanceReports = async () => { const [a, b] = await Promise.all([apiFetch("http://localhost:4000/reports/customer-balances"), apiFetch("http://localhost:4000/reports/partner-balances")]); setCustomerBalanceReport((await a.json()).accounts ?? []); setPartnerBalanceReport((await b.json()).accounts ?? []); };
  const loadPartnerTxs = async () => { const r = await apiFetch("http://localhost:4000/partner-transactions"); setPartnerTxs((await r.json()).transactions ?? []); };
  const loadSlips = useCallback(async () => {
    setSlipsLoading(true);
    try {
      const f = slipFiltersRef.current;
      const q = new URLSearchParams();
      if (f.customerId) q.set("customerId", f.customerId);
      if (f.status) q.set("status", f.status);
      if (f.currencyCode) q.set("currencyCode", f.currencyCode);
      if (f.from) q.set("from", f.from);
      if (f.to) q.set("to", f.to);
      const r = await apiFetch(`http://localhost:4000/slips?${q.toString()}`);
      const data = (await r.json()) as { slips?: typeof slips };
      if (r.ok) setSlips(data.slips ?? []);
    } finally {
      setSlipsLoading(false);
    }
  }, []);

  const onCreateCustomer = async (payload: { fullName: string; phone: string; idNumber: string; notes: string }) => { if (!payload.fullName.trim()) return false; setSaving(true); try { const r = await apiFetch("http://localhost:4000/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!r.ok) return false; await loadCustomers(); return true; } finally { setSaving(false); } };
  const onUpdateCustomer = async (customerId: string, payload: { fullName: string; phone: string; idNumber: string; notes: string }) => { const r = await apiFetch(`http://localhost:4000/customers/${customerId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!r.ok) return false; await loadCustomers(); return true; };
  const onDeleteCustomer = async (customerId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    const r = await apiFetch(`http://localhost:4000/customers/${customerId}`, { method: "DELETE" });
    let error = "UNKNOWN";
    try {
      const d = (await r.json()) as { error?: string };
      if (d?.error) error = d.error;
    } catch {
      /* ignore */
    }
    if (!r.ok) return { ok: false, error };
    await loadCustomers();
    return { ok: true };
  };
  const onDepositSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseLocalizedAmount(depositForm.amount);
    if (!depositForm.customerId || !amount || amount <= 0) return;

    setDepositSaving(true);
    try {
      if (depositForm.convertToOtherCurrency) {
        const rate = parseLocalizedAmount(depositForm.rate);
        const feeAmount = depositForm.feeAmount.trim() ? parseLocalizedAmount(depositForm.feeAmount) : 0;
        if (!rate || rate <= 0 || Number.isNaN(feeAmount) || feeAmount < 0) {
          setDepositMessage(t("exchangeInvalidInput"));
          return;
        }
        const r = await apiFetch("http://localhost:4000/api/v1/exchanges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: depositForm.customerId,
            fromCurrency: depositForm.currencyCode,
            toCurrency: depositForm.targetCurrencyCode,
            sourceAmount: amount,
            rate,
            feeAmount,
            notes: depositForm.note || undefined,
            settlementMode: "cash_in",
          }),
        });
        const d = (await r.json()) as { error?: string | Record<string, unknown> };
        if (!r.ok) {
          const code = typeof d.error === "string" ? d.error : "";
          const msg =
            code === "SAME_CURRENCY_NOT_ALLOWED"
              ? t("exchangeSameCurrency")
              : code === "CURRENCY_PRECISION_MISMATCH"
                ? t("exchangePrecisionError")
                : code === "INSUFFICIENT_SOURCE_BALANCE"
                  ? t("exchangeInsufficientSourceBalance")
                  : code === "INVALID_NET_AMOUNT"
                    ? t("exchangeInvalidNetAmount")
                    : code === "CUSTOMER_NOT_FOUND"
                      ? t("exchangeCustomerNotFound")
                      : code === "INVALID_CURRENCY"
                        ? t("exchangeInvalidCurrency")
                        : code === "DUPLICATE_CLIENT_REFERENCE"
                          ? t("exchangeDuplicateReference")
                          : code === "EXCHANGE_POST_FAILED"
                            ? t("exchangeServerError")
                            : code === "SESSION_STALE_RELOGIN"
                              ? t("exchangeSessionStale")
                              : d.error && typeof d.error !== "string"
                              ? t("exchangeValidationFailed")
                              : t("exchangeSaveFailed");
          setDepositMessage(msg);
          return;
        }
      } else {
        const r = await apiFetch("http://localhost:4000/deposits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: depositForm.customerId,
            currencyCode: depositForm.currencyCode,
            amount,
            note: depositForm.note,
          }),
        });
        if (!r.ok) return;
      }

      setDepositForm((p) => ({
        ...p,
        amount: "",
        note: "",
        rate: "",
        feeAmount: "",
      }));
      setDepositMessage(t("savedSuccessfully"));
      await Promise.all([loadAccounts(depositForm.customerId), loadDeposits(), loadDashboard(), loadBalanceReports()]);
    } finally {
      setDepositSaving(false);
    }
  };
  const onUpdateDeposit = async (
    depositId: string,
    payload: { customerId: string; currencyCode: string; amount: number; note: string }
  ): Promise<boolean> => {
    if (!payload.customerId || !payload.amount || payload.amount <= 0) return false;
    setDepositSaving(true);
    setDepositMessage("");
    try {
      const r = await apiFetch(`http://localhost:4000/deposits/${depositId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setDepositMessage(
          d.error === "DEPOSIT_NOT_FOUND"
            ? t("notFound")
            : d.error === "INSUFFICIENT_BALANCE_ADJUSTMENT"
              ? t("depositAdjustBlocked")
              : t("depositUpdateFailed")
        );
        return false;
      }
      setDepositMessage(t("savedSuccessfully"));
      await Promise.all([loadAccounts(payload.customerId), loadDeposits(), loadDashboard(), loadBalanceReports()]);
      return true;
    } finally {
      setDepositSaving(false);
    }
  };
  const onDeleteDeposit = async (depositId: string, customerId: string): Promise<boolean> => {
    setDepositSaving(true);
    setDepositMessage("");
    try {
      const r = await apiFetch(`http://localhost:4000/deposits/${depositId}`, { method: "DELETE" });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setDepositMessage(
          d.error === "DEPOSIT_NOT_FOUND"
            ? t("notFound")
            : d.error === "INSUFFICIENT_BALANCE_ADJUSTMENT"
              ? t("depositAdjustBlocked")
              : t("depositDeleteFailed")
        );
        return false;
      }
      setDepositMessage(t("savedSuccessfully"));
      await Promise.all([loadAccounts(customerId), loadDeposits(), loadDashboard(), loadBalanceReports()]);
      return true;
    } finally {
      setDepositSaving(false);
    }
  };
  const onIssueSlip = async (e: FormEvent): Promise<boolean> => {
    e.preventDefault();
    const amount = parseLocalizedAmount(slipForm.amount);
    if (!slipForm.customerId || !amount || amount <= 0 || !slipForm.receiverName.trim() || !slipForm.paidToName.trim()) {
      return false;
    }
    setSlipSaving(true);
    setSlipMessage("");
    try {
      const r = await apiFetch("http://localhost:4000/slips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: slipForm.customerId,
          currencyCode: slipForm.currencyCode,
          amount,
          receiverName: slipForm.receiverName,
          paidToName: slipForm.paidToName.trim(),
          note: slipForm.note.trim() || undefined,
          markPaid: true,
        }),
      });
      const d = (await r.json()) as { slip?: NonNullable<typeof slipLookup>; error?: string };
      if (!r.ok) {
        setSlipMessage(
          d.error === "INSUFFICIENT_BALANCE"
            ? t("insufficientBalanceSlipCurrency")
            : d.error === "NO_ACCOUNT_FOR_SLIP_CURRENCY"
              ? t("noAccountSlipCurrency")
              : d.error || t("slipCreateFailed")
        );
        return false;
      }
      setSlipForm((p) => ({
        ...p,
        amount: "",
        receiverName: "",
        paidToName: "",
        note: "",
        markPaid: true,
      }));
      if (d.slip) setSlipLookup(d.slip);
      setSlipMessage(`${t("savedSuccessfully")} — ${d.slip?.slipCode ?? ""}`);
      await Promise.all([
        loadSlips(),
        loadDashboard(),
        loadBalanceReports(),
        refreshSelectedCustomerAccounts(),
        (async () => {
          if (!slipForm.customerId) return;
          const r = await apiFetch(`http://localhost:4000/customers/${slipForm.customerId}/accounts`);
          const data = (await r.json()) as { accounts?: typeof slipCustomerAccounts };
          if (r.ok) setSlipCustomerAccounts(data.accounts ?? []);
        })(),
      ]);
      return true;
    } finally {
      setSlipSaving(false);
    }
  };
  const setSlipStatus = async (slipCode: string, status: "cancelled" | "expired") => { const r = await apiFetch(`http://localhost:4000/slips/${encodeURIComponent(slipCode)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); const d = await r.json(); if (!r.ok) return setSlipMessage(d.error || "Error"); if (slipLookup?.slipCode === slipCode) setSlipLookup(d.slip); await loadSlips(); };
  const onUpdateSlip = async (
    slipCode: string,
    payload: {
      customerId: string;
      currencyCode: string;
      amount: number;
      receiverName: string;
      paidToName: string;
      note: string;
    }
  ): Promise<boolean> => {
    setSlipMutating(true);
    setSlipMessage("");
    try {
      const r = await apiFetch(`http://localhost:4000/slips/${encodeURIComponent(slipCode)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          receiverName: payload.receiverName.trim(),
          paidToName: payload.paidToName.trim(),
          note: payload.note || undefined,
        }),
      });
      const d = (await r.json()) as { slip?: NonNullable<typeof slipLookup>; error?: string };
      if (!r.ok) {
        setSlipMessage(
          d.error === "SLIP_NOT_EDITABLE"
            ? t("slipNotEditable")
            : d.error === "CUSTOMER_NOT_FOUND" || d.error === "CURRENCY_NOT_FOUND"
              ? t("notFound")
              : d.error || t("slipUpdateFailed")
        );
        return false;
      }
      setSlipMessage(t("savedSuccessfully"));
      if (d.slip && slipLookup?.slipCode === slipCode) setSlipLookup(d.slip);
      await Promise.all([loadSlips(), loadDashboard(), loadBalanceReports(), refreshSelectedCustomerAccounts()]);
      return true;
    } finally {
      setSlipMutating(false);
    }
  };
  const onDeleteSlip = async (slipCode: string): Promise<boolean> => {
    setSlipMutating(true);
    setSlipMessage("");
    try {
      const r = await apiFetch(`http://localhost:4000/slips/${encodeURIComponent(slipCode)}`, { method: "DELETE" });
      let d: { error?: string } = {};
      try {
        d = (await r.json()) as { error?: string };
      } catch {
        d = {};
      }
      if (!r.ok) {
        setSlipMessage(
          d.error === "SLIP_NOT_FOUND"
            ? t("notFound")
            : d.error === "FORBIDDEN"
              ? t("deleteForbidden")
              : t("slipDeleteFailed")
        );
        return false;
      }
      setSlipMessage(t("savedSuccessfully"));
      if (slipLookup?.slipCode === slipCode) setSlipLookup(null);
      await Promise.all([loadSlips(), loadDashboard(), loadBalanceReports()]);
      return true;
    } finally {
      setSlipMutating(false);
    }
  };
  const onCreatePartner = async (e: FormEvent): Promise<boolean> => {
    e.preventDefault();
    if (!partnerForm.name.trim()) return false;
    setPartnerSaving(true);
    setPartnerMessage("");
    try {
      const r = await apiFetch("http://localhost:4000/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partnerForm),
      });
      if (!r.ok) {
        setPartnerMessage(t("partnerSaveFailed"));
        return false;
      }
      setPartnerForm({ name: "", country: "", city: "", contact: "", notes: "" });
      await loadPartners();
      return true;
    } finally {
      setPartnerSaving(false);
    }
  };
  const onUpdatePartner = async (
    partnerId: string,
    payload: { name: string; country: string; city: string; contact: string; notes: string }
  ): Promise<boolean> => {
    if (!payload.name.trim()) return false;
    setPartnerSaving(true);
    setPartnerMessage("");
    try {
      const r = await apiFetch(`http://localhost:4000/partners/${partnerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        setPartnerMessage(t("partnerSaveFailed"));
        return false;
      }
      await loadPartners();
      return true;
    } finally {
      setPartnerSaving(false);
    }
  };
  const onDeletePartner = async (partnerId: string): Promise<boolean> => {
    setPartnerSaving(true);
    setPartnerMessage("");
    try {
      const r = await apiFetch(`http://localhost:4000/partners/${partnerId}`, { method: "DELETE" });
      let d: { error?: string } = {};
      try {
        d = (await r.json()) as { error?: string };
      } catch {
        d = {};
      }
      if (!r.ok) {
        setPartnerMessage(
          d.error === "PARTNER_HAS_TRANSACTIONS"
            ? t("partnerDeleteBlocked")
            : d.error === "PARTNER_NOT_FOUND"
              ? t("notFound")
              : t("partnerDeleteFailed")
        );
        return false;
      }
      await loadPartners();
      return true;
    } finally {
      setPartnerSaving(false);
    }
  };
  const onCreatePartnerTx = async (e: FormEvent): Promise<boolean> => {
    e.preventDefault();
    const amount = parseLocalizedAmount(partnerTxForm.amount);
    if (!partnerTxForm.partnerId || !amount || amount <= 0) return false;
    setPartnerTxSaving(true);
    setPartnerMessage("");
    try {
      const r = await apiFetch("http://localhost:4000/partner-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...partnerTxForm, amount }),
      });
      let d: { error?: unknown; details?: unknown } = {};
      try {
        d = (await r.json()) as { error?: unknown; details?: unknown };
      } catch {
        d = {};
      }
      const err = typeof d.error === "string" ? d.error : "";
      const details = typeof d.details === "string" ? d.details : "";
      if (!r.ok) {
        setPartnerMessage(
          err === "INSUFFICIENT_PARTNER_BALANCE"
            ? t("insufficientPartnerBalance")
            : err === "PARTNER_NOT_FOUND" || err === "CURRENCY_NOT_FOUND"
              ? t("notFound")
              : err === "INVALID_PARTNER_TX_PAYLOAD"
                ? t("partnerTxInvalidPayload")
                : details
                  ? `${t("partnerTxFailed")} (${details})`
                : t("partnerTxFailed")
        );
        return false;
      }
      setPartnerTxForm((p) => ({ ...p, amount: "", beneficiaryName: "", referenceNo: "", note: "" }));
      setPartnerMessage(t("savedSuccessfully"));
      await Promise.all([loadPartnerAccounts(partnerTxForm.partnerId), loadPartnerTxs(), loadDashboard(), loadBalanceReports()]);
      return true;
    } finally {
      setPartnerTxSaving(false);
    }
  };
  const onUpdatePartnerTx = async (
    txId: string,
    payload: {
      partnerId: string;
      currencyCode: string;
      amount: number;
      direction: "in" | "out";
      beneficiaryName: string;
      referenceNo: string;
      note: string;
      reconciliationStatus: "pending" | "confirmed" | "disputed";
    }
  ): Promise<boolean> => {
    if (!payload.partnerId || !payload.amount || payload.amount <= 0) return false;
    setPartnerTxSaving(true);
    setPartnerMessage("");
    try {
      const r = await apiFetch(`http://localhost:4000/partner-transactions/${txId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let d: { error?: unknown; details?: unknown } = {};
      try {
        d = (await r.json()) as { error?: unknown; details?: unknown };
      } catch {
        d = {};
      }
      const err = typeof d.error === "string" ? d.error : "";
      const details = typeof d.details === "string" ? d.details : "";
      if (!r.ok) {
        setPartnerMessage(
          err === "INSUFFICIENT_PARTNER_BALANCE"
            ? t("insufficientPartnerBalance")
            : err === "PARTNER_TX_NOT_FOUND" || err === "PARTNER_NOT_FOUND" || err === "CURRENCY_NOT_FOUND"
              ? t("notFound")
              : err === "INVALID_PARTNER_TX_PAYLOAD"
                ? t("partnerTxInvalidPayload")
                : details
                  ? `${t("partnerTxUpdateFailed")} (${details})`
              : t("partnerTxUpdateFailed")
        );
        return false;
      }
      setPartnerMessage(t("savedSuccessfully"));
      await Promise.all([loadPartnerTxs(), loadDashboard(), loadBalanceReports(), payload.partnerId ? loadPartnerAccounts(payload.partnerId) : Promise.resolve()]);
      return true;
    } finally {
      setPartnerTxSaving(false);
    }
  };
  const onDeletePartnerTx = async (txId: string, partnerId?: string): Promise<boolean> => {
    setPartnerTxSaving(true);
    setPartnerMessage("");
    try {
      const r = await apiFetch(`http://localhost:4000/partner-transactions/${txId}`, { method: "DELETE" });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setPartnerMessage(
          d.error === "PARTNER_TX_NOT_FOUND" ? t("notFound") : t("partnerTxDeleteFailed")
        );
        return false;
      }
      setPartnerMessage(t("savedSuccessfully"));
      await Promise.all([loadPartnerTxs(), loadDashboard(), loadBalanceReports(), partnerId ? loadPartnerAccounts(partnerId) : Promise.resolve()]);
      return true;
    } finally {
      setPartnerTxSaving(false);
    }
  };
  const onLogin = async (e: FormEvent) => { e.preventDefault(); setAuthError(""); setAuthSaving(true); try { const r = await fetch("http://localhost:4000/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(authForm) }); const d = await r.json(); if (!r.ok) return setAuthError(t("loginFailed")); localStorage.setItem("auth_token", d.token); localStorage.setItem("auth_user", JSON.stringify(d.user)); setToken(d.token); setCurrentUser(d.user); setAuthForm({ username: "", password: "" }); navigate("/dashboard", { replace: true }); } finally { setAuthSaving(false); } };
  const onLogout = () => { localStorage.removeItem("auth_token"); localStorage.removeItem("auth_user"); setToken(""); setCurrentUser(null); };
  const onUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMessage("");
    setProfileError("");
    const nextUsername = profileForm.username.trim();
    const wantsPasswordChange = profileForm.newPassword.trim().length > 0;
    if (!nextUsername) {
      setProfileError(t("profileNameRequired"));
      return;
    }
    if (wantsPasswordChange && profileForm.newPassword !== profileForm.confirmNewPassword) {
      setProfileError(t("passwordMismatch"));
      return;
    }
    setProfileSaving(true);
    try {
      const payload: { username: string; currentPassword?: string; newPassword?: string } = { username: nextUsername };
      if (wantsPasswordChange) {
        payload.currentPassword = profileForm.currentPassword;
        payload.newPassword = profileForm.newPassword;
      }
      const r = await apiFetch("http://localhost:4000/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await r.json()) as { user?: { id: string; username: string; role: string }; error?: string };
      if (!r.ok) {
        setProfileError(
          d.error === "USERNAME_EXISTS"
            ? t("usernameExists")
            : d.error === "INVALID_CURRENT_PASSWORD"
              ? t("invalidCurrentPassword")
              : d.error === "CURRENT_PASSWORD_REQUIRED"
                ? t("currentPasswordRequired")
                : t("profileUpdateFailed")
        );
        return;
      }
      if (d.user) {
        localStorage.setItem("auth_user", JSON.stringify(d.user));
        setCurrentUser(d.user);
        setProfileForm((p) => ({ ...p, username: d.user?.username ?? p.username }));
      }
      setProfileForm((p) => ({ ...p, currentPassword: "", newPassword: "", confirmNewPassword: "" }));
      setProfileMessage(t("savedSuccessfully"));
    } finally {
      setProfileSaving(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    Promise.all([loadCustomers(), loadPartners(), loadCurrencies(), loadBalanceReports(), loadPartnerTxs()]);
  }, [token]);
  useEffect(() => {
    if (!token) return;
    void loadSlips();
  }, [token, slipFilters, loadSlips]);
  useEffect(() => {
    if (!token || location.pathname !== "/slips") return;
    void loadSlips();
  }, [token, location.pathname, loadSlips]);
  useEffect(() => {
    if (!token) return;
    const q = new URLSearchParams();
    if (depositHistoryFilters.customerId) q.set("customerId", depositHistoryFilters.customerId);
    if (depositHistoryFilters.currencyCode) q.set("currencyCode", depositHistoryFilters.currencyCode);
    void (async () => {
      const r = await apiFetch(`http://localhost:4000/deposits?${q.toString()}`);
      setDeposits((await r.json()).deposits ?? []);
    })();
  }, [token, depositHistoryFilters.customerId, depositHistoryFilters.currencyCode]);
  useEffect(() => { if (!token) return; void loadDashboard(); }, [token, dashboard.currencyCode]);
  useEffect(() => {
    if (!token || location.pathname !== "/dashboard") return;
    void loadDashboard();
    const timerId = window.setInterval(() => {
      void loadDashboard();
    }, 10000);
    return () => window.clearInterval(timerId);
  }, [token, location.pathname, dashboard.currencyCode]);
  useEffect(() => {
    if (!token) return;
    const p = location.pathname;
    if (p === "/") return;
    if (p in pageMap) return;
    /** Customer detail: `/customers/:id` is not a static key in pageMap */
    if (p.startsWith("/customers/") && p.length > "/customers/".length) return;
    /** Partner detail: `/partners/:id` */
    if (p.startsWith("/partners/") && p.length > "/partners/".length) return;
    navigate("/dashboard", { replace: true });
  }, [token, location.pathname, navigate]);
  useEffect(() => {
    if (!token) return;
    const customerId = slipForm.customerId;
    if (!customerId) {
      setSlipCustomerAccounts([]);
      return;
    }
    void (async () => {
      const r = await apiFetch(`http://localhost:4000/customers/${customerId}/accounts`);
      const data = (await r.json()) as { accounts?: typeof slipCustomerAccounts };
      if (r.ok) setSlipCustomerAccounts(data.accounts ?? []);
    })();
  }, [token, slipForm.customerId]);

  useEffect(() => {
    if (!token) return;
    const customerId = depositForm.customerId;
    if (!customerId) {
      localStorage.removeItem("last_deposit_customer_id");
      setAccounts([]);
      return;
    }
    localStorage.setItem("last_deposit_customer_id", customerId);
    void loadAccounts(customerId);
  }, [token, depositForm.customerId]);

  useEffect(() => {
    if (!token || location.pathname !== "/deposits" || !depositForm.customerId) return;
    void loadAccounts(depositForm.customerId);
    const timerId = window.setInterval(() => {
      void loadAccounts(depositForm.customerId);
    }, 10000);
    return () => window.clearInterval(timerId);
  }, [token, location.pathname, depositForm.customerId]);

  useEffect(() => {
    if (!token || location.pathname !== "/partners") return;
    const refreshPartnersPageData = async () => {
      await Promise.all([
        loadPartners(),
        loadPartnerTxs(),
        partnerTxForm.partnerId ? loadPartnerAccounts(partnerTxForm.partnerId) : Promise.resolve(),
      ]);
    };
    void refreshPartnersPageData();
    const timerId = window.setInterval(() => {
      void refreshPartnersPageData();
    }, 10000);
    return () => window.clearInterval(timerId);
  }, [token, location.pathname, partnerTxForm.partnerId]);
  useEffect(() => {
    setProfileForm((p) => ({ ...p, username: currentUser?.username ?? "" }));
  }, [currentUser?.username]);

  if (!token) return <LoginPage t={t} authForm={authForm} setAuthForm={setAuthForm} authSaving={authSaving} authError={authError} onLogin={onLogin} />;

  return (
    <div className="appShell">
      <div className="appLayout">
        <aside className="sidebar">
          <div className="sideTop">
            <div className="brand sideBrand">
              <div className="brandMark" aria-hidden="true" />
              <div className="brandText">
                <div className="brandName">{t("appName")}</div>
                <div className="brandSub">{currentUser?.username}</div>
              </div>
            </div>
            <div className="sideDivider" />
          </div>
          <nav className="sideNav">
            <button className={`sideItem ${activePage === "dashboard" ? "active" : ""}`} onClick={() => navigate("/dashboard")}>{t("dashboard")}</button>
            <button className={`sideItem ${activePage === "customers" ? "active" : ""}`} onClick={() => navigate("/customers")}>{t("customers")}</button>
            <button className={`sideItem ${activePage === "deposits" ? "active" : ""}`} onClick={() => navigate("/deposits")}>{t("depositModule")}</button>
            <button className={`sideItem ${activePage === "slips" ? "active" : ""}`} onClick={() => navigate("/slips")}>{t("slips")}</button>
            <button className={`sideItem ${activePage === "partners" ? "active" : ""}`} onClick={() => navigate("/partners")}>{t("partners")}</button>
            <button className={`sideItem ${activePage === "reports" ? "active" : ""}`} onClick={() => navigate("/reports")}>{t("reports")}</button>
            {currentUser?.role === "admin" ? (
              <button className={`sideItem ${activePage === "profile" ? "active" : ""}`} onClick={() => navigate("/profile")}>
                {t("adminProfile")}
              </button>
            ) : null}
          </nav>
          <div className="sideFooter">
            <button className="sideItem logoutItem" onClick={onLogout}>{t("logout")}</button>
          </div>
        </aside>
        <div className="mainArea">
          <main className="content">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={
                  <DashboardPage
                    t={t}
                    navigate={navigate}
                    currentUser={currentUser}
                    dashboard={dashboard}
                    currencies={currencies}
                    onDashboardCurrencyChange={(code) => setDashboard((d) => ({ ...d, currencyCode: code }))}
                  />
                }
              />
              <Route
                path="/customers/:customerId"
                element={<CustomerDetailPage t={t} apiFetch={apiFetch} currencies={currencies} />}
              />
              <Route path="/customers" element={<CustomersPage t={t} saving={saving} loading={loading} customers={customers} loadCustomers={loadCustomers} onCreateCustomer={onCreateCustomer} onUpdateCustomer={onUpdateCustomer} onDeleteCustomer={onDeleteCustomer} />} />
              <Route
                path="/deposits"
                element={
                  <DepositsPage
                    t={t}
                    customers={customers}
                    currencies={currencies}
                    accounts={accounts}
                    deposits={deposits}
                    depositForm={depositForm}
                    setDepositForm={setDepositForm}
                    depositSaving={depositSaving}
                    depositMessage={depositMessage}
                    onDepositSubmit={onDepositSubmit}
                    loadAccounts={loadAccounts}
                    depositHistoryFilters={depositHistoryFilters}
                    setDepositHistoryFilters={setDepositHistoryFilters}
                    loadDeposits={loadDeposits}
                    onUpdateDeposit={onUpdateDeposit}
                    onDeleteDeposit={onDeleteDeposit}
                  />
                }
              />
              <Route
                path="/slips"
                element={
                  <SlipsPage
                    t={t}
                    customers={customers}
                    currencies={currencies}
                    slipCustomerAccounts={slipCustomerAccounts}
                    slipForm={slipForm}
                    setSlipForm={setSlipForm}
                    slipSaving={slipSaving}
                    onIssueSlip={onIssueSlip}
                    slipMessage={slipMessage}
                    clearSlipMessage={() => setSlipMessage("")}
                    slipsLoading={slipsLoading}
                    slips={slips}
                    slipFilters={slipFilters}
                    setSlipFilters={setSlipFilters}
                    loadSlips={loadSlips}
                    setSlipStatus={setSlipStatus}
                    slipMutating={slipMutating}
                    onUpdateSlip={onUpdateSlip}
                    onDeleteSlip={onDeleteSlip}
                  />
                }
              />
              <Route
                path="/partners/:partnerId"
                element={<PartnerDetailPage t={t} apiFetch={apiFetch} currencies={currencies} />}
              />
              <Route path="/partners" element={<PartnersPage t={t} partners={partners} partnerForm={partnerForm} setPartnerForm={setPartnerForm} partnerSaving={partnerSaving} onCreatePartner={onCreatePartner} onUpdatePartner={onUpdatePartner} onDeletePartner={onDeletePartner} currencies={currencies} partnerTxForm={partnerTxForm} setPartnerTxForm={setPartnerTxForm} loadPartnerAccounts={loadPartnerAccounts} onCreatePartnerTx={onCreatePartnerTx} onUpdatePartnerTx={onUpdatePartnerTx} onDeletePartnerTx={onDeletePartnerTx} partnerTxSaving={partnerTxSaving} partnerMessage={partnerMessage} partnerAccounts={partnerAccounts} partnerTxs={partnerTxs} loadPartnerTxs={loadPartnerTxs} />} />
              <Route path="/reports" element={<ReportsPage t={t} loadBalanceReports={loadBalanceReports} loadSlips={loadSlips} slips={slips} customerBalanceReport={customerBalanceReport} partnerBalanceReport={partnerBalanceReport} />} />
              <Route path="/profile" element={currentUser?.role === "admin" ? <ProfilePage t={t} profileForm={profileForm} setProfileForm={setProfileForm} profileSaving={profileSaving} profileMessage={profileMessage} profileError={profileError} onSubmit={onUpdateProfile} /> : <Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}

