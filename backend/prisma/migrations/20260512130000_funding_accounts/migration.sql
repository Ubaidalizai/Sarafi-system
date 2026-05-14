-- CreateTable
CREATE TABLE "FundingAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FundingAccountRepayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundingAccountId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundingAccountRepayment_fundingAccountId_fkey" FOREIGN KEY ("fundingAccountId") REFERENCES "FundingAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FundingAccountRepayment_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FundingAccountRepayment_fundingAccountId_idx" ON "FundingAccountRepayment"("fundingAccountId");

-- AlterTable
ALTER TABLE "Slip" ADD COLUMN "fundingAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Slip_fundingAccountId_idx" ON "Slip"("fundingAccountId");
