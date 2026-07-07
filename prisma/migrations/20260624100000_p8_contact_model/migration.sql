-- P8 Phase 2: Contact model + contactId on Lead

-- Create Contact table
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "linkedIn" TEXT,
    "whatsApp" TEXT,
    "normalizedEmail" TEXT,
    "normalizedPhone" TEXT,
    "normalizedLinkedIn" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contact_tenantId_normalizedEmail_key" ON "Contact"("tenantId", "normalizedEmail");
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Populate Contact from existing Lead data
INSERT INTO "Contact" ("id", "firstName", "lastName", "company", "title", "email", "phone", "linkedIn", "whatsApp", "normalizedEmail", "normalizedPhone", "normalizedLinkedIn", "createdAt", "updatedAt", "tenantId")
SELECT
    gen_random_uuid()::text,
    subq."firstName", subq."lastName", subq."company", subq."title", subq."email",
    subq."phone", subq."linkedIn", subq."whatsApp",
    subq."normalizedEmail", subq."normalizedPhone", subq."normalizedLinkedIn",
    NOW(), NOW(), subq."tenantId"
FROM (
    SELECT DISTINCT ON (l."tenantId", COALESCE(l."normalizedEmail", LOWER(l."email")))
        l."tenantId", l."firstName", l."lastName", l."company", l."title", l."email",
        l."phone", l."linkedIn", l."whatsApp",
        l."normalizedEmail", l."normalizedPhone", l."normalizedLinkedIn"
    FROM "Lead" l
    WHERE l."email" IS NOT NULL AND l."email" != ''
) subq;

-- Add contactId column to Lead (nullable)
ALTER TABLE "Lead" ADD COLUMN "contactId" TEXT;

-- Link leads to their contacts
UPDATE "Lead" l
SET "contactId" = c."id"
FROM "Contact" c
WHERE (c."normalizedEmail" = l."normalizedEmail" OR c."email" = l."email")
  AND c."tenantId" = l."tenantId";

-- Add FK and index
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Lead_contactId_idx" ON "Lead"("contactId");
