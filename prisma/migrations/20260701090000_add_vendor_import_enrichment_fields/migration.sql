-- Add vendor/enrichment fields for production lead bulk upload.
-- Additive only: no destructive data changes.

ALTER TABLE "Contact"
ADD COLUMN "fullName" TEXT,
ADD COLUMN "department" TEXT,
ADD COLUMN "seniority" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "secondaryPhone" TEXT,
ADD COLUMN "emailValidation" TEXT,
ADD COLUMN "emailScore" INTEGER,
ADD COLUMN "alternateEmail" TEXT,
ADD COLUMN "alternateEmailValidation" TEXT;

ALTER TABLE "Account"
ADD COLUMN "country" TEXT,
ADD COLUMN "companyPhone" TEXT,
ADD COLUMN "staffCountRange" TEXT,
ADD COLUMN "staffCountMin" INTEGER,
ADD COLUMN "staffCountMax" INTEGER,
ADD COLUMN "domain" TEXT;

ALTER TABLE "Lead"
ADD COLUMN "importListName" TEXT,
ADD COLUMN "emailValidation" TEXT,
ADD COLUMN "emailScore" INTEGER,
ADD COLUMN "vendorSource" TEXT;

CREATE INDEX "Contact_tenantId_country_idx" ON "Contact"("tenantId", "country");
CREATE INDEX "Contact_tenantId_emailValidation_idx" ON "Contact"("tenantId", "emailValidation");
CREATE INDEX "Account_tenantId_industry_idx" ON "Account"("tenantId", "industry");
CREATE INDEX "Account_tenantId_country_idx" ON "Account"("tenantId", "country");
CREATE INDEX "Lead_tenantId_importListName_idx" ON "Lead"("tenantId", "importListName");
