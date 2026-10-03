-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('FUTURE', 'ACTIVE', 'EN_CIERRE', 'CLOSED');

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'FUTURE',
    "closedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "points" ADD COLUMN "periodCode" TEXT,
ADD COLUMN "referenceKey" TEXT;

-- Backfill legacy movements into the period in which they were created.
UPDATE "points"
SET "periodCode" = CONCAT(
    EXTRACT(YEAR FROM "createdAt")::int,
    '-',
    CASE WHEN EXTRACT(MONTH FROM "createdAt") <= 6 THEN '1' ELSE '2' END
)
WHERE "periodCode" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_code_key" ON "academic_periods"("code");
CREATE UNIQUE INDEX "points_referenceKey_key" ON "points"("referenceKey");
CREATE INDEX "points_userId_periodCode_idx" ON "points"("userId", "periodCode");
