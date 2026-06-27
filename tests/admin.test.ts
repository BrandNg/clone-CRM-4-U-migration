import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GET as getJobs } from '@/app/api/admin/jobs/route';
import { GET as getOutbound } from '@/app/api/admin/outbound/route';
import { GET as getWorkerHealth, POST as postWorkerHealth } from '@/app/api/admin/worker-health/route';
import { POST as importLeads } from '@/app/api/leads/import/route';
import { prisma, tenantStorage } from '@/lib/prisma';
import { auth } from '@/auth';
import { NextRequest } from 'next/server';
import type { SessionUser } from '@/lib/auth';

// Mock @/auth so the handlers don't pull next-auth setup into Vitest.
vi.mock('@/auth', () => ({
  auth: vi.fn(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// Mock BullMQ Queue and Worker to avoid connecting to real Redis during tests
vi.mock('bullmq', async (importOriginal) => {
  const original = await importOriginal<typeof import('bullmq')>();
  return {
    ...original,
    Queue: class {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
      async add(name: string, data: any, opts: any) {
        return { id: opts?.jobId || 'mock-job-id', name, data, opts };
      }
      async getJobCounts() {
        return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
      }
      async close() {}
    },
    Worker: class {
      constructor() {}
      async close() {}
    },
  };
});

const tenantId = 'admin-test-tenant';
let campaignId = '';

const sdr: SessionUser = {
  id: 'sdr-1',
  email: 'sdr@telestar.vn',
  firstName: 'Lan',
  lastName: 'Pham',
  role: 'sdr',
  tenantId,
};

const floorManager: SessionUser = {
  id: 'fm-1',
  email: 'fm@telestar.vn',
  firstName: 'Brandon',
  lastName: 'Manager',
  role: 'floor_manager',
  tenantId,
};

const teamLead: SessionUser = {
  id: 'tl-1',
  email: 'tl@telestar.vn',
  firstName: 'Team',
  lastName: 'Lead',
  role: 'team_lead',
  tenantId,
};

// Global Database Setup and Teardown for all tests in this file
beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;

  await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
    // Cleanup previous runs if any remnants exist
    await prisma.importRow.deleteMany({ where: { tenantId } });
    await prisma.importBatch.deleteMany({ where: { tenantId } });
    await prisma.activity.deleteMany({
      where: {
        OR: [
          { tenantId },
          { userId: floorManager.id },
        ],
      },
    });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.campaign.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [floorManager.id, sdr.id, teamLead.id] },
      },
    });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });

    // Setup models
    await prisma.tenant.create({ data: { id: tenantId, name: 'Admin Test Tenant' } });
    
    // Create the test Floor Manager user in the DB to satisfy references
    await prisma.user.create({
      data: {
        id: floorManager.id,
        email: floorManager.email,
        password: 'hashed-pwd',
        firstName: floorManager.firstName,
        lastName: floorManager.lastName,
        role: floorManager.role,
        tenantId,
      },
    });

    const client = await prisma.client.create({
      data: {
        name: 'Admin Test Client',
        industry: 'Software',
        contactName: 'Dean',
        contactEmail: 'dean@client.com',
        tenantId,
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        clientId: client.id,
        name: 'Admin Test Campaign',
        startDate: new Date(),
        tenantId,
      },
    });
    campaignId = campaign.id;
  });
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;

  await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
    await prisma.importRow.deleteMany({ where: { tenantId } });
    await prisma.importBatch.deleteMany({ where: { tenantId } });
    await prisma.activity.deleteMany({
      where: {
        OR: [
          { tenantId },
          { userId: floorManager.id },
        ],
      },
    });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.campaign.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [floorManager.id, sdr.id, teamLead.id] },
      },
    });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });
});

describe('Admin Endpoints - Access Control', () => {
  const mockUser = (u: SessionUser | null) =>
    (auth as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(
      u ? { user: u, expires: '' } : null
    );

  it('blocks unauthorized requests with 401', async () => {
    mockUser(null);
    const req = new NextRequest('http://localhost:3000/api/admin/jobs');
    const res = await getJobs(req);
    expect(res.status).toBe(401);
  });

  it('blocks SDRs with 403', async () => {
    mockUser(sdr);
    const req = new NextRequest('http://localhost:3000/api/admin/jobs');
    const res = await getJobs(req);
    expect(res.status).toBe(403);
  });

  it('blocks Team Leads with 403', async () => {
    mockUser(teamLead);
    const req = new NextRequest('http://localhost:3000/api/admin/outbound');
    const res = await getOutbound(req);
    expect(res.status).toBe(403);
  });

  it('allows Floor Managers to access job runs', async () => {
    mockUser(floorManager);
    const req = new NextRequest('http://localhost:3000/api/admin/jobs');
    const res = await getJobs(req);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('allows Floor Managers to access worker health GET and POST', async () => {
    mockUser(floorManager);
    const reqGet = new NextRequest('http://localhost:3000/api/admin/worker-health');
    const resGet = await getWorkerHealth(reqGet);
    expect(resGet.status).not.toBe(401);
    expect(resGet.status).not.toBe(403);

    // POST triggers health check
    mockUser(floorManager);
    const reqPost = new NextRequest('http://localhost:3000/api/admin/worker-health', { method: 'POST' });
    const resPost = await postWorkerHealth(reqPost);
    expect(resPost.status).not.toBe(401);
    expect(resPost.status).not.toBe(403);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('Admin Endpoints - Import DB Integration', () => {
  it('logs ImportBatch and ImportRow records during a real POST import', async () => {
    (auth as any).mockResolvedValue({
      user: floorManager,
      expires: '',
    });

    const leadsPayload = [
      { firstName: 'Bruce', lastName: 'Wayne', company: 'Wayne Ent', email: 'bruce@wayne.com' },
      { firstName: '', lastName: '', company: '', email: '' }, // Error row
    ];

    const req = new NextRequest('http://localhost:3000/api/leads/import', {
      method: 'POST',
      body: JSON.stringify({
        leads: leadsPayload,
        campaignId,
        filename: 'batman-leads.csv',
      }),
    });

    const res = await importLeads(req);
    expect(res.status).toBe(202);

    const body = await res.json();
    expect(body.batchId).toBeDefined();
    expect(body.totalRows).toBe(2);

    // Verify DB has logged the batch and rows
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      const batch = await prisma.importBatch.findFirst({
        where: { tenantId, filename: 'batman-leads.csv' },
        include: { importRows: true },
      });

      expect(batch).toBeDefined();
      expect(batch?.totalRows).toBe(2);
      // Rows stay 'pending' until BullMQ workers process them (not available in test)
      expect(batch?.parsedRows).toBe(0);
      expect(batch?.errorRows).toBe(0);
      expect(batch?.status).toBe('pending');

      expect(batch?.importRows.length).toBe(2);
      expect(batch?.importRows.every((r) => r.status === 'pending')).toBe(true);
    });
  });
});
