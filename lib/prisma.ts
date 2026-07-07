import { PrismaClient, Prisma } from '@prisma/client';
import { cache } from 'react';
import { auditExtension } from './audit';
import { tenantStorage } from './tenant-context';
import { applyScopedTenant, applyBypassTenant } from './tenant-inject';
export { tenantStorage };

// Whether Postgres-level Row-Level Security is actually enforced on the target DB
// (i.e. `supabase/rls.sql` has been applied). When false (single-tenant / standard
// Postgres), the app-layer `tenantId` arg injection below is the isolation layer, and we
// SKIP the per-query `set_config` transaction — saving ~3 round-trips on every query.
const DB_RLS_ENFORCED = process.env.DB_RLS_ENFORCED === 'true';

// Models that actually carry a `tenantId` column. The root `Tenant` model does not, so we
// must never inject a `tenantId` filter/value for it. Derived from the DMMF so it stays in
// sync with the schema automatically.
const MODELS_WITH_TENANT: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
    .map((m) => m.name)
);

const globalForPrisma = globalThis as unknown as { prisma: any };

// Resolve the tenant from the session ONCE per request. `cache()` memoizes within a
// single request, so a handler making N queries decodes the session once, not N times.
const getTenantIdFromSession = cache(async function getTenantIdFromSession(): Promise<string | null> {
  try {
    // Run the auth() call in a context where RLS is bypassed to prevent recursive DB calls
    return await tenantStorage.run({ tenantId: 'default-tenant', bypassRls: true }, async () => {
      const { auth } = await import('@/auth');
      const session = await auth();
      return (session?.user as any)?.tenantId || null;
    });
  } catch {
    // Fail silently when cookies/headers are not available (e.g. outside request context)
    return null;
  }
});

function createPrismaClient() {
  // Standard persistent pooled Postgres connection (works with any Postgres — local, RDS,
  // Supabase). Prisma keeps the pool warm, so there is no per-request cold-start latency.
  // Workers prefer DIRECT_URL (an unpooled connection) for multi-step transactional work.
  const isWorker = process.env.IS_WORKER === 'true';
  const connectionString = isWorker ? (process.env.DIRECT_URL || process.env.DATABASE_URL) : process.env.DATABASE_URL;

  const log: Prisma.LogLevel[] = process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];

  const client = new PrismaClient({ datasources: { db: { url: connectionString } }, log });

  return client.$extends(auditExtension).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model?: string; operation: string; args: any; query: (args: any) => Promise<any> }) {
          if (!model) {
            return query(args);
          }

          const hasTenantField = MODELS_WITH_TENANT.has(model);

          // 1. Resolve tenant context
          const store = tenantStorage.getStore();
          let tenantId: string | null | undefined = store?.tenantId;
          let bypassRls = store?.bypassRls;

          if (!store) {
            tenantId = await getTenantIdFromSession();
          }

          const isLocalOrScript =
            process.env.NODE_ENV !== 'production' || process.env.BYPASS_RLS === 'true';

          if (!tenantId && isLocalOrScript) {
            bypassRls = true;
          }

          // 2. Bypass-RLS path (workers, seed, scripts, or local-no-session).
          if (bypassRls || !tenantId) {
            if (!tenantId && !isLocalOrScript) {
              // Secure by default: return empty/error in production if no context is found
              if (operation.startsWith('find') || operation.startsWith('get')) {
                return operation.endsWith('Many') ? [] : null;
              }
              throw new Error(`Unauthorized: No tenant context active for operation ${operation} on model ${model}`);
            }

            // Even when bypassing RLS *reads*, a known tenant must still be stamped onto
            // *writes* — the column is NOT NULL and has no DB default. We deliberately do
            // NOT add a tenantId WHERE-filter here, so cross-tenant reads (e.g. the worker's
            // JobRun lookup before the tenant is known) keep working.
            if (tenantId && hasTenantField) {
              applyBypassTenant(operation, args, tenantId);
            }

            // Without DB-level RLS there's nothing to bypass — run directly over HTTP.
            if (!DB_RLS_ENFORCED) {
              return query(args);
            }
            const [, result] = await client.$transaction([
              client.$executeRaw`SELECT set_config('app.bypass_rls', 'true', true)`,
              query(args),
            ] as any);
            return result;
          }

          // 3. Scoped path — inject tenantId into WHERE (reads + targeted writes) and stamp
          //    it onto write payloads (the primary isolation layer when RLS is off).
          if (hasTenantField) {
            applyScopedTenant(operation, args, tenantId);
          }

          // 4. The app-layer tenantId injection above is the isolation layer. Only when
          // DB-level RLS is enforced do we also set the GUCs inside a transaction (the
          // secondary, defense-in-depth layer) — otherwise run a single HTTP query.
          if (!DB_RLS_ENFORCED) {
            return query(args);
          }
          const [, , result] = await client.$transaction([
            client.$executeRaw`SELECT set_config('app.bypass_rls', 'false', true)`,
            client.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`,
            query(args),
          ] as any);
          return result;
        },
      },
    },
  });
}

// --- Type-level tenant loosening -------------------------------------------------------
// The extension above stamps `tenantId` onto every write, so callers must not be forced to
// pass it. We loosen ONLY `tenantId` on write-input payloads; every other field keeps full
// type-checking (this is not `as any`). Runtime correctness is guaranteed by the middleware.
type DistributiveTenantOptional<T> = T extends any
  ? 'tenantId' extends keyof T
    ? Omit<T, 'tenantId'> & { tenantId?: T['tenantId'] }
    : T
  : never;

type LooseWriteData<D> = D extends readonly (infer E)[]
  ? DistributiveTenantOptional<E>[]
  : DistributiveTenantOptional<D>;

type LooseWriteArgs<A> = A extends { data: infer D }
  ? Omit<A, 'data'> & { data: LooseWriteData<D> }
  : A extends { create: infer C; update: infer U }
    ? Omit<A, 'create' | 'update'> & { create: DistributiveTenantOptional<C>; update: DistributiveTenantOptional<U> }
    : A;

type WriteOp = 'create' | 'createMany' | 'createManyAndReturn' | 'update' | 'updateMany' | 'upsert';

type TenantOptionalDelegate<Delegate> = {
  [K in keyof Delegate]: K extends WriteOp
    ? Delegate[K] extends (args: infer A, ...rest: infer Rest) => infer R
      ? (args: LooseWriteArgs<A>, ...rest: Rest) => R
      : Delegate[K]
    : Delegate[K];
};

type TenantOptionalClient<C> = {
  [M in keyof C]: C[M] extends { create: (...a: any[]) => any } ? TenantOptionalDelegate<C[M]> : C[M];
};

// Reuse across hot-reloads in development to avoid exhausting connections.
const basePrisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

export const prisma = basePrisma as unknown as TenantOptionalClient<PrismaClient>;
