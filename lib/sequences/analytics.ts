import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getLeadWhereScope, getVisibleUserIds, type SessionUser } from '@/lib/auth';

export interface SequenceAnalytics {
  totalEnrolled: number;
  activeEnrolled: number;
  completedCount: number;
  totalSends: number;
  uniqueReplies: number;
  bounceCount: number;
  replyRate: number;
  bounceRate: number;
  sendsByDay: { date: string; count: number }[];
  topTemplates: { id: string; name: string; sent: number; replies: number; rate: number }[];
  stepBreakdown: { step: number; channel: string; sent: number; replies: number }[];
}

export interface TemplateAnalytics {
  id: string;
  name: string;
  channel: string;
  totalSent: number;
  totalReplies: number;
  replyRate: number;
  variants: { version: string; sent: number; replies: number; rate: number }[];
}

export async function getSequenceAnalytics(sequenceId: string): Promise<SequenceAnalytics> {
  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: { steps: true, _count: { select: { leads: true } } },
  });
  if (!sequence) throw new Error('Sequence not found');

  // The remaining reads are independent of each other — run them in parallel.
  const [activeEnrolled, completedActivities, sends, activities] = await Promise.all([
    prisma.lead.count({
      where: { sequenceId, sequenceStatus: 'active' },
    }),
    prisma.activity.count({
      where: { sequenceId, type: 'sequence_completed' },
    }),
    prisma.activity.findMany({
      where: { type: 'email_sent', metadata: { path: ['sequenceId'], equals: sequenceId } },
      select: { createdAt: true },
    }),
    prisma.activity.findMany({
      where: {
        leadId: { not: null },
        type: { in: ['email_sent', 'stage_changed', 'sequence_unenrolled'] },
        metadata: { path: ['sequenceId'], equals: sequenceId },
      },
      select: { type: true, metadata: true, createdAt: true },
      take: 10000,
    }),
  ]);

  const totalSends = sends.length;

  const replies = activities.filter(a => a.type === 'stage_changed' && (a.metadata as any)?.to === 'replied').length;
  const bounces = activities.filter(a => a.type === 'sequence_unenrolled' && (a.metadata as any)?.reason === 'bounced').length;

  const sendsByDayMap = new Map<string, number>();
  sends.forEach(s => {
    const day = s.createdAt.toISOString().slice(0, 10);
    sendsByDayMap.set(day, (sendsByDayMap.get(day) || 0) + 1);
  });
  const sendsByDay = Array.from(sendsByDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topTemplates: SequenceAnalytics['topTemplates'] = [];

  // Step send counts come from the already-fetched, sequence-scoped `activities`
  // array — no per-step queries, and correctly scoped to THIS sequence (the old
  // per-step count had no sequenceId filter and counted across all sequences).
  const sentByStep = new Map<number, number>();
  for (const a of activities) {
    if (a.type !== 'email_sent') continue;
    const step = (a.metadata as any)?.sequenceStep;
    if (typeof step === 'number') sentByStep.set(step, (sentByStep.get(step) ?? 0) + 1);
  }
  const stepBreakdown: SequenceAnalytics['stepBreakdown'] = sequence.steps.map((step) => ({
    step: step.order,
    channel: step.channel,
    sent: sentByStep.get(step.order) ?? 0,
    replies: 0,
  }));

  return {
    totalEnrolled: sequence._count.leads,
    activeEnrolled,
    completedCount: completedActivities,
    totalSends,
    uniqueReplies: replies,
    bounceCount: bounces,
    replyRate: totalSends > 0 ? Math.round((replies / totalSends) * 10000) / 100 : 0,
    bounceRate: totalSends > 0 ? Math.round((bounces / totalSends) * 10000) / 100 : 0,
    sendsByDay,
    topTemplates,
    stepBreakdown,
  };
}

export async function getTemplateAnalytics(templateId: string): Promise<TemplateAnalytics | null> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: { abVariants: true },
  });
  if (!template) return null;

  const totalSent = template.abVariants.reduce((sum, v) => sum + v.sentCount, 0);
  const totalReplies = template.abVariants.reduce((sum, v) => sum + v.replyCount, 0);

  return {
    id: template.id,
    name: template.name,
    channel: template.channel,
    totalSent,
    totalReplies,
    replyRate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 10000) / 100 : 0,
    variants: template.abVariants.map(v => ({
      version: v.version,
      sent: v.sentCount,
      replies: v.replyCount,
      rate: v.sentCount > 0 ? Math.round((v.replyCount / v.sentCount) * 10000) / 100 : 0,
    })),
  };
}

export async function getDashboardStats(userId: string) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(todayStart.getTime() - 7 * 86400000);
  const monthAgo = new Date(todayStart.getTime() - 30 * 86400000);

  const [
    totalLeads,
    activeEnrollments,
    todaySends,
    weekSends,
    monthSends,
    todayReplies,
    weekReplies,
    totalBounces,
    topSequences,
  ] = await Promise.all([
    prisma.lead.count({ where: { assignedToId: userId } }),
    prisma.lead.count({ where: { assignedToId: userId, sequenceStatus: 'active' } }),
    prisma.activity.count({ where: { userId, type: 'email_sent', createdAt: { gte: todayStart } } }),
    prisma.activity.count({ where: { userId, type: 'email_sent', createdAt: { gte: weekAgo } } }),
    prisma.activity.count({ where: { userId, type: 'email_sent', createdAt: { gte: monthAgo } } }),
    prisma.activity.count({
      where: { lead: { assignedToId: userId }, type: 'stage_changed', metadata: { path: ['to'], equals: 'replied' }, createdAt: { gte: todayStart } },
    }),
    prisma.activity.count({
      where: { lead: { assignedToId: userId }, type: 'stage_changed', metadata: { path: ['to'], equals: 'replied' }, createdAt: { gte: weekAgo } },
    }),
    prisma.lead.count({ where: { assignedToId: userId, emailInvalid: true } }),
    prisma.sequence.findMany({
      where: { createdById: userId, isArchived: false },
      select: { id: true, name: true, _count: { select: { leads: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    totalLeads,
    activeEnrollments,
    todaySends,
    weekSends,
    monthSends,
    todayReplies,
    weekReplies,
    totalBounces,
    sequences: topSequences,
  };
}

export interface ScopedSequenceStats {
  totalLeads: number;
  activeEnrollments: number;
  todaySends: number;
  weekSends: number;
  monthSends: number;
  todayReplies: number;
  weekReplies: number;
  totalBounces: number;
  sequences: { id: string; name: string; activeLeads: number; _count: { leads: number } }[];
}

/**
 * Role-scoped sequence performance for the Team View / Leadgen Manager report.
 *
 * Same shape as getDashboardStats but aggregated across the viewer's visibility instead of
 * their own assigned leads — Director sees all, FM/TL their pod∪accounts, Leadgen Manager all,
 * Leadgen member their campaigns. Reuses the canonical scope helpers in lib/auth (no new
 * scoping logic): getLeadWhereScope for the lead axis, getVisibleUserIds for the send (activity) axis.
 */
export async function getScopedSequenceStats(user: SessionUser): Promise<ScopedSequenceStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(todayStart.getTime() - 7 * 86400000);
  const monthAgo = new Date(todayStart.getTime() - 30 * 86400000);

  const leadScope = (await getLeadWhereScope(user)) as Prisma.LeadWhereInput;
  const visibleIds = await getVisibleUserIds(user); // null = unrestricted (director / leadgen-mgr)

  const sendWhere: Prisma.ActivityWhereInput = {
    type: 'email_sent',
    ...(visibleIds ? { userId: { in: visibleIds } } : {}),
  };
  const replyWhere = (gte: Date): Prisma.ActivityWhereInput => ({
    lead: leadScope,
    type: 'stage_changed',
    metadata: { path: ['to'], equals: 'replied' },
    createdAt: { gte },
  });
  // Compose the scope with AND so an extra filter can never widen the viewer's visibility.
  const scopedLead = (extra: Prisma.LeadWhereInput): Prisma.LeadWhereInput => ({ AND: [leadScope, extra] });

  const [
    totalLeads,
    activeEnrollments,
    todaySends,
    weekSends,
    monthSends,
    todayReplies,
    weekReplies,
    totalBounces,
    sequences,
  ] = await Promise.all([
    prisma.lead.count({ where: leadScope }),
    prisma.lead.count({ where: scopedLead({ sequenceStatus: 'active' }) }),
    prisma.activity.count({ where: { ...sendWhere, createdAt: { gte: todayStart } } }),
    prisma.activity.count({ where: { ...sendWhere, createdAt: { gte: weekAgo } } }),
    prisma.activity.count({ where: { ...sendWhere, createdAt: { gte: monthAgo } } }),
    prisma.activity.count({ where: replyWhere(todayStart) }),
    prisma.activity.count({ where: replyWhere(weekAgo) }),
    prisma.lead.count({ where: scopedLead({ emailInvalid: true }) }),
    prisma.sequence.findMany({
      where: { isArchived: false },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const seqStats = await Promise.all(
    sequences.map(async (seq) => {
      const [enrolled, active] = await Promise.all([
        prisma.lead.count({ where: scopedLead({ sequenceId: seq.id }) }),
        prisma.lead.count({ where: scopedLead({ sequenceId: seq.id, sequenceStatus: 'active' }) }),
      ]);
      return { id: seq.id, name: seq.name, activeLeads: active, _count: { leads: enrolled } };
    })
  );

  return {
    totalLeads,
    activeEnrollments,
    todaySends,
    weekSends,
    monthSends,
    todayReplies,
    weekReplies,
    totalBounces,
    sequences: seqStats,
  };
}
