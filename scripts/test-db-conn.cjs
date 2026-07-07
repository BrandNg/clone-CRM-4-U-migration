const { PrismaClient } = require('@prisma/client');
async function test() {
  try {
    const pc = new PrismaClient();
    await pc.$connect();
    const r = await pc.$executeRawUnsafe(`SELECT 1`);
    console.log('DB OK:', r);
    await pc.$disconnect();
  } catch(e) {
    console.error('DB FAIL:', e.message);
  }
}
test();
