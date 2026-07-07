import { vi } from 'vitest';

// Mock @/auth to avoid loading next-auth inside Vitest tests, which throws due to next/server import issues.
vi.mock('@/auth', () => {
  return {
    auth: vi.fn(() => Promise.resolve(null)),
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, tenantStorage } from '@/lib/prisma';
import {
  canImportExport,
  getLeadgenScope,
  getVisibleCampaignIds,
  getLeadWhereScope,
} from '@/lib/auth';

describe('canImportExport', () => {
  it('allows director, floor_manager, and leadgen roles', () => {
    expect(canImportExport('director')).toBe(true);
    expect(canImportExport('floor_manager')).toBe(true);
    expect(canImportExport('leadgen')).toBe(true);
  });

  it('rejects team_lead and sdr roles', () => {
    expect(canImportExport('team_lead')).toBe(false);
    expect(canImportExport('sdr')).toBe(false);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('Leadgen Scoping and Campaigns (DB)', () => {
  const tenantId = 'leadgen-test-tenant';
  let directorId = '';
  let managerId = '';
  let memberId = '';
  let sdrId = '';
  let campaignAId = '';
  let campaignBId = '';

  beforeAll(async () => {
    // Run setup bypassing RLS
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      // Clean up previous runs
      await prisma.campaignSdr.deleteMany({ where: { tenantId } });
      await prisma.lead.deleteMany({ where: { tenantId } });
      await prisma.campaign.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });

      // Create test tenant
      await prisma.tenant.create({
        data: { id: tenantId, name: 'Leadgen Test Tenant' },
      });

      // Create users
      const director = await prisma.user.create({
        data: {
          email: 'director@leadgentest.vn',
          password: 'hashed-password',
          firstName: 'Director',
          lastName: 'Test',
          role: 'director',
          tenantId,
        },
      });
      directorId = director.id;

      const manager = await prisma.user.create({
        data: {
          email: 'manager@leadgentest.vn',
          password: 'hashed-password',
          firstName: 'Maya',
          lastName: 'LeadgenMgr',
          role: 'leadgen',
          managerId: director.id,
          tenantId,
        },
      });
      managerId = manager.id;

      const member = await prisma.user.create({
        data: {
          email: 'member@leadgentest.vn',
          password: 'hashed-password',
          firstName: 'Alex',
          lastName: 'LeadgenMem',
          role: 'leadgen',
          managerId: manager.id,
          tenantId,
        },
      });
      memberId = member.id;

      const sdr = await prisma.user.create({
        data: {
          email: 'sdr@leadgentest.vn',
          password: 'hashed-password',
          firstName: 'SDR',
          lastName: 'Test',
          role: 'sdr',
          managerId: director.id,
          tenantId,
        },
      });
      sdrId = sdr.id;

      // Create client and campaigns
      const client = await prisma.client.create({
        data: {
          name: 'Leadgen Test Client',
          industry: 'Tech',
          contactName: 'Contact',
          contactEmail: 'contact@client.com',
          tenantId,
        },
      });

      const campaignA = await prisma.campaign.create({
        data: {
          clientId: client.id,
          name: 'Campaign A',
          startDate: new Date(),
          tenantId,
        },
      });
      campaignAId = campaignA.id;

      const campaignB = await prisma.campaign.create({
        data: {
          clientId: client.id,
          name: 'Campaign B',
          startDate: new Date(),
          tenantId,
        },
      });
      campaignBId = campaignB.id;

      // Assign Alex (member) to Campaign A only
      await prisma.campaignSdr.create({
        data: {
          campaignId: campaignA.id,
          userId: member.id,
          tenantId,
        },
      });
    });
  });

  afterAll(async () => {
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      await prisma.campaignSdr.deleteMany({ where: { tenantId } });
      await prisma.lead.deleteMany({ where: { tenantId } });
      await prisma.campaign.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
  });

  it('correctly resolves getLeadgenScope', async () => {
    // Maya (manager) reports to Director, so manager.role is 'director' (not 'leadgen')
    // She should be recognized as a manager
    const managerScope = await getLeadgenScope({
      id: managerId,
      email: 'manager@leadgentest.vn',
      firstName: 'Maya',
      lastName: 'LeadgenMgr',
      role: 'leadgen',
    });
    expect(managerScope.kind).toBe('manager');

    // Alex (member) reports to Maya (role 'leadgen'), so he is a member
    const memberScope = await getLeadgenScope({
      id: memberId,
      email: 'member@leadgentest.vn',
      firstName: 'Alex',
      lastName: 'LeadgenMem',
      role: 'leadgen',
    });
    expect(memberScope.kind).toBe('member');
    if (memberScope.kind === 'member') {
      expect(memberScope.campaignIds).toEqual([campaignAId]);
    }
  });

  it('correctly resolves getVisibleCampaignIds', async () => {
    // Director has null (unrestricted)
    const directorCampaigns = await getVisibleCampaignIds({
      id: directorId,
      email: 'director@leadgentest.vn',
      firstName: 'Director',
      lastName: 'Test',
      role: 'director',
    });
    expect(directorCampaigns).toBeNull();

    // Leadgen Manager has null (unrestricted)
    const managerCampaigns = await getVisibleCampaignIds({
      id: managerId,
      email: 'manager@leadgentest.vn',
      firstName: 'Maya',
      lastName: 'LeadgenMgr',
      role: 'leadgen',
    });
    expect(managerCampaigns).toBeNull();

    // Leadgen Member gets their assigned campaigns only
    const memberCampaigns = await getVisibleCampaignIds({
      id: memberId,
      email: 'member@leadgentest.vn',
      firstName: 'Alex',
      lastName: 'LeadgenMem',
      role: 'leadgen',
    });
    expect(memberCampaigns).toEqual([campaignAId]);
    expect(memberCampaigns).not.toContain(campaignBId);
  });

  it('correctly resolves getLeadWhereScope', async () => {
    // Leadgen Manager sees all leads org-wide (returns empty object)
    const managerScope = await getLeadWhereScope({
      id: managerId,
      email: 'manager@leadgentest.vn',
      firstName: 'Maya',
      lastName: 'LeadgenMgr',
      role: 'leadgen',
    });
    expect(managerScope).toEqual({});

    // Leadgen Member sees only assigned campaigns
    const memberScope = await getLeadWhereScope({
      id: memberId,
      email: 'member@leadgentest.vn',
      firstName: 'Alex',
      lastName: 'LeadgenMem',
      role: 'leadgen',
    });
    expect(memberScope).toEqual({ campaignId: { in: [campaignAId] } });

    // SDR sees only their own assigned leads
    const sdrScope = await getLeadWhereScope({
      id: sdrId,
      email: 'sdr@leadgentest.vn',
      firstName: 'SDR',
      lastName: 'Test',
      role: 'sdr',
    });
    expect(sdrScope).toEqual({ assignedToId: { in: [sdrId] } });
  });
});
