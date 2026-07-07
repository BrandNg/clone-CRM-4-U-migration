import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GET as getScope } from '@/app/api/leadgen/scope/route';
import { POST as assignLeads } from '@/app/api/leadgen/assign/route';
import { GET as getMeetings } from '@/app/api/team/meetings/route';
import { GET as getTeamProgress } from '@/app/api/leadgen/team-progress/route';
import { prisma, tenantStorage } from '@/lib/prisma';
import { auth } from '@/auth';
import { NextRequest } from 'next/server';

// Mock @/auth to avoid loading next-auth inside Vitest tests, which throws due to next/server import issues.
vi.mock('@/auth', () => {
  return {
    auth: vi.fn(),
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
});

describe('Leadgen Redesign API Endpoints - Authorization Unit Tests', () => {
  it('GET /api/leadgen/scope returns 401 when unauthorized', async () => {
    (auth as any).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost:3000/api/leadgen/scope');
    const res = await getScope(req);
    expect(res.status).toBe(401);
  });

  it('GET /api/leadgen/scope returns 403 for SDR and Team Lead roles', async () => {
    (auth as any).mockResolvedValueOnce({
      user: {
        id: 'sdr-id',
        email: 'sdr@telestar.vn',
        firstName: 'SDR',
        lastName: 'User',
        role: 'sdr',
      },
      expires: '',
    });
    const req1 = new NextRequest('http://localhost:3000/api/leadgen/scope');
    const res1 = await getScope(req1);
    expect(res1.status).toBe(403);

    (auth as any).mockResolvedValueOnce({
      user: {
        id: 'teamlead-id',
        email: 'teamlead@telestar.vn',
        firstName: 'Team',
        lastName: 'Lead',
        role: 'team_lead',
      },
      expires: '',
    });
    const req2 = new NextRequest('http://localhost:3000/api/leadgen/scope');
    const res2 = await getScope(req2);
    expect(res2.status).toBe(403);
  });

  it('POST /api/leadgen/assign returns 401 when unauthorized', async () => {
    (auth as any).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost:3000/api/leadgen/assign', {
      method: 'POST',
      body: JSON.stringify({ leadIds: ['1'], campaignId: 'c1' }),
    });
    const res = await assignLeads(req);
    expect(res.status).toBe(401);
  });

  it('GET /api/team/meetings returns 401 when unauthorized', async () => {
    (auth as any).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost:3000/api/team/meetings');
    const res = await getMeetings(req);
    expect(res.status).toBe(401);
  });

  it('GET /api/team/meetings returns 403 for SDR role', async () => {
    (auth as any).mockResolvedValueOnce({
      user: {
        id: 'sdr-id',
        email: 'sdr@telestar.vn',
        firstName: 'SDR',
        lastName: 'User',
        role: 'sdr',
      },
      expires: '',
    });
    const req = new NextRequest('http://localhost:3000/api/team/meetings');
    const res = await getMeetings(req);
    expect(res.status).toBe(403);
  });

  it('GET /api/leadgen/team-progress returns 401 when unauthorized', async () => {
    (auth as any).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost:3000/api/leadgen/team-progress');
    const res = await getTeamProgress(req);
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('Leadgen Redesign API Endpoints - Database Integration Tests', () => {
  const tenantId = 'leadgen-redesign-test-tenant';
  let managerId = '';
  let memberId = '';
  let sdrId = '';
  let campaignId = '';
  let lead1Id = '';
  let lead2Id = '';

  beforeAll(async () => {
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      // Clean up previous runs
      await prisma.campaignSdr.deleteMany({ where: { tenantId } });
      await prisma.activity.deleteMany({
        where: {
          OR: [
            { tenantId },
            { user: { tenantId } }
          ]
        }
      });
      await prisma.lead.deleteMany({ where: { tenantId } });
      await prisma.campaign.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });

      // Create test tenant
      await prisma.tenant.create({
        data: { id: tenantId, name: 'Leadgen Redesign Test Tenant' },
      });

      // Create users
      const director = await prisma.user.create({
        data: {
          email: 'director@leadgenredesign.vn',
          password: 'hashed-password',
          firstName: 'Director',
          lastName: 'Test',
          role: 'director',
          tenantId,
        },
      });

      const manager = await prisma.user.create({
        data: {
          email: 'manager@leadgenredesign.vn',
          password: 'hashed-password',
          firstName: 'Dominic',
          lastName: 'Mgr',
          role: 'leadgen',
          managerId: director.id,
          tenantId,
        },
      });
      managerId = manager.id;

      const member = await prisma.user.create({
        data: {
          email: 'member@leadgenredesign.vn',
          password: 'hashed-password',
          firstName: 'Alex',
          lastName: 'Mem',
          role: 'leadgen',
          managerId: manager.id,
          tenantId,
        },
      });
      memberId = member.id;

      const sdr = await prisma.user.create({
        data: {
          email: 'sdr@leadgenredesign.vn',
          password: 'hashed-password',
          firstName: 'Lan',
          lastName: 'Pham',
          role: 'sdr',
          managerId: director.id,
          tenantId,
        },
      });
      sdrId = sdr.id;

      // Create client and campaign
      const client = await prisma.client.create({
        data: {
          name: 'Redesign Client',
          industry: 'Tech',
          contactName: 'Contact',
          contactEmail: 'contact@client.com',
          tenantId,
        },
      });

      const campaign = await prisma.campaign.create({
        data: {
          clientId: client.id,
          name: 'Redesign Campaign',
          startDate: new Date(),
          tenantId,
        },
      });
      campaignId = campaign.id;

      // Create unassigned leads initially assigned to the manager
      const lead1 = await prisma.lead.create({
        data: {
          firstName: 'Unassigned1',
          lastName: 'Prospect',
          company: 'Company1',
          email: 'un1@test.com',
          assignedToId: manager.id,
          campaignId: campaign.id,
          tenantId,
        },
      });
      lead1Id = lead1.id;

      const lead2 = await prisma.lead.create({
        data: {
          firstName: 'Unassigned2',
          lastName: 'Prospect',
          company: 'Company2',
          email: 'un2@test.com',
          assignedToId: manager.id,
          campaignId: campaign.id,
          tenantId,
        },
      });
      lead2Id = lead2.id;
    });
  });

  afterAll(async () => {
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      await prisma.campaignSdr.deleteMany({ where: { tenantId } });
      await prisma.activity.deleteMany({
        where: {
          OR: [
            { tenantId },
            { user: { tenantId } }
          ]
        }
      });
      await prisma.lead.deleteMany({ where: { tenantId } });
      await prisma.campaign.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
  });

  it('GET /api/leadgen/scope returns correct scope for manager vs member in DB context', async () => {
    // Dominic (Manager)
    (auth as any).mockResolvedValue({
      user: {
        id: managerId,
        email: 'manager@leadgenredesign.vn',
        firstName: 'Dominic',
        lastName: 'Mgr',
        role: 'leadgen',
        isManager: true,
        tenantId,
      },
      expires: '',
    });

    const reqManager = new NextRequest('http://localhost:3000/api/leadgen/scope');
    const resManager = await getScope(reqManager);
    expect(resManager.status).toBe(200);
    const scopeManager = await resManager.json();
    expect(scopeManager.kind).toBe('manager');

    // Alex (Member)
    (auth as any).mockResolvedValue({
      user: {
        id: memberId,
        email: 'member@leadgenredesign.vn',
        firstName: 'Alex',
        lastName: 'Mem',
        role: 'leadgen',
        tenantId,
      },
      expires: '',
    });

    const reqMember = new NextRequest('http://localhost:3000/api/leadgen/scope');
    const resMember = await getScope(reqMember);
    expect(resMember.status).toBe(200);
    const scopeMember = await resMember.json();
    expect(scopeMember.kind).toBe('member');
  });

  it('POST /api/leadgen/assign updates leads and logs activities for manager, and rejects member', async () => {
    // First, verify Alex (Member) is forbidden from bulk assigning
    (auth as any).mockResolvedValue({
      user: {
        id: memberId,
        email: 'member@leadgenredesign.vn',
        firstName: 'Alex',
        lastName: 'Mem',
        role: 'leadgen',
        tenantId,
      },
      expires: '',
    });

    const reqMemberPost = new NextRequest('http://localhost:3000/api/leadgen/assign', {
      method: 'POST',
      body: JSON.stringify({
        leadIds: [lead1Id, lead2Id],
        campaignId,
        assignedToId: sdrId,
      }),
    });
    const resMemberPost = await assignLeads(reqMemberPost);
    expect(resMemberPost.status).toBe(403);

    // Verify Dominic (Manager) is allowed to bulk assign
    (auth as any).mockResolvedValue({
      user: {
        id: managerId,
        email: 'manager@leadgenredesign.vn',
        firstName: 'Dominic',
        lastName: 'Mgr',
        role: 'leadgen',
        isManager: true,
        tenantId,
      },
      expires: '',
    });

    const reqManagerPost = new NextRequest('http://localhost:3000/api/leadgen/assign', {
      method: 'POST',
      body: JSON.stringify({
        leadIds: [lead1Id, lead2Id],
        campaignId,
        assignedToId: sdrId,
      }),
    });
    const resManagerPost = await assignLeads(reqManagerPost);
    expect(resManagerPost.status).toBe(200);
    const body = await resManagerPost.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);

    // Verify database update bypass RLS to verify data updates
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      const updatedLeads = await prisma.lead.findMany({
        where: { id: { in: [lead1Id, lead2Id] } },
        select: { assignedToId: true, campaignId: true },
      });
      expect(updatedLeads.length).toBe(2);
      expect(updatedLeads[0].assignedToId).toBe(sdrId);
      expect(updatedLeads[1].assignedToId).toBe(sdrId);

      const activities = await prisma.activity.findMany({
        where: { leadId: { in: [lead1Id, lead2Id] }, type: 'stage_changed' },
      });
      expect(activities.length).toBe(2);
      expect(activities[0].description).toContain('Lead reassigned by Leadgen Manager');
    });
  });

  it('GET /api/team/meetings returns leads that reached the meeting stage', async () => {
    // First, let's create a meeting_booked activity for lead1
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      await prisma.activity.create({
        data: {
          userId: managerId,
          leadId: lead1Id,
          type: 'meeting_booked',
          description: 'Meeting booked',
          tenantId,
        }
      });
    });

    // Dominic (Manager) accesses meetings
    (auth as any).mockResolvedValue({
      user: {
        id: managerId,
        email: 'manager@leadgenredesign.vn',
        firstName: 'Dominic',
        lastName: 'Mgr',
        role: 'leadgen',
        isManager: true,
        tenantId,
      },
      expires: '',
    });

    const req = new NextRequest('http://localhost:3000/api/team/meetings');
    const res = await getMeetings(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].id).toBe(lead1Id);
  });

  it('GET /api/leadgen/team-progress returns stats for Dominic\'s leadgen team members', async () => {
    // Dominic (Manager) queries team progress
    (auth as any).mockResolvedValue({
      user: {
        id: managerId,
        email: 'manager@leadgenredesign.vn',
        firstName: 'Dominic',
        lastName: 'Mgr',
        role: 'leadgen',
        isManager: true,
        tenantId,
      },
      expires: '',
    });

    const req = new NextRequest('http://localhost:3000/api/leadgen/team-progress');
    const res = await getTeamProgress(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
    // Finds Alex (member) reporting to Dominic
    expect(data[0].id).toBe(memberId);
  });
});
