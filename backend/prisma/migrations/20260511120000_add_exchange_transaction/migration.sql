-- CreateTable
CREATE TABLE "ExchangeTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referenceNo" TEXT NOT NULL,
    "clientReference" TEXT,
    "customerId" TEXT NOT NULL,
    "fromCurrencyCode" TEXT NOT NULL,
    "toCurrencyCode" TEXT NOT NULL,
    "sourceAmount" DECIMAL NOT NULL,
    "rate" DECIMAL NOT NULL,
    "targetAmountGross" DECIMAL NOT NULL,
    "feeAmount" DECIMAL NOT NULL,
    "targetAmountNet" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "ledgerBatchId" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExchangeTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExchangeTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeTransaction_referenceNo_key" ON "ExchangeTransaction"("referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeTransaction_clientReference_key" ON "ExchangeTransaction"("clientReference");
