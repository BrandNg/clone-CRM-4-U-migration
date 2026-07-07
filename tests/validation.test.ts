import { describe, it, expect } from 'vitest';
import { capLimit, parseBody } from '@/lib/validation/core';
import {
  createLeadSchema,
  updateLeadSchema,
  updateTaskSchema,
  sendEmailSchema,
  createSequenceSchema,
} from '@/lib/validation/schemas';

describe('createLeadSchema', () => {
  const valid = {
    firstName: 'Anh',
    lastName: 'Tran',
    company: 'VinaTech',
    email: 'anh@vinatech.vn',
    campaignId: 'c1',
  };

  it('accepts a valid payload', () => {
    expect(createLeadSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects bad emails, missing campaign, and invalid enums', () => {
    expect(createLeadSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...valid, campaignId: undefined }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...valid, priority: 'urgent' }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...valid, stage: 'closed' }).success).toBe(false);
  });
});

describe('updateLeadSchema', () => {
  it('accepts all valid stages for existing leads', () => {
    for (const stage of ['new', 'sequence_active', 'replied', 'meeting_booked', 'won', 'lost']) {
      expect(updateLeadSchema.safeParse({ stage }).success).toBe(true);
    }
  });

  it('normalizes empty optional form fields to null', () => {
    const result = updateLeadSchema.safeParse({ title: '', phone: '   ', linkedIn: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeNull();
      expect(result.data.phone).toBeNull();
      expect(result.data.linkedIn).toBeNull();
    }
  });
});

describe('parseBody', () => {
  it('returns details for validation failures', async () => {
    const req = new Request('http://test.local', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    const result = await parseBody(req, createLeadSchema, 'Invalid lead create');
    expect(result.error).toBeDefined();
    if (result.error) {
      const body = await result.error.json();
      expect(body.error).toBe('Invalid lead create');
      expect(Array.isArray(body.details)).toBe(true);
      expect(body.details.length).toBeGreaterThan(0);
    }
  });
});

describe('updateTaskSchema', () => {
  it('accepts status transitions and coerces dates', () => {
    const result = updateTaskSchema.safeParse({ status: 'completed', dueDate: '2026-06-12T09:00:00Z' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dueDate).toBeInstanceOf(Date);
  });

  it('rejects unknown statuses', () => {
    expect(updateTaskSchema.safeParse({ status: 'done' }).success).toBe(false);
  });
});

describe('sendEmailSchema', () => {
  it('requires a valid recipient and account', () => {
    expect(sendEmailSchema.safeParse({ accountId: 'a1', to: 'x@y.com' }).success).toBe(true);
    expect(sendEmailSchema.safeParse({ accountId: 'a1', to: 'nope' }).success).toBe(false);
    expect(sendEmailSchema.safeParse({ to: 'x@y.com' }).success).toBe(false);
  });

  it('rejects empty subject and body', () => {
    expect(sendEmailSchema.safeParse({ accountId: 'a1', to: 'x@y.com', subject: '' }).success).toBe(false);
    expect(sendEmailSchema.safeParse({ accountId: 'a1', to: 'x@y.com', body: '' }).success).toBe(false);
  });

  it('accepts omitted subject and body (optional fields)', () => {
    expect(sendEmailSchema.safeParse({ accountId: 'a1', to: 'x@y.com' }).success).toBe(true);
  });
});

describe('createSequenceSchema', () => {
  it('validates steps: channel enum, delay bounds', () => {
    expect(
      createSequenceSchema.safeParse({
        name: 'Outbound v1',
        steps: [{ channel: 'email', delayDays: 0, delayHours: 0, autoComplete: true }],
      }).success
    ).toBe(true);
    expect(
      createSequenceSchema.safeParse({
        name: 'Bad',
        steps: [{ channel: 'fax' }],
      }).success
    ).toBe(false);
    expect(
      createSequenceSchema.safeParse({
        name: 'Bad',
        steps: [{ channel: 'email', delayHours: 30 }],
      }).success
    ).toBe(false);
  });
});

describe('capLimit', () => {
  it('caps, defaults, and rejects garbage', () => {
    expect(capLimit('999999', 50, 200)).toBe(200);
    expect(capLimit(null, 50, 200)).toBe(50);
    expect(capLimit('abc', 50, 200)).toBe(50);
    expect(capLimit('-5', 50, 200)).toBe(50);
    expect(capLimit('25', 50, 200)).toBe(25);
  });
});
