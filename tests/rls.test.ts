import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, tenantStorage } from '@/lib/prisma';

// Integration test: needs a live, seeded database (DATABASE_URL). CI has no DB
// configured, so skip there; it still runs locally and anywhere a DB is present.
describe.skipIf(!process.env.DATABASE_URL)('PostgreSQL Row-Level Security (RLS)', () => {
  const tenantAId = 'test-tenant-a';
  const tenantBId = 'test-tenant-b';

  beforeAll(async () => {
    // Setup test data with RLS bypassed
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      // Clean up previous test runs if any
      await prisma.lead.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenantAId, tenantBId] } },
      });

      // Create test tenants
      await prisma.tenant.createMany({
        data: [
          { id: tenantAId, name: 'Tenant A' },
          { id: tenantBId, name: 'Tenant B' },
        ],
      });

      const user = await prisma.user.findFirst();
      const campaign = await prisma.campaign.findFirst();

      if (!user || !campaign) {
        throw new Error('Database must contain at least one User and one Campaign to run RLS tests.');
      }

      // Create lead in Tenant A
      await prisma.lead.create({
        data: {
          firstName: 'John',
          lastName: 'TenantA',
          company: 'Company A',
          email: 'john@tenant-a.com',
          tenantId: tenantAId,
          assignedToId: user.id,
          campaignId: campaign.id,
        },
      });

      // Create lead in Tenant B
      await prisma.lead.create({
        data: {
          firstName: 'Jane',
          lastName: 'TenantB',
          company: 'Company B',
          email: 'jane@tenant-b.com',
          tenantId: tenantBId,
          assignedToId: user.id,
          campaignId: campaign.id,
        },
      });
    });
  });

  afterAll(async () => {
    // Clean up test data with RLS bypassed
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      await prisma.lead.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenantAId, tenantBId] } },
      });
    });
  });

  it('Tenant A should only retrieve Tenant A data', async () => {
    await tenantStorage.run({ tenantId: tenantAId }, async () => {
      const leads = await prisma.lead.findMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      expect(leads.length).toBe(1);
      expect(leads[0].firstName).toBe('John');
      expect(leads[0].tenantId).toBe(tenantAId);
    });
  });

  it('Tenant B should only retrieve Tenant B data', async () => {
    await tenantStorage.run({ tenantId: tenantBId }, async () => {
      const leads = await prisma.lead.findMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      expect(leads.length).toBe(1);
      expect(leads[0].firstName).toBe('Jane');
      expect(leads[0].tenantId).toBe(tenantBId);
    });
  });

  it('Bypassing RLS should retrieve data from both tenants', async () => {
    await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
      const leads = await prisma.lead.findMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      expect(leads.length).toBe(2);
    });
  });
});
