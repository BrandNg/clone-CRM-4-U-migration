import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, getVisibleUserIds } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  try {
    const { searchParams } = new URL(req.url);
    const dateRange = searchParams.get('dateRange') ?? 'week';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeStart =
      dateRange === 'today' ? todayStart :
      dateRange === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) :
      new Date(todayStart.getTime() - 7 * 86400000);

    const visibleUserIds = await getVisibleUserIds(user);

    let campaigns = await prisma.campaign.findMany({
      where: visibleUserIds ? {
        campaignSdrs: {
          some: {
            userId: { in: visibleUserIds }
          }
        }
      } : {},
      include: {
        client: true,
        campaignSdrs: {
          select: {
            userId: true
          }
        }
      },
      orderBy: {
        startDate: 'desc'
      }
    });

    if (campaigns.length === 0) {
      const fallback = await prisma.campaign.findFirst({
        where: { name: 'Telestar Campaign' },
        include: {
          client: true,
          campaignSdrs: {
            select: {
              userId: true
            }
          }
        }
      });
      if (fallback) {
        campaigns = [fallback];
      }
    }

    const campaignIds = campaigns.map((c) => c.id);

    const activities = await prisma.activity.findMany({
      where: {
        createdAt: { gte: rangeStart },
        lead: {
          campaignId: { in: campaignIds }
        }
      },
      select: {
        type: true,
        leadId: true,
        metadata: true,
        lead: {
          select: {
            campaignId: true
          }
        }
      },
      take: 5000,
    });

    const campaignMetrics = campaigns.map((campaign) => {
      const campaignActs = activities.filter((a) => a.lead?.campaignId === campaign.id);
      const meetingsBooked = campaignActs.filter((a) => a.type === 'meeting_booked').length;
      const touchedLeadIds = new Set(campaignActs.map((a) => a.leadId).filter(Boolean));
      const contactsTouched = touchedLeadIds.size;
      const repliedLeadIds = new Set(
        campaignActs
          .filter((a) => a.type === 'stage_changed' && a.metadata && typeof a.metadata === 'object' && (a.metadata as any).to === 'replied')
          .map((a) => a.leadId)
          .filter(Boolean)
      );
      const replies = repliedLeadIds.size;
      const replyRate = contactsTouched > 0 ? Math.round((replies / contactsTouched) * 100) : 0;

      return {
        id: campaign.id,
        name: campaign.name,
        client: {
          name: campaign.client.name
        },
        status: campaign.status,
        meetingsBooked,
        contactsTouched,
        replyRate,
        isActive: campaign.status === 'active'
      };
    });

    return NextResponse.json(campaignMetrics);
  } catch (err) {
    return handleApiError('api/team/campaigns GET', err);
  }
}
