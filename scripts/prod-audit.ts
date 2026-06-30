import { spawnSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import { loadEnvFile } from './prod-env';

type Level = 'PASS' | 'WARN' | 'FAIL';
const results: Array<{ level: Level; message: string }> = [];

const record = (level: Level, message: string) => {
  results.push({ level, message });
  console.log(`${level}: ${message}`);
};

const count = async (label: string, fn: () => Promise<number>) => {
  try {
    const total = await fn();
    record('PASS', `${label}: ${total}`);
  } catch {
    record('FAIL', `${label} count failed`);
  }
};

const rawCount = async (prisma: PrismaClient, sql: string): Promise<number> => {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(sql);
  return Number(rows[0]?.count ?? 0);
};

async function main() {
  try {
    loadEnvFile('.env.production');
    record('PASS', '.env.production loaded');
  } catch {
    record('WARN', '.env.production not loaded; using current process env');
  }

  const envCheck = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'prod:check-env'],
    { encoding: 'utf8' }
  );
  if (envCheck.status === 0) record('PASS', 'required env validation passed');
  else record('FAIL', 'required env validation failed');

  const prisma = new PrismaClient();
  try {
    try {
      await prisma.$queryRaw`SELECT 1`;
      record('PASS', 'database connection ok');
    } catch {
      record('FAIL', 'database connection failed');
    }

    const migrate = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['prisma', 'migrate', 'status'],
      { encoding: 'utf8' }
    );
    if (migrate.status === 0) record('PASS', 'Prisma migration status ok');
    else record('WARN', 'Prisma migration status returned warnings or failed');

    if (process.env.REDIS_URL) {
      const redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
      try {
        await redis.connect();
        const pong = await redis.ping();
        record(pong === 'PONG' ? 'PASS' : 'WARN', `Redis ping: ${pong}`);
      } catch {
        record('FAIL', 'Redis connection failed');
      } finally {
        redis.disconnect();
      }
    } else {
      record('FAIL', 'REDIS_URL missing');
    }

    await count('users', () => prisma.user.count());
    await count('clients', () => prisma.client.count());
    await count('campaigns', () => prisma.campaign.count());
    await count('leads', () => prisma.lead.count());
    await count('tasks', () => prisma.task.count());

    const inactiveUsers = await prisma.user.count({ where: { isActive: false } });
    record(inactiveUsers > 0 ? 'WARN' : 'PASS', `inactive users: ${inactiveUsers}`);

    const badRoles = await rawCount(
      prisma,
      "SELECT COUNT(*)::bigint AS count FROM \"User\" WHERE role::text NOT IN ('director','floor_manager','team_lead','sdr','leadgen')"
    );
    record(badRoles > 0 ? 'FAIL' : 'PASS', `users with bad roles: ${badRoles}`);

    const badLeadStages = await rawCount(
      prisma,
      "SELECT COUNT(*)::bigint AS count FROM \"Lead\" WHERE stage::text NOT IN ('new','sequence_active','replied','meeting_booked','won','lost')"
    );
    record(badLeadStages > 0 ? 'FAIL' : 'PASS', `leads with invalid stages: ${badLeadStages}`);

    const badLeadStatuses = await rawCount(
      prisma,
      "SELECT COUNT(*)::bigint AS count FROM \"Lead\" WHERE \"sequenceStatus\" IS NOT NULL AND \"sequenceStatus\"::text NOT IN ('active','paused','completed','unenrolled')"
    );
    record(badLeadStatuses > 0 ? 'FAIL' : 'PASS', `leads with invalid sequence status: ${badLeadStatuses}`);

    const campaignsWithoutClient = await rawCount(
      prisma,
      'SELECT COUNT(*)::bigint AS count FROM "Campaign" c LEFT JOIN "Client" cl ON cl.id = c."clientId" WHERE cl.id IS NULL'
    );
    record(campaignsWithoutClient > 0 ? 'FAIL' : 'PASS', `campaigns without client: ${campaignsWithoutClient}`);

    const orphanTasks = await rawCount(
      prisma,
      'SELECT COUNT(*)::bigint AS count FROM "Task" t LEFT JOIN "Lead" l ON l.id = t."leadId" WHERE l.id IS NULL'
    );
    record(orphanTasks > 0 ? 'WARN' : 'PASS', `tasks without lead: ${orphanTasks}`);

    const healthUrl = process.env.PROD_AUDIT_HEALTH_URL ?? 'http://localhost:3000/api/health';
    try {
      const res = await fetch(healthUrl);
      record(res.ok ? 'PASS' : 'WARN', `health endpoint ${healthUrl}: ${res.status}`);
    } catch {
      record('WARN', `health endpoint unavailable: ${healthUrl}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((err) => {
    record('FAIL', err instanceof Error ? err.message : 'production audit failed');
  })
  .finally(() => {
    if (results.some((result) => result.level === 'FAIL')) {
      process.exit(1);
    }
  });
