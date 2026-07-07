-- P1.4: SuppressionEntry uniqueness constraints
-- Email-based: prevent duplicate email+scope suppression
CREATE UNIQUE INDEX "suppression_email_scope_unique"
ON "SuppressionEntry"("tenantId", "email", COALESCE("campaignId", ''))
WHERE "email" IS NOT NULL;
-- Domain-based: prevent duplicate domain+scope suppression
CREATE UNIQUE INDEX "suppression_domain_scope_unique"
ON "SuppressionEntry"("tenantId", "domain", COALESCE("campaignId", ''))
WHERE "domain" IS NOT NULL;
-- Company-based: prevent duplicate company+scope suppression
CREATE UNIQUE INDEX "suppression_company_scope_unique"
ON "SuppressionEntry"("tenantId", "company", COALESCE("campaignId", ''))
WHERE "company" IS NOT NULL;

-- P1.5: SequenceEnrollment — one active enrollment per lead per sequence
-- The full @@unique([leadId, sequenceId]) is removed from the Prisma schema;
-- this partial index is the replacement, allowing completed/unenrolled duplicates
-- while enforcing at most one active.
CREATE UNIQUE INDEX "sequence_enrollment_active_unique"
ON "SequenceEnrollment"("leadId", "sequenceId")
WHERE "status" = 'active';

-- P1.7: Lead dedup — at most one lead per tenant+campaign+normalizedEmail
CREATE UNIQUE INDEX "lead_normalized_email_unique"
ON "Lead"("tenantId", "campaignId", "normalizedEmail")
WHERE "normalizedEmail" IS NOT NULL;
