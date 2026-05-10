# Development Plan (Frontend + Backend)

## Phase 0: Discovery and Finalization (1-2 days)
- Confirm business terms (slip fields, payout rules, partner settlement rules)
- Confirm currency policy (Toman vs IRR conversion behavior)
- Finalize role permissions
- Freeze MVP requirements

Deliverables:
- Final requirements approval
- Final field list and workflow diagrams

---

## Phase 1: Project Setup (1 day)

### Backend
- Initialize Node.js + Express project
- Configure TypeScript (recommended)
- Setup ESLint/Prettier
- Setup Prisma/Sequelize + DB connection
- Add auth scaffolding (JWT)
- Define localization defaults in server responses (date/number formats) where needed.

### Frontend
- Initialize React app (Vite recommended)
- Setup routing and layout
- Setup API client (Axios)
- Setup auth store and protected routes
- Add i18n setup (Pashto ps-AF default) and RTL direction support for UI components.

Deliverables:
- Running frontend/backend skeleton
- Login page connected to backend
- Pashto language enabled end-to-end (UI text via translation keys).

---

## Phase 2: Core Master Data (2-3 days)
- Users and roles
- Currencies
- Customers
- Partners

Deliverables:
- CRUD APIs + screens for customer and partner management

---

## Phase 3: Customer Account and Ledger (3-4 days)
- Customer account per currency
- Deposit operation
- Currency exchange operation (example: IRR/Reyal to PKR)
- Transaction history and statement
- Ledger entry generation

Deliverables:
- Deposit workflow complete
- Exchange workflow complete with saved rate, fee, and reference
- Balance and statement page working

---

## Phase 4: Slip Workflow (4-5 days)
- Slip creation (issue)
- Slip search and validation
- Payout operation with atomic transaction
- Duplicate prevention and status updates

Deliverables:
- End-to-end slip issue + payout flow
- Balance deduction and logs confirmed

---

## Phase 5: Partner Settlement (3-4 days)
- Partner account transactions
- Settlement instructions
- Reconciliation statuses

Deliverables:
- Partner balance view
- Settlement tracking with references

---

## Phase 6: Reporting and Audit (2-3 days)
- Daily summary report
- Slip status report
- Customer and partner balance reports
- Audit log viewer

Deliverables:
- Exportable reports (CSV/PDF optional for MVP+)

---

## Phase 7: Testing and Hardening (2-3 days)
- Unit tests for business services
- Integration tests for payout API
- Role authorization checks
- Data validation and error handling review

Deliverables:
- Test suite for critical money flows
- Bug fixes and stability improvements

---

## Phase 8: Deployment (1-2 days)
- Prepare production env variables
- Deploy backend + database
- Deploy frontend
- Backup schedule and basic monitoring

Deliverables:
- Live MVP environment
- Admin handover notes

---

## Suggested Folder Structure

### Backend
- `backend/src/modules/auth`
- `backend/src/modules/customers`
- `backend/src/modules/slips`
- `backend/src/modules/partners`
- `backend/src/modules/reports`
- `backend/src/modules/ledger`

### Frontend
- `frontend/src/pages`
- `frontend/src/components`
- `frontend/src/features/auth`
- `frontend/src/features/customers`
- `frontend/src/features/slips`
- `frontend/src/features/partners`
- `frontend/src/features/reports`

---

## Immediate Next Step
Start **Phase 1 setup** and create a minimal API contract for:
- Auth
- Customers
- Deposits
- Slips
- Payout
- Partners
- Settlements

