-- P1.1: Remove blind tenant defaults
-- The @default("default-tenant") values on tenantId columns are removed because
-- the Prisma middleware in lib/prisma.ts injects tenantId from the authenticated
-- session for all creates, updates, and queries. A static default would mask bugs
-- where a create accidentally bypasses the middleware.

ALTER TABLE "User" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Client" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Campaign" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "CampaignSdr" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Sequence" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "SequenceStep" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Template" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "AbTestVariant" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Note" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Reminder" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Activity" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "EmailAccount" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "Notification" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "AiMemory" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "JobRun" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "OutboundMessage" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "SuppressionEntry" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "SequenceEnrollment" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "ImportBatch" ALTER COLUMN "tenantId" DROP DEFAULT;
ALTER TABLE "ImportRow" ALTER COLUMN "tenantId" DROP DEFAULT;

-- P1.9: Add encrypted token columns to EmailAccount
-- Existing plaintext accessToken/refreshToken columns are kept for backfill
-- compatibility; they will be dropped after all existing tokens are migrated.
ALTER TABLE "EmailAccount" ADD COLUMN "encAccessToken" TEXT;
ALTER TABLE "EmailAccount" ADD COLUMN "encRefreshToken" TEXT;
