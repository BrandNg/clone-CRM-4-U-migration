import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const policies = await prisma.$queryRawUnsafe('SELECT * FROM pg_policies');
    console.log('POLICIES:', JSON.stringify(policies, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
