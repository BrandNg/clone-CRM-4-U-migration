-- Composite indexes matching the hot query paths (leaderboard groupBy,
-- campaign-detail aggregations, lead pipeline filters, overdue-task scans).
-- IF NOT EXISTS makes this safe to re-run.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Activity_userId_type_createdAt_idx" ON "Activity"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lead_campaignId_stage_idx" ON "Lead"("campaignId", "stage");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lead_campaignId_assignedToId_idx" ON "Lead"("campaignId", "assignedToId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_userId_status_dueDate_idx" ON "Task"("userId", "status", "dueDate");
