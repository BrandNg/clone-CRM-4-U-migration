import { prisma } from '@/lib/prisma';
import { tenantStorage } from '@/lib/tenant-context';

async function main() {
  await tenantStorage.run({ tenantId: 'default-tenant', bypassRls: true }, async () => {
    const users = await prisma.user.findMany({
      select: { email: true, role: true, isActive: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
    });

    console.table(
      users.map((user) => ({
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      }))
    );
  });
}

main()
  .then(async () => {
    await (prisma as any).$disconnect?.();
  })
  .catch(async (err) => {
    console.error('FAIL:', err instanceof Error ? err.message : err);
    await (prisma as any).$disconnect?.();
    process.exit(1);
  });
