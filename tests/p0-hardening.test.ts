import { describe, it, expect } from 'vitest';
import { createLeadSchema, updateLeadSchema } from '@/lib/validation/schemas';
import { getLocalDayBoundaries } from '@/lib/dates/timezone';
import { buildLeadListWhere } from '@/lib/leads/listQuery';

describe('P0.5 Schema Hardening — Block Fake Sequence Stage', () => {
  const validLead = {
    firstName: 'Anh',
    lastName: 'Tran',
    company: 'VinaTech',
    email: 'anh@vinatech.vn',
    campaignId: 'c1',
  };

  it('rejects creating a lead with stage: sequence_active', () => {
    const result = createLeadSchema.safeParse({ ...validLead, stage: 'sequence_active' });
    expect(result.success).toBe(false);
  });

  it('accepts creating a lead with normal stages', () => {
    const result = createLeadSchema.safeParse({ ...validLead, stage: 'new' });
    expect(result.success).toBe(true);
  });

  it('accepts updating a lead stage to sequence_active', () => {
    const result = updateLeadSchema.safeParse({ stage: 'sequence_active' });
    expect(result.success).toBe(true);
  });

  it('strips out sequenceId and sequenceStep on update', () => {
    const result = updateLeadSchema.safeParse({
      firstName: 'Lan',
      sequenceId: 'seq-123',
      sequenceStep: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).sequenceId).toBeUndefined();
      expect((result.data as any).sequenceStep).toBeUndefined();
      expect(result.data.firstName).toBe('Lan');
    }
  });
});

describe('P0.7 Soft Archive — Query Filtering', () => {
  const roleScope = { assignedToId: 'user-1' };

  it('excludes archived leads by default', () => {
    const where = buildLeadListWhere(roleScope, {});
    expect(where).toEqual({
      AND: [
        { assignedToId: 'user-1' },
        { archivedAt: null },
      ],
    });
  });

  it('includes archived leads when includeArchived is true', () => {
    const where = buildLeadListWhere(roleScope, { includeArchived: true });
    expect(where).toEqual({
      AND: [
        { assignedToId: 'user-1' },
      ],
    });
  });
});

describe('P0.10 Timezone Calculations', () => {
  it('computes correct day boundaries for Asia/Ho_Chi_Minh (UTC+7)', () => {
    // 2026-06-23T11:00:00Z is 2026-06-23T18:00:00 in Vietnam (UTC+7)
    const date = new Date(Date.UTC(2026, 5, 23, 11, 0, 0));
    const { start, end, yesterdayStart } = getLocalDayBoundaries(date, 'Asia/Ho_Chi_Minh');

    // Start of local day in VN (00:00:00) should be 2026-06-22T17:00:00Z
    expect(start.toISOString()).toBe('2026-06-22T17:00:00.000Z');
    // End of local day in VN should be 24 hours later
    expect(end.toISOString()).toBe('2026-06-23T17:00:00.000Z');
    // Yesterday start should be 24 hours before start
    expect(yesterdayStart.toISOString()).toBe('2026-06-21T17:00:00.000Z');
  });

  it('computes correct day boundaries for America/New_York (UTC-4 in summer)', () => {
    // 2026-06-23T11:00:00Z is 2026-06-23T07:00:00 in New York
    const date = new Date(Date.UTC(2026, 5, 23, 11, 0, 0));
    const { start, end, yesterdayStart } = getLocalDayBoundaries(date, 'America/New_York');

    // Start of local day in NY (00:00:00) should be 2026-06-23T04:00:00Z
    expect(start.toISOString()).toBe('2026-06-23T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-06-24T04:00:00.000Z');
    expect(yesterdayStart.toISOString()).toBe('2026-06-22T04:00:00.000Z');
  });
});
