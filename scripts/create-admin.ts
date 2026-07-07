/**
 * Create (or promote) the first production admin — a Director account.
 *
 * Production must NOT run `npm run db:seed`: that wipes data and creates demo users with
 * a shared password. Use this instead, once, after `prisma migrate deploy`.
 *
 * Usage:
 *   npm run create-admin -- --email you@co.com --password 'strong-pass' --name 'Your Name'
 *   # or via env:
 *   ADMIN_EMAIL=you@co.com ADMIN_PASSWORD='strong-pass' ADMIN_NAME='Your Name' npm run create-admin
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { tenantStorage } from '@/lib/tenant-context';

const raw = new PrismaClient();

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg('--email') ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = arg('--password') ?? process.env.ADMIN_PASSWORD ?? '';
  const name = (arg('--name') ?? process.env.ADMIN_NAME ?? 'Admin').trim();

  if (!email || !password) {
    console.error('Missing required input.');
    console.error("Usage: npm run create-admin -- --email <email> --password <password> [--name 'Full Name']");
    console.error('   or set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in the environment.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const tenantId = 'default-tenant';
  const [firstName, ...rest] = name.split(' ');
  const passwordHash = await hash(password, 12);

  // Tenant has no tenantId column → use the raw client (not the tenant-scoped one).
  await raw.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: 'Default Tenant' },
  });

  await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({
        where: { email },
        data: { password: passwordHash, role: 'director', isActive: true },
      });
      console.log(`✓ Updated ${email} → director (password reset, account active).`);
    } else {
      await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          firstName: firstName || 'Admin',
          lastName: rest.join(' '),
          role: 'director',
        },
      });
      console.log(`✓ Created director ${email}.`);
    }
  });
}

main()
  .then(() => raw.$disconnect())
  .catch(async (err) => {
    console.error('create-admin failed:', err);
    await raw.$disconnect();
    process.exit(1);
  });
