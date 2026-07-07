-- Premium Data Model (P8): Account model + lead field renames
-- 1. Create Account table
-- 2. Add accountId + engagementScore to Lead
-- 3. Rename Lead.priority → crmPriorityScore

-- Create Account table
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "linkedIn" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on (tenantId, name)
CREATE UNIQUE INDEX "Account_tenantId_name_key" ON "Account"("tenantId", "name");

-- Index on tenantId
CREATE INDEX "Account_tenantId_idx" ON "Account"("tenantId");

-- Foreign key to Tenant
ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing leads: create an Account for each unique company per tenant
INSERT INTO "Account" ("id", "name", "createdAt", "updatedAt", "tenantId")
SELECT
    gen_random_uuid()::text,
    subq.company,
    NOW(),
    NOW(),
    subq."tenantId"
FROM (
    SELECT DISTINCT "company", "tenantId"
    FROM "Lead"
    WHERE "company" IS NOT NULL AND "company" != ''
) subq;

-- Add accountId column to Lead (nullable)
ALTER TABLE "Lead" ADD COLUMN "accountId" TEXT;

-- Link leads to their accounts
UPDATE "Lead" l
SET "accountId" = a."id"
FROM "Account" a
WHERE a.name = l.company AND a."tenantId" = l."tenantId";

-- Add foreign key for accountId
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index on accountId
CREATE INDEX "Lead_accountId_idx" ON "Lead"("accountId");

-- Add engagementScore column to Lead
ALTER TABLE "Lead" ADD COLUMN "engagementScore" INTEGER;

-- Create index on engagementScore
CREATE INDEX "Lead_engagementScore_idx" ON "Lead"("engagementScore");

-- Rename priority column to crmPriorityScore
ALTER TABLE "Lead" RENAME COLUMN "priority" TO "crmPriorityScore";

-- Drop old priority index and create new one
DROP INDEX IF EXISTS "Lead_priority_idx";
CREATE INDEX "Lead_crmPriorityScore_idx" ON "Lead"("crmPriorityScore");
