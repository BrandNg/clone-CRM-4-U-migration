const { PrismaClient } = require('@prisma/client');

async function run() {
  const prisma = new PrismaClient();

  // 1. Create Account table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Account" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "industry" TEXT,
      "website" TEXT,
      "linkedIn" TEXT,
      "size" INTEGER,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL,
      "tenantId" TEXT NOT NULL,
      CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log('✓ Account table created');

  // 2. Unique + index
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Account_tenantId_name_key" ON "Account"("tenantId", "name")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Account_tenantId_idx" ON "Account"("tenantId")`);
  console.log('✓ Account indexes created');

  // 3. FK from Account to Tenant
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log('✓ Account FK constraint added');
  } catch (e) {
    if (e.message?.includes('already exists')) console.log('  - FK already exists');
    else throw e;
  }

  // 4. Populate Account from existing leads
  const created = await prisma.$executeRawUnsafe(`
    INSERT INTO "Account" ("id", "name", "createdAt", "updatedAt", "tenantId")
    SELECT gen_random_uuid()::text, subq.company, NOW(), NOW(), subq."tenantId"
    FROM (SELECT DISTINCT "company", "tenantId" FROM "Lead" WHERE "company" IS NOT NULL AND "company" != '') subq
    ON CONFLICT DO NOTHING
  `);
  console.log('✓ Accounts populated from leads');

  // 5. Link leads to accounts
  await prisma.$executeRawUnsafe(`
    UPDATE "Lead" l
    SET "accountId" = a."id"
    FROM "Account" a
    WHERE a.name = l.company AND a."tenantId" = l."tenantId"
  `);
  console.log('✓ Leads linked to accounts');

  // 6. Add FK from Lead to Account
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Lead" ADD CONSTRAINT "Lead_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE
    `);
    console.log('✓ Lead FK constraint added');
  } catch (e) {
    if (e.message?.includes('already exists')) console.log('  - FK already exists');
    else throw e;
  }

  await prisma.$disconnect();
  console.log('✓ P8 migration fix complete');
}

run().catch(e => { console.error(e); process.exit(1); });
