import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, getVisibleUserIds } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const dateRange = searchParams.get('dateRange') ?? 'week';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rangeStart =
    dateRange === 'today' ? todayStart :
    dateRange === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) :
    new Date(todayStart.getTime() - 7 * 86400000); // Default to week

  try {
    const [campaign, visibleUserIds] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id },
        include: {
          client: true,
          campaignSdrs: true
        }
      }),
      getVisibleUserIds(user),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (visibleUserIds) {
    const isAssigned = campaign.campaignSdrs.some((cs) => visibleUserIds.includes(cs.userId));
    if (!isAssigned) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Define lead query scope
  const leadWhere: Record<string, any> = { campaignId: id };
  if (user.role === 'sdr') {
    leadWhere.assignedToId = user.id;
  } else if (visibleUserIds) {
    leadWhere.assignedToId = { in: visibleUserIds };
  }

  // Fire all independent reads in parallel rather than awaiting them one by one.
  const [rawStageCounts, activities, sequencesRunning, tasksDone, enrolledSequences, assignedUsers] = await Promise.all([
    // 1. Pipeline Funnel (Stage Counts)
    prisma.lead.groupBy({
      by: ['stage'],
      where: leadWhere,
      _count: { id: true }
    }),
    // 2. Activities in date range for KPI cards + per-sequence/per-rep tallies
    prisma.activity.findMany({
      where: {
        createdAt: { gte: rangeStart },
        lead: leadWhere
      },
      select: {
        type: true,
        leadId: true,
        sequenceId: true,
        metadata: true,
        userId: true
      },
      take: 10000,
    }),
    prisma.sequence.count({
      where: {
        isActive: true,
        leads: { some: leadWhere }
      }
    }),
    prisma.task.count({
      where: {
        status: 'completed',
        completedAt: { gte: rangeStart },
        lead: leadWhere
      }
    }),
    // 3. Sequences enrolled in this campaign (for the sequences table)
    prisma.sequence.findMany({
      where: {
        leads: { some: leadWhere }
      },
      select: {
        id: true,
        name: true
      }
    }),
    // 4. Reps assigned to this campaign (for the reps table)
    prisma.user.findMany({
      where: {
        campaignSdrs: {
          some: { campaignId: id }
        },
        id: user.role === 'sdr' ? user.id : (visibleUserIds ? { in: visibleUserIds } : undefined)
      },
      select: {
        id: true,
        firstName: true,
        lastName: true
      }
    }),
  ]);

  const stageCounts = Object.fromEntries(
    rawStageCounts.map((sc) => [sc.stage, sc._count.id])
  );

  const meetingsBooked = activities.filter((a) => a.type === 'meeting_booked').length;
  const contactsTouched = new Set(activities.map((a) => a.leadId).filter(Boolean)).size;
  const replies = new Set(
    activities
      .filter((a) => a.type === 'stage_changed' && a.metadata && typeof a.metadata === 'object' && (a.metadata as any).to === 'replied')
      .map((a) => a.leadId)
      .filter(Boolean)
  ).size;
  const replyRate = contactsTouched > 0 ? Math.round((replies / contactsTouched) * 100) : 0;

  // Batch the per-sequence and per-rep counts into grouped aggregations
  // instead of firing 2 queries per sequence + 1 query per rep.
  const seqIds = enrolledSequences.map((s) => s.id);
  const repIds = assignedUsers.map((u) => u.id);

  const [enrolledBySeqRows, completedBySeqRows, tasksByRepRows] = await Promise.all([
    seqIds.length
      ? prisma.lead.groupBy({
          by: ['sequenceId'],
          where: { ...leadWhere, sequenceId: { in: seqIds } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { sequenceId: string | null; _count: { _all: number } }[]),
    seqIds.length
      ? prisma.activity.groupBy({
          by: ['sequenceId'],
          where: { createdAt: { gte: rangeStart }, type: 'sequence_completed', sequenceId: { in: seqIds }, lead: leadWhere },
          _count: { _all: true },
        })
      : Promise.resolve([] as { sequenceId: string | null; _count: { _all: number } }[]),
    repIds.length
      ? prisma.task.groupBy({
          by: ['userId'],
          where: { status: 'completed', completedAt: { gte: rangeStart }, lead: leadWhere, userId: { in: repIds } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { userId: string; _count: { _all: number } }[]),
  ]);

  const enrolledBySeq = new Map(enrolledBySeqRows.map((r) => [r.sequenceId, r._count._all]));
  const completedBySeq = new Map(completedBySeqRows.map((r) => [r.sequenceId, r._count._all]));
  const tasksByRep = new Map(tasksByRepRows.map((r) => [r.userId, r._count._all]));

  // 3. Sequences Table Data
  const sequenceMetrics = enrolledSequences.map((seq) => {
    const seqActs = activities.filter((a) => a.sequenceId === seq.id);
    const seqTouched = new Set(seqActs.map((a) => a.leadId).filter(Boolean)).size;
    const seqReplies = new Set(
      seqActs
        .filter((a) => a.type === 'stage_changed' && a.metadata && typeof a.metadata === 'object' && (a.metadata as any).to === 'replied')
        .map((a) => a.leadId)
        .filter(Boolean)
    ).size;
    const seqReplyRate = seqTouched > 0 ? Math.round((seqReplies / seqTouched) * 100) : 0;
    const seqMeetingsBooked = seqActs.filter((a) => a.type === 'meeting_booked').length;

    return {
      id: seq.id,
      name: seq.name,
      enrolled: enrolledBySeq.get(seq.id) ?? 0,
      completed: completedBySeq.get(seq.id) ?? 0,
      replyRate: seqReplyRate,
      meetingsBooked: seqMeetingsBooked
    };
  });

  // 4. Reps Table Data
  const repMetrics = assignedUsers.map((u) => {
    const repActs = activities.filter((a) => a.userId === u.id);

    const emails = repActs.filter((a) => a.type === 'email_sent').length;
    const calls = repActs.filter((a) => a.type === 'call_logged' || a.type === 'call_made').length;
    const linkedin = repActs.filter((a) => a.type === 'linkedin_touch' || a.type === 'linkedin_sent').length;
    const whatsapp = repActs.filter((a) => a.type === 'whatsapp_message' || a.type === 'whatsapp_sent').length;
    const booked = repActs.filter((a) => a.type === 'meeting_booked').length;

    return {
      id: u.id,
      name: `${u.firstName} ${u.lastName.charAt(0)}.`, // client screenshare safe format
      tasksDone: tasksByRep.get(u.id) ?? 0,
      emails,
      calls,
      linkedin,
      whatsapp,
      booked
    };
  });

    return NextResponse.json({
      campaignName: campaign.name,
      clientName: campaign.client.name,
      status: campaign.status,
      kpis: {
        meetingsBooked,
        contactsTouched,
        replies,
        replyRate,
        sequencesRunning,
        tasksDone
      },
      stageCounts,
      sequences: sequenceMetrics,
      reps: repMetrics
    });
  } catch (err) {
    return handleApiError('api/team/campaigns/[id] GET', err);
  }
}
