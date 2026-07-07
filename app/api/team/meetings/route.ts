import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireManager, getVisibleUserIds, getLeadgenScope } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const userOrRes = await requireManager();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  try {
    let visibleUserIds = await getVisibleUserIds(user);
    if (user.role === 'leadgen') {
      const scope = await getLeadgenScope(user);
      if (scope.kind === 'manager') {
        visibleUserIds = null;
      }
    }
    const whereClause: any = {
      activities: {
        some: {
          type: 'meeting_booked',
        },
      },
    };

    if (visibleUserIds) {
      whereClause.assignedToId = { in: visibleUserIds };
    }

    const leads = await prisma.lead.findMany({
      where: whereClause,
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        activities: {
          where: { type: 'meeting_booked' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(leads);
  } catch (err) {
    return handleApiError('api/team/meetings GET', err);
  }
}
