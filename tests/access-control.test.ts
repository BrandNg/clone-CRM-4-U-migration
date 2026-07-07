import { vi, describe, it, expect } from 'vitest';
import { canAccessLead, getLeadWhereScope, type SessionUser } from '@/lib/auth';
import { GET as getAssignments, POST as postAssignment } from '@/app/api/admin/assignments/route';
import { auth } from '@/auth';
import { NextRequest } from 'next/server';

// Mock @/auth so the route handlers don't pull next-auth into Vitest.
vi.mock('@/auth', () => ({
  auth: vi.fn(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const sdr: SessionUser = {
  id: 'sdr-1', email: 'sdr@telestar.vn', firstName: 'Lan', lastName: 'Pham', role: 'sdr',
};
const director: SessionUser = {
  id: 'dir-1', email: 'dean@telestar.vn', firstName: 'Dean', lastName: '', role: 'director',
};
const teamLead: SessionUser = {
  id: 'tl-1', email: 'brandon@telestar.vn', firstName: 'Brandon', lastName: '', role: 'team_lead',
};

// These cases all short-circuit before any prisma call (sdr/director roles), so they
// run without a database and are safe in CI.
describe('canAccessLead — user axis vs account axis', () => {
  it('an SDR can access their own lead', async () => {
    expect(await canAccessLead(sdr, { assignedToId: sdr.id, campaignId: 'camp-1' })).toBe(true);
  });

  it("an SDR CANNOT access a teammate's lead in the same campaign (IDOR regression)", async () => {
    // The fixed bug: account-axis must not widen SDR access. Same campaign, different owner.
    expect(await canAccessLead(sdr, { assignedToId: 'other-sdr', campaignId: 'camp-1' })).toBe(false);
  });

  it('an SDR has no access to an unassigned lead', async () => {
    expect(await canAccessLead(sdr, { assignedToId: null, campaignId: 'camp-1' })).toBe(false);
  });

  it('a Director can access any lead', async () => {
    expect(await canAccessLead(director, { assignedToId: 'anyone', campaignId: 'camp-x' })).toBe(true);
  });
});

describe('getLeadWhereScope — query scoping', () => {
  it('scopes an SDR to their own assigned leads only', async () => {
    expect(await getLeadWhereScope(sdr)).toEqual({ assignedToId: { in: [sdr.id] } });
  });

  it('leaves a Director unrestricted', async () => {
    expect(await getLeadWhereScope(director)).toEqual({});
  });
});

describe('/api/admin/assignments — control-plane auth gates', () => {
  const mockUser = (u: SessionUser | null) =>
    (auth as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(
      u ? { user: u, expires: '' } : null
    );

  it('GET returns 401 when unauthorized', async () => {
    mockUser(null);
    const res = await getAssignments();
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for an SDR (no admin domain)', async () => {
    mockUser(sdr);
    const res = await getAssignments();
    expect(res.status).toBe(403);
  });

  it('GET returns 403 for a Team Lead (read-only role)', async () => {
    mockUser(teamLead);
    const res = await getAssignments();
    expect(res.status).toBe(403);
  });

  it('POST returns 403 for an SDR trying to assign', async () => {
    mockUser(sdr);
    const req = new NextRequest('http://localhost:3000/api/admin/assignments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'some-user', campaignId: 'some-campaign' }),
    });
    const res = await postAssignment(req);
    expect(res.status).toBe(403);
  });
});
