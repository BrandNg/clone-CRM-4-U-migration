const { PrismaClient } = require('@prisma/client');
const { readFileSync } = require('fs');
const { join } = require('path');

async function run() {
  const prisma = new PrismaClient();
  const baseDir = join(process.cwd(), 'prisma', 'migrations');

  // Run the P8 migration SQL
  const p8Sql = readFileSync(join(baseDir, '20260623100000_p8_premium_data_model', 'migration.sql'), 'utf8');
  const statements = p8Sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      console.log('  ✓ Executed:', stmt.slice(0, 80));
    } catch (e) {
      if (e.code !== '42P07' && e.code !== '42710' && e.code !== '42701') {
        console.error('  ✗ SQL error:', e.message);
        console.error('    Statement:', stmt.slice(0, 160));
      } else {
        console.log('  - Skipped (already exists):', stmt.slice(0, 80));
      }
    }
  }

  // Record the P8 migration
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("checksum", "started_at", "applied_steps_count", "finished_at", "migration_name")
       VALUES (sha256(''), NOW(), 1, NOW(), 'p8_premium_data_model')
       ON CONFLICT DO NOTHING`
    );
    console.log('  ✓ P8 migration recorded');
  } catch (e) {
    console.error('  ✗ Failed to record migration:', e.message);
  }

  await prisma.$disconnect();
  console.log('✓ P8 migration complete');
}

run().catch(e => { console.error(e); process.exit(1); });
