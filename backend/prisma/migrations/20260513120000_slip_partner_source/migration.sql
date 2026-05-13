-- Slip: optional partner account as cash source (mutually exclusive with funding account in app).
ALTER TABLE "Slip" ADD COLUMN "partnerAccountId" TEXT;
CREATE INDEX "Slip_partnerAccountId_idx" ON "Slip"("partnerAccountId");

-- PartnerTransaction: optional link to slip for auto-generated payout rows.
ALTER TABLE "PartnerTransaction" ADD COLUMN "slipId" TEXT;
CREATE UNIQUE INDEX "PartnerTransaction_slipId_key" ON "PartnerTransaction"("slipId");
