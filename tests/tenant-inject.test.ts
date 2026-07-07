import { describe, it, expect } from 'vitest';
import {
  applyTenant,
  stampTenantWrite,
  applyScopedTenant,
  applyBypassTenant,
} from '@/lib/tenant-inject';

const TENANT = 'tenant-abc';

describe('applyTenant', () => {
  it('sets tenantId on an object', () => {
    expect(applyTenant({ name: 'x' }, TENANT, true)).toEqual({ name: 'x', tenantId: TENANT });
  });

  it('override=true makes the context tenant win over an explicit one', () => {
    expect(applyTenant({ name: 'x', tenantId: 'spoofed' }, TENANT, true)).toEqual({
      name: 'x',
      tenantId: TENANT,
    });
  });

  it('override=false only fills tenantId when the caller omitted it', () => {
    expect(applyTenant({ name: 'x', tenantId: 'explicit' }, TENANT, false)).toEqual({
      name: 'x',
      tenantId: 'explicit',
    });
    expect(applyTenant({ name: 'x' }, TENANT, false)).toEqual({ name: 'x', tenantId: TENANT });
  });

  it('passes through null/non-objects untouched', () => {
    expect(applyTenant(null as any, TENANT, true)).toBeNull();
    expect(applyTenant(undefined as any, TENANT, true)).toBeUndefined();
  });
});

describe('stampTenantWrite', () => {
  it('stamps create data', () => {
    const args: any = { data: { userId: 'u1' } };
    stampTenantWrite('create', args, TENANT, true);
    expect(args.data.tenantId).toBe(TENANT);
  });

  it('stamps every element of a createMany array', () => {
    const args: any = { data: [{ a: 1 }, { a: 2 }] };
    stampTenantWrite('createMany', args, TENANT, true);
    expect(args.data).toEqual([
      { a: 1, tenantId: TENANT },
      { a: 2, tenantId: TENANT },
    ]);
  });

  it('stamps both create and update payloads of an upsert', () => {
    const args: any = { where: { id: '1' }, create: { a: 1 }, update: { b: 2 } };
    stampTenantWrite('upsert', args, TENANT, true);
    expect(args.create.tenantId).toBe(TENANT);
    expect(args.update.tenantId).toBe(TENANT);
  });

  it('does nothing for delete (no data payload)', () => {
    const args: any = { where: { id: '1' } };
    stampTenantWrite('delete', args, TENANT, true);
    expect(args.data).toBeUndefined();
  });
});

describe('applyScopedTenant (request context — RLS not bypassed)', () => {
  it('scopes findMany by tenantId in WHERE', () => {
    const args: any = { where: { stage: 'new' } };
    applyScopedTenant('findMany', args, TENANT);
    expect(args.where).toEqual({ stage: 'new', tenantId: TENANT });
  });

  it('scopes update by WHERE and stamps the data payload', () => {
    const args: any = { where: { id: '1' }, data: { stage: 'won' } };
    applyScopedTenant('update', args, TENANT);
    expect(args.where.tenantId).toBe(TENANT);
    expect(args.data.tenantId).toBe(TENANT);
  });

  it('stamps a create and forces the context tenant (anti-spoof)', () => {
    const args: any = { data: { name: 'x', tenantId: 'attacker' } };
    applyScopedTenant('create', args, TENANT);
    expect(args.data.tenantId).toBe(TENANT);
  });
});

describe('applyBypassTenant (worker/seed context — RLS bypassed)', () => {
  it('stamps writes so the NOT-NULL column is satisfied', () => {
    const args: any = { data: { name: 'x' } };
    applyBypassTenant('create', args, TENANT);
    expect(args.data.tenantId).toBe(TENANT);
  });

  it('does NOT add a tenantId WHERE filter to reads (cross-tenant lookups allowed)', () => {
    const args: any = { where: { id: 'job-1' } };
    applyBypassTenant('findUnique', args, TENANT);
    expect(args.where).toEqual({ id: 'job-1' });
    expect(args.where.tenantId).toBeUndefined();
  });

  it('preserves an explicitly provided tenantId (does not override in trusted context)', () => {
    const args: any = { data: { name: 'x', tenantId: 'explicit-tenant' } };
    applyBypassTenant('create', args, TENANT);
    expect(args.data.tenantId).toBe('explicit-tenant');
  });
});
