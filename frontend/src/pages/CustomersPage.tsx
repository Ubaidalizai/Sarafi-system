import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FormModal } from "../components/FormModal";
import { PaginationControls } from "../components/PaginationControls";
import { RawDetailModal } from "../components/RawDetailModal";
import { formatGregorianDate } from "../lib/formatDate";

type Customer = {
  id: string;
  fullName: string;
  phone?: string | null;
  idNumber?: string | null;
  notes?: string | null;
  createdAt: string;
};

type Props = {
  t: (key: string) => string;
  saving: boolean;
  loading: boolean;
  customers: Customer[];
  loadCustomers: () => Promise<void>;
  onCreateCustomer: (payload: {
    fullName: string;
    phone: string;
    idNumber: string;
    notes: string;
  }) => Promise<boolean>;
  onUpdateCustomer: (
    customerId: string,
    payload: { fullName: string; phone: string; idNumber: string; notes: string }
  ) => Promise<boolean>;
  onDeleteCustomer: (customerId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function CustomersPage(props: Props) {
  const {
    t,
    saving,
    loading,
    customers,
    loadCustomers,
    onCreateCustomer,
    onUpdateCustomer,
    onDeleteCustomer,
  } = props;
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState({ fullName: "", phone: "", idNumber: "", notes: "" });
  const [customersPage, setCustomersPage] = useState(1);
  const [rawDetail, setRawDetail] = useState<{ title: string; record: unknown } | null>(null);
  const pageSize = 10;
  const pagedCustomers = useMemo(
    () => customers.slice((customersPage - 1) * pageSize, customersPage * pageSize),
    [customers, customersPage]
  );

  const openAddModal = () => {
    setEditingCustomerId(null);
    setModalForm({ fullName: "", phone: "", idNumber: "", notes: "" });
    setModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setModalForm({
      fullName: customer.fullName || "",
      phone: customer.phone || "",
      idNumber: customer.idNumber || "",
      notes: customer.notes || "",
    });
    setModalOpen(true);
  };

  const submitModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!modalForm.fullName.trim()) return;
    if (editingCustomerId) {
      const ok = await onUpdateCustomer(editingCustomerId, modalForm);
      if (ok) setModalOpen(false);
      return;
    }
    const ok = await onCreateCustomer(modalForm);
    if (ok) setModalOpen(false);
  };

  const deleteCustomer = async (customerId: string) => {
    const ok = window.confirm(t("deleteCustomerConfirm"));
    if (!ok) return;
    const result = await onDeleteCustomer(customerId);
    if (result.ok) return;
    const key =
      result.error === "FORBIDDEN"
        ? "deleteForbidden"
        : result.error === "CUSTOMER_HAS_TRANSACTIONS"
          ? "deleteCustomerBlocked"
          : result.error === "CUSTOMER_NOT_FOUND"
            ? "deleteCustomerNotFound"
            : "deleteFailed";
    alert(t(key));
  };

  return (
    <section className="customersPageRoot">
      <div className="card formCard customersPageHeaderCard">
        <div className="heroTitle" style={{ marginBottom: 0 }}>
          {t("customersModule")}
        </div>
      </div>

      <div className="customersSection customersPage">
        <div className="card listCard customersListCard">
          <div className="listHeader">
            <div className="heroTitle">{t("customersList")}</div>
            <div className="listHeaderActions">
              <button className="primaryBtn" type="button" onClick={openAddModal}>
                + {t("addCustomer")}
              </button>
              <button className="navItem" onClick={loadCustomers} type="button">
                {t("refresh")}
              </button>
            </div>
          </div>
          <div className="customersListMiniCard">
            <span className="customersListMiniTitle">{t("customersList")}</span>
            <span className="customersListMiniCount">{customers.length.toLocaleString("fa-AF")}</span>
          </div>
          {loading ? (
            <div className="emptyText">{t("loading")}</div>
          ) : customers.length === 0 ? (
            <div className="emptyText">{t("noCustomers")}</div>
          ) : (
            <div className="customerTableWrap">
              <table className="customerTable">
                <thead>
                  <tr>
                    <th>{t("fullName")}</th>
                    <th>{t("phone")}</th>
                    <th>{t("idNumber")}</th>
                    <th>{t("createdAt")}</th>
                    <th>{t("quickActions")}</th>
                  </tr>
                </thead>
                <tbody>
                {pagedCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="customerName">
                        <Link className="customerProfileLink" to={`/customers/${customer.id}`}>
                          {customer.fullName}
                        </Link>
                      </td>
                      <td>{customer.phone || "-"}</td>
                      <td>{customer.idNumber || "-"}</td>
                      <td>{formatGregorianDate(customer.createdAt)}</td>
                      <td>
                        <div className="customerActions">
                          <button className="navItem" type="button" onClick={() => setRawDetail({ title: t("recordDetails"), record: customer })}>
                            {t("view")}
                          </button>
                          <button className="navItem" type="button" onClick={() => openEditModal(customer)}>
                            {t("edit")}
                          </button>
                          <button className="navItem" type="button" onClick={() => deleteCustomer(customer.id)}>
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
          page={customersPage}
          totalItems={customers.length}
          pageSize={pageSize}
          onPageChange={setCustomersPage}
          t={t}
        />
        </div>
        <FormModal
          isOpen={isModalOpen}
          onClose={() => setModalOpen(false)}
          title={editingCustomerId ? t("editCustomer") : t("addCustomer")}
        >
          <form className="customerForm" onSubmit={submitModal}>
            <label>
              {t("fullName")}
              <input
                dir="auto"
                lang="ps"
                autoComplete="name"
                value={modalForm.fullName}
                onChange={(e) => setModalForm((p) => ({ ...p, fullName: e.target.value }))}
                required
              />
            </label>
            <label>
              {t("phone")}
              <input
                value={modalForm.phone}
                onChange={(e) => setModalForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </label>
            <label>
              {t("idNumber")}
              <input
                value={modalForm.idNumber}
                onChange={(e) => setModalForm((p) => ({ ...p, idNumber: e.target.value }))}
              />
            </label>
            <label>
              {t("notes")}
              <textarea
                rows={3}
                value={modalForm.notes}
                onChange={(e) => setModalForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </label>
            <div className="modalActions">
              <button className="primaryBtn" type="submit" disabled={saving}>
                {saving ? `${t("save")}...` : t("save")}
              </button>
              <button className="navItem" type="button" onClick={() => setModalOpen(false)}>
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
      </div>
    </section>
  );
}

