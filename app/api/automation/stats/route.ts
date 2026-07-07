import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const userOrRes = await requireManager();
  if (userOrRes instanceof NextResponse) return userOrRes;

  try {
    // 1. Fetch KPI metrics
    const [totalActiveSequences, totalPendingOutbound, totalActiveAccounts] = await Promise.all([
      prisma.lead.count({
        where: {
          sequenceId: { not: null },
          sequenceStatus: 'active',
        },
      }),
      prisma.task.count({
        where: {
          status: 'pending',
          type: 'email',
          sequenceId: { not: null },
        },
      }),
      prisma.emailAccount.count({
        where: {
          isActive: true,
        },
      }),
    ]);

    // 2. Fetch email account statuses (active only; exclude credential fields)
    const emailAccounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
      orderBy: { email: 'asc' },
      select: {
        id: true,
        email: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        dailySendCount: true,
        hourlySendWindow: true,
        imapServer: true,
        smtpServer: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // 3. Fetch recent automation activity logs
    const activities = await prisma.activity.findMany({
      where: {
        type: {
          in: [
            'email_sent',
            'sequence_enrolled',
            'sequence_completed',
            'sequence_unenrolled',
            'stage_changed',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json({
      metrics: {
        totalActiveSequences,
        totalPendingOutbound,
        totalActiveAccounts,
      },
      emailAccounts,
      activities,
    });
  } catch (error) {
    console.error('[automation-stats-api] Failed to load statistics:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
