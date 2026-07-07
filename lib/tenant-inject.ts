// Pure tenant-injection helpers used by the Prisma client extension in `lib/prisma.ts`.
// Extracted so the isolation logic can be unit-tested without constructing a real
// PrismaClient / Neon connection.

/** Operations whose `where` should be tenant-scoped on reads. */
export const READ_SCOPED_OPS: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Write operations whose `where` should also be tenant-scoped. */
export const WHERE_SCOPED_WRITE_OPS: ReadonlySet<string> = new Set([
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * Return a copy of `payload` with `tenantId` set. When `override` is true the context
 * tenant always wins (a request cannot spoof another tenant); when false we only fill it
 * in if the caller omitted it (trusted worker/seed contexts).
 */
export function applyTenant<T>(payload: T, tenantId: string, override: boolean): T {
  if (payload == null || typeof payload !== 'object') return payload;
  return (override ? { ...payload, tenantId } : { tenantId, ...payload }) as T;
}

/**
 * Stamp `tenantId` onto a write operation's data payload(s). Handles every write shape:
 * create/update/updateMany (`data`), createMany (`data` array), and upsert (`create`+`update`).
 * Mutates `args` in place (matching Prisma extension semantics).
 */
export function stampTenantWrite(operation: string, args: any, tenantId: string, override: boolean): void {
  if (!args) return;
  switch (operation) {
    case 'create':
    case 'update':
    case 'updateMany':
      args.data = applyTenant(args.data, tenantId, override);
      break;
    case 'createMany':
    case 'createManyAndReturn':
      if (Array.isArray(args.data)) {
        args.data = args.data.map((d: any) => applyTenant(d, tenantId, override));
      } else {
        args.data = applyTenant(args.data, tenantId, override);
      }
      break;
    case 'upsert':
      args.create = applyTenant(args.create, tenantId, override);
      args.update = applyTenant(args.update, tenantId, override);
      break;
  }
}

/**
 * Scoped path (tenant known, RLS not bypassed): inject `tenantId` into WHERE for reads and
 * targeted writes, and stamp it onto write payloads (context tenant wins). Mutates `args`.
 */
export function applyScopedTenant(operation: string, args: any, tenantId: string): void {
  if (READ_SCOPED_OPS.has(operation) || WHERE_SCOPED_WRITE_OPS.has(operation)) {
    args.where = { ...args.where, tenantId };
  }
  stampTenantWrite(operation, args, tenantId, true);
}

/**
 * Bypass path (workers/seed/scripts): stamp writes with the known tenant so the NOT-NULL
 * column is satisfied, but do NOT add a WHERE filter — bypass intentionally allows
 * cross-tenant reads. Mutates `args`.
 */
export function applyBypassTenant(operation: string, args: any, tenantId: string): void {
  stampTenantWrite(operation, args, tenantId, false);
}
