# Sarafi System Requirements

## 1) Project Goal
Build a small Sarafi (money exchange / transfer) system with:
- **Frontend:** React.js
- **Backend:** Node.js (REST API)
- **Database:** relational DB (recommended PostgreSQL or MySQL)

The system must track two business parts:
1. **Local customer account + slip payout flow**
2. **Foreign partner account + cross-country settlement flow**

---

## 2) Business Part 1: Local Customer Account and Slip

### 2.1 Scenario
- A customer deposits money with us.
- That amount becomes the customer balance in our system.
- The customer sends people to collect money using a **slip** (paper reference with amount and info).
- When a valid person arrives with a valid slip, we pay the amount and deduct it from customer balance.

### 2.2 Example
- Customer deposits `10,000 AFN` -> account balance becomes `10,000 AFN`.
- Customer sends one person with slip amount `1,000 AFN`.
- Cashier pays `1,000 AFN`.
- System deducts from customer account.
- New balance = `9,000 AFN`.

### 2.3 Required Data
- Customer profile (name, phone, ID info, notes)
- Customer account balance per currency
- Deposit transactions
- Slip issuance records
- Slip payout records
- Slip status: `issued`, `paid`, `cancelled`, `expired`

### 2.4 Controls
- Cannot pay slip if balance is insufficient.
- Cannot pay same slip twice.
- Every payout must be linked to cashier user and timestamp.
- Audit trail for each balance change.

---

## 3) Business Part 2: Foreign Partner Account Settlement

### 3.1 Scenario
- We have partner accounts in foreign countries.
- We may send money to partner accounts.
- Local customers give us money here, and partner pays beneficiaries there.
- Also possible in reverse direction depending on settlement process.

### 3.2 Required Data
- Partner profile (country, city, channel, contact)
- Partner ledger account (balance, currency)
- Settlement instructions
- Outbound transfer orders
- Confirmation of paid/received status

### 3.3 Controls
- Track liabilities and receivables by partner and currency.
- Each partner transaction must have unique reference number.
- Reconciliation status: `pending`, `confirmed`, `disputed`.

---

## 4) Currency Requirements
Support these currencies from day one:
- AFN (Afghani)
- USD (Dollar)
- IRR (Rial / Reyal)
- PKR (Pakistani Rupee)
- Toman (custom/local unit; define conversion relation with IRR if needed)

System should allow adding more currencies later.

---

## 5) Core Functional Requirements

### 5.1 Authentication and Users
- Login/logout for staff users.
- Roles: `admin`, `cashier`, `accountant` (initial).

### 5.2 Customer Account Module
- Create customer
- Deposit money
- View current balance by currency
- View account statement

### 5.3 Slip Module
- Create slip (customer, amount, currency, receiver info, optional secret code)
- Validate slip on payout
- Mark as paid and deduct balance
- Print or export slip record

### 5.4 Money Exchange Module
- Record exchange transaction (from-currency, to-currency, rate, source amount, target amount, fee, timestamp)
- Support customer exchange scenarios such as `IRR (Reyal) -> PKR`
- Auto-post ledger entries for both currencies and exchange gain/loss/fee account
- Keep exchange reference number and operator user for audit

### 5.5 Partner Module
- Create foreign partner account
- Record settlement in/out
- Track partner balance by currency
- Reconcile and confirm settlements

### 5.6 Ledger and Reporting
- Double-entry style ledger entries (recommended)
- Daily cash report
- Customer account report
- Partner settlement report
- Filter by date, currency, and status

---

## 6) Non-Functional Requirements
- Data consistency and transactional safety on money operations
- Role-based access control
- Reliable audit logs
- Basic performance for small office usage
- Backup and restore support
- **Language**: UI and printed/exported documents must be in **Pashto (ps-AF)** by default. (Keep the design i18n-ready so additional languages can be added later without rewriting the UI.)

---

## 7) MVP Scope (First Release)
- Staff login
- Customer account deposit and balance tracking
- Slip creation and payout with validation
- Partner account basic settlement tracking
- Multi-currency support (AFN, USD, IRR, PKR, Toman)
- Basic reporting screens

---

## 8) Out of Scope (for MVP)
- Mobile app
- SMS/WhatsApp integration
- Advanced BI dashboard
- Full automation with banking APIs

---

## 9) Exchange API Contract (Draft for MVP)

### 9.1 Create Exchange Transaction
- **Method:** `POST`
- **Path:** `/api/v1/exchanges`
- **Purpose:** Record one currency exchange operation such as `IRR (Reyal) -> PKR` and post ledger/audit records atomically.

### 9.2 Request Body (example: Reyal to PKR)
```json
{
  "customerId": "CUS-1001",
  "fromCurrency": "IRR",
  "toCurrency": "PKR",
  "sourceAmount": 500000,
  "rate": 0.0208,
  "feeAmount": 300,
  "notes": "Customer gave cash in reyal, converted to PKR"
}
```

### 9.3 Calculation Rules
- `targetAmountGross = sourceAmount * rate`
- `targetAmountNet = targetAmountGross - feeAmount`
- Amount precision must follow currency decimal rules.
- `fromCurrency` and `toCurrency` cannot be the same.

### 9.4 Success Response (201 Created)
```json
{
  "exchangeId": "EX-20260507-00045",
  "referenceNo": "EXR-9F7K2Q",
  "customerId": "CUS-1001",
  "fromCurrency": "IRR",
  "toCurrency": "PKR",
  "sourceAmount": 500000,
  "rate": 0.0208,
  "targetAmountGross": 10400,
  "feeAmount": 300,
  "targetAmountNet": 10100,
  "status": "posted",
  "ledgerBatchId": "LB-20260507-8891",
  "createdBy": "USR-12",
  "createdAt": "2026-05-07T13:42:10.000Z"
}
```

### 9.5 Error Responses
- `400 Bad Request`: invalid currency, negative amount, invalid rate, same currency selected.
- `404 Not Found`: customer not found.
- `409 Conflict`: duplicate client reference (if provided).
- `422 Unprocessable Entity`: currency precision mismatch.

### 9.6 Atomic Posting Requirement
The API must run in one DB transaction:
1. Validate request and currency precision
2. Calculate target amounts
3. Create exchange transaction record
4. Create ledger entries (debit/credit + fee account)
5. Write audit log entry
6. Commit or rollback fully on any failure

