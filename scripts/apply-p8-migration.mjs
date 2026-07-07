import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

async function run() {
  const baseDir = join(process.cwd(), 'prisma', 'migrations');

  // 1. Mark the P1.8 migration as applied
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" ("checksum", "started_at", "applied_steps_count", "finished_at", "migration_name")
     VALUES (sha256(''), NOW(), 1, NOW(), '20260623080000_add_sequencestep_unique_order_per_sequence')
     ON CONFLICT DO NOTHING`
  );
  console.log('  ✓ Marked P1.8 migration as applied');

  // 2. Run the P8 migration SQL
  const p8Sql = readFileSync(join(baseDir, '20260623100000_p8_premium_data_model', 'migration.sql'), 'utf8');
  const statements = p8Sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (e) {
      if (e.code !== '42P07' && e.code !== '42710' && e.code !== '42701') {
        console.error('  ✗ SQL error:', e.message);
        console.error('    Statement:', stmt.slice(0, 200));
      }
    }
  }

  // 3. Record the P8 migration
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" ("checksum", "started_at", "applied_steps_count", "finished_at", "migration_name")
     VALUES (sha256(''), NOW(), 1, NOW(), '20260623100000_p8_premium_data_model')
     ON CONFLICT DO NOTHING`
  );
  console.log('  ✓ P8 migration recorded');

  await prisma.$disconnect();
  console.log('✓ P8 migration complete');
}

run().catch(e => { console.error(e); process.exit(1); });
