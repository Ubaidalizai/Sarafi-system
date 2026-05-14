-- Slip office/review workflow (separate from issued/paid/cancelled/expired).
ALTER TABLE "Slip" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'waiting';
