-- ============================================================================
-- Telestar SDR CRM — Row-Level Security (production / Supabase)
-- ============================================================================
-- This is the DATABASE-level enforcement layer that mirrors the application-level
-- tenant isolation already done in lib/prisma.ts (the Prisma `$allOperations`
-- extension). The app sets two per-transaction GUCs before every query:
--
--     set_config('app.current_tenant_id', <tenantId>, true)
--     set_config('app.bypass_rls', 'true' | 'false', true)
--
-- The policy below reads those exact settings, so the two layers stay in lockstep:
-- a row is visible/writable only when its `tenantId` matches the active tenant, OR
-- the connection has explicitly opted into a bypass (used by seed/maintenance
-- scripts, which run with app.bypass_rls = 'true').
--
-- FORCE ROW LEVEL SECURITY is required because the app connects as the table owner,
-- and owners bypass RLS by default. With FORCE, the policy applies to the owner too;
-- privileged scripts still work via the bypass GUC.
--
-- Apply (against the production / Supabase DB, using the DIRECT_URL):
--     psql "$DIRECT_URL" -f supabase/rls.sql
-- Re-running is safe — it is idempotent (drops + recreates each policy).
-- ============================================================================

DO $$
DECLARE
  -- Every tenant-scoped table (all models except the root `Tenant`). Prisma uses
  -- the default mapping, so physical table names are the quoted PascalCase model
  -- names and the discriminator column is "tenantId".
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'User', 'Client', 'Campaign', 'CampaignSdr', 'Lead', 'Sequence',
    'SequenceStep', 'Task', 'Template', 'AbTestVariant', 'Note', 'Reminder',
    'Activity', 'EmailAccount', 'Notification', 'AuditLog', 'AiMemory'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', tbl);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        USING (
          current_setting('app.bypass_rls', true) = 'true'
          OR "tenantId" = current_setting('app.current_tenant_id', true)
        )
        WITH CHECK (
          current_setting('app.bypass_rls', true) = 'true'
          OR "tenantId" = current_setting('app.current_tenant_id', true)
        );
    $p$, tbl);
  END LOOP;
END
$$;

-- Verify (optional):
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class WHERE relname IN ('Lead','Task','User') ;
