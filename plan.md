# Sarafi System Plan

## 1) Product Direction
Build a secure, simple office system for Sarafi operations:
- Manage customer balances
- Issue and pay slips safely
- Manage foreign partner settlements
- Operate in multiple currencies

---

## 2) Architecture Plan

### Frontend (React.js)
- React + React Router
- UI library: Material UI or Ant Design (choose one)
- **Localization**: Pashto-first UI using i18n (ps-AF default), with RTL support and translation keys (so Dari/English can be added later).
- State: React Query + Context (or Redux Toolkit if needed)
- Pages:
  - Login
  - Dashboard
  - Customers
  - Customer Account Statement
  - Slips
  - Payout Desk
  - Partners
  - Settlements
  - Reports

### Backend (Node.js)
- Node.js + Express.js
- REST APIs with JWT auth
- Validation with Zod/Joi
- Database via Prisma or Sequelize

### Database
- PostgreSQL recommended
- ACID transaction support required for money operations

---

## 3) High-Level Modules
1. **Auth & Roles**
2. **Customer Management**
3. **Account Ledger**
4. **Money Exchange**
5. **Slip Management**
6. **Payout Operations**
7. **Partner Accounts**
8. **Settlement/Reconciliation**
9. **Reports & Audit**

---

## 4) Data Model Plan (Initial)
- `users`
- `roles`
- `customers`
- `currencies`
- `customer_accounts`
- `customer_transactions`
- `slips`
- `slip_payouts`
- `partners`
- `partner_accounts`
- `partner_transactions`
- `ledger_entries`
- `audit_logs`

---

## 5) Critical Business Rules
- No negative balances unless explicitly allowed by admin policy.
- Exchange transactions must save rate, source amount, target amount, and fee.
- Exchange transaction must be atomic (single DB transaction): validate inputs -> calculate amounts -> create exchange record -> write ledger + audit logs.
- Every payout must reference one slip.
- A slip can be paid only once.
- Payout operation must be atomic (single DB transaction):
  1) Validate slip
  2) Check balance
  3) Create payout record
  4) Deduct balance
  5) Write ledger + audit logs
- Every settlement must be traceable by reference ID.

---

## 6) Security Plan
- Password hashing (bcrypt/argon2)
- JWT auth with expiry
- Role-based route protection
- Request validation on all endpoints
- Audit logs for sensitive operations

---

## 7) Reporting Plan (MVP)
- Daily incoming/outgoing cash totals by currency
- Customer balances list
- Slip status report
- Partner balance and settlement report

---

## 8) Delivery Milestones
- **Milestone 1:** Project setup + auth + base schema
- **Milestone 2:** Customer accounts + deposits
- **Milestone 3:** Slip issue + payout flow
- **Milestone 4:** Partner settlements
- **Milestone 5:** Reports + testing + deployment

