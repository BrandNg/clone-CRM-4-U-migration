import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, getLeadgenScope } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  // Verify Leadgen Manager or higher
  const scope = await getLeadgenScope(user);
  if (scope.kind !== 'manager' && user.role !== 'director' && user.role !== 'floor_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const whereClause: any = {
      role: 'leadgen',
      isActive: true,
    };
    if (user.role === 'leadgen') {
      whereClause.managerId = user.id;
    }

    const members = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
      },
    })

    const memberStats = await Promise.all(
      members.map(async (member) => {
        // 1. Total leads sourced / created by this member
        const sourcedCount = await prisma.activity.count({
          where: {
            userId: member.id,
            type: 'lead_created',
          },
        });

        // 2. Leads currently assigned to this member
        const assignedCount = await prisma.lead.count({
          where: {
            assignedToId: member.id,
          },
        });

        // 3. Qualified leads (turned into meeting booked or won)
        const qualifiedCount = await prisma.lead.count({
          where: {
            assignedToId: member.id,
            stage: { in: ['meeting_booked', 'won'] },
          },
        });

        // 4. Campaigns assigned
        const campaignAssignments = await prisma.campaignSdr.findMany({
          where: { userId: member.id },
          select: { campaign: { select: { name: true } } },
        });

        return {
          id: member.id,
          name: `${member.firstName} ${member.lastName}`.trim(),
          email: member.email,
          avatarUrl: member.avatarUrl,
          sourcedCount,
          assignedCount,
          qualifiedCount,
          campaigns: campaignAssignments.map((c) => c.campaign.name),
        };
      })
    );

    return NextResponse.json(memberStats);
  } catch (err) {
    return handleApiError('api/leadgen/team-progress GET', err);
  }
}
