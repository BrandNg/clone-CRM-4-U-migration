import { NextRequest, NextResponse } from 'next/server';
import { prisma, tenantStorage } from '@/lib/prisma';
import { enqueueEmailSyncWorkflow } from '@/lib/workflows/email';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const ACCOUNTS_PER_RUN = 10;
const MANAGER_ROLES = ['director', 'floor_manager', 'team_lead'];

export async function GET(req: NextRequest) {
  const isCronSecret =
    process.env.CRON_SECRET &&
    req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const session = isCronSecret ? null : await auth();
  const isManager = session?.user && MANAGER_ROLES.includes((session.user as any)?.role ?? '');
  if (!isCronSecret && !isManager) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
    const accounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
      orderBy: { lastSyncAt: { sort: 'asc', nulls: 'first' } },
      take: ACCOUNTS_PER_RUN,
    });

    const userIds = [...new Set(accounts.map(a => a.userId))];
    const userTenants = userIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, tenantId: true },
    }) : [];
    const tenantMap = new Map(userTenants.map(u => [u.id, u.tenantId]));

    const enqueued: { accountId: string; accountEmail: string; tenantId: string }[] = [];

    for (const account of accounts) {
      const tenantId = tenantMap.get(account.userId);
      if (!tenantId) continue;

      await enqueueEmailSyncWorkflow(account.id, tenantId);
      enqueued.push({ accountId: account.id, accountEmail: account.email, tenantId });
    }

    return NextResponse.json({ accounts: accounts.length, enqueued: enqueued.length });
  });
}
