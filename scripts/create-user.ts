import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { tenantStorage } from '@/lib/tenant-context';

const raw = new PrismaClient();
const roles = ['director', 'floor_manager', 'team_lead', 'sdr', 'leadgen'] as const;
type Role = (typeof roles)[number];

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const hasFlag = (flag: string): boolean => process.argv.includes(flag);

const usage = () => {
  console.error(
    "Usage: npm run create-user -- --email user@domain.com --password 'password' --first-name 'First' --last-name 'Last' --role team_lead [--activate]"
  );
};

async function main() {
  const email = (arg('--email') ?? '').trim().toLowerCase();
  const password = arg('--password');
  const firstName = (arg('--first-name') ?? '').trim();
  const lastName = (arg('--last-name') ?? '').trim();
  const role = arg('--role') as Role | undefined;
  const activate = hasFlag('--activate') || hasFlag('--active');

  if (!email) {
    usage();
    throw new Error('--email is required');
  }
  if (role && !roles.includes(role)) {
    throw new Error(`Invalid role "${role}". Supported roles: ${roles.join(', ')}`);
  }
  if (password && password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const tenantId = 'default-tenant';
  await raw.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: 'Default Tenant' },
  });

  await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing && (!password || !firstName || !lastName || !role)) {
      usage();
      throw new Error('Creating a user requires --password, --first-name, --last-name, and --role');
    }

    const data: Record<string, unknown> = {};
    if (password) data.password = await hash(password, 12);
    if (firstName) data.firstName = firstName;
    if (lastName) data.lastName = lastName;
    if (role) data.role = role;
    if (activate || !existing) data.isActive = true;

    if (existing) {
      if (Object.keys(data).length === 0) {
        throw new Error('No changes requested. Pass --password, --role, --first-name, --last-name, or --activate.');
      }
      await prisma.user.update({ where: { email }, data: data as any });
      console.log(`OK: updated ${email}`);
      if (password) console.log('OK: password reset');
      if (role) console.log(`OK: role set to ${role}`);
      if (activate) console.log('OK: user activated');
      return;
    }

    await prisma.user.create({
      data: {
        email,
        password: data.password as string,
        firstName,
        lastName,
        role: role!,
        isActive: true,
      },
    });
    console.log(`OK: created ${email} (${role})`);
  });
}

main()
  .then(async () => {
    await (prisma as any).$disconnect?.();
    await raw.$disconnect();
  })
  .catch(async (err) => {
    console.error('FAIL:', err instanceof Error ? err.message : err);
    await (prisma as any).$disconnect?.();
    await raw.$disconnect();
    process.exit(1);
  });
