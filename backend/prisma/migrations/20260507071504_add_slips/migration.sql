-- CreateTable
CREATE TABLE "Slip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slipCode" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "receiverName" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Slip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Slip_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Slip_slipCode_key" ON "Slip"("slipCode");
