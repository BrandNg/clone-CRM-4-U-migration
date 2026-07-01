import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessUser, getLeadWhereScope } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody, capLimit } from '@/lib/validation/core';
import { createLeadSchema, leadStage, priority as prioritySchema } from '@/lib/validation/schemas';
import { buildLeadListWhere } from '@/lib/leads/listQuery';
import { handleApiError } from '@/lib/api/errors';
import { normalizePhone, normalizeLinkedIn } from '@/lib/leads/normalize';
import { scoreLead } from '@/lib/ai/scoring';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || undefined;
  const stageRaw = searchParams.get('stage') || undefined;
  const priorityRaw = searchParams.get('priority') || undefined;
  const assignedTo = searchParams.get('assignedTo') || undefined;
  const campaignId = searchParams.get('campaignId') || undefined;
  const source = searchParams.get('source') || undefined;
  const importListName = searchParams.get('importListName') || undefined;
  const emailValidation = searchParams.get('emailValidation') || undefined;
  const country = searchParams.get('country') || undefined;
  const industry = searchParams.get('industry') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const dateFrom = searchParams.get('dateFrom') || undefined;
  const dateTo = searchParams.get('dateTo') || undefined;
  const limit = capLimit(searchParams.get('limit'), 200, 500);
  const archivedRaw = searchParams.get('archived') === 'true';
  const includeArchived = archivedRaw && user.role !== 'sdr';

  // Validate enum filters up front — reject bad values instead of casting blindly.
  const stageCheck = stageRaw ? leadStage.safeParse(stageRaw) : null;
  if (stageCheck && !stageCheck.success) {
    return NextResponse.json({ error: 'Invalid stage filter' }, { status: 400 });
  }
  const priorityCheck = priorityRaw ? prioritySchema.safeParse(priorityRaw) : null;
  if (priorityCheck && !priorityCheck.success) {
    return NextResponse.json({ error: 'Invalid priority filter' }, { status: 400 });
  }

  // Scope: user axis for SDR/TL/FM/Director, account axis for leadgen.
  // Director / leadgen-manager → all; leadgen-member → assigned campaigns only.
  // Composed with AND so no filter/search can override it (BUG-001).
  const roleScope = (await getLeadWhereScope(user)) as Prisma.LeadWhereInput;

  try {
    const leads = await prisma.lead.findMany({
      take: limit,
      where: buildLeadListWhere(roleScope, {
        stage: stageCheck?.success ? stageCheck.data : undefined,
        priority: priorityCheck?.success ? priorityCheck.data : undefined,
        assignedTo,
        campaignId,
        source,
        importListName,
        emailValidation,
        country,
        industry,
        tag,
        dateFrom,
        dateTo,
        search,
        includeArchived,
      }),
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        campaign: { select: { id: true, name: true } },
        contact: {
          select: {
            fullName: true,
            department: true,
            seniority: true,
            country: true,
            secondaryPhone: true,
            emailValidation: true,
            emailScore: true,
            alternateEmail: true,
          },
        },
        account: {
          select: {
            website: true,
            domain: true,
            industry: true,
            country: true,
            companyPhone: true,
            linkedIn: true,
            staffCountRange: true,
            staffCountMin: true,
            staffCountMax: true,
            size: true,
          },
        },
        _count: { select: { tasks: true, notes: true } },
        tasks: {
          where: { status: 'pending' },
          orderBy: { dueDate: 'asc' },
          take: 5,
          select: { dueDate: true, type: true, status: true, sequenceId: true },
        },
      },
      orderBy: [{ crmPriorityScore: 'asc' }, { updatedAt: 'desc' }],
    });

    const atRiskCutoff = new Date(Date.now() - 3 * 86400000);

    const enriched = leads.map((l: any) => ({
      ...l,
      priority: l.crmPriorityScore,
      nextTaskDue: l.tasks?.[0]?.dueDate ?? null,
      nextTaskType: l.tasks?.[0]?.type ?? null,
      atRisk: (l.tasks ?? []).some(
        (t: any) => t.sequenceId && new Date(t.dueDate) < atRiskCutoff
      ),
      aiScore: l.engagementScore,
      aiLabel: l.crmPriorityScore === 'hot' ? 'hot' : l.crmPriorityScore === 'warm' ? 'warm' : 'cold',
      tasks: undefined,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    return handleApiError('api/leads GET', err);
  }
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createLeadSchema, 'Invalid lead create');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const targetAssignedToId = body.assignedToId ?? user.id;
  if (targetAssignedToId !== user.id && !(await canAccessUser(user, targetAssignedToId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // No explicit priority → derive it from the AI lead score (hot/warm/cold)
    const aiScore = body.priority ? null : scoreLead({
      ...body,
      id: 'new',
      stage: body.stage ?? 'new',
      crmPriorityScore: body.priority ?? 'warm',
      tags: body.tags ?? [],
      lastContactedAt: null,
      nextTaskDue: null,
      createdAt: new Date().toISOString(),
      activities: [],
      tasks: [],
    });
    const priority: 'hot' | 'warm' | 'cold' = body.priority ?? aiScore?.label ?? 'warm';

    // Create or find Account by company
    let account: { id: string } | null = null;
    if (body.company?.trim()) {
      account = await prisma.account.findUnique({
        where: { tenantId_name: { tenantId: user.tenantId!, name: body.company.trim() } },
      });
      if (!account) {
        account = await prisma.account.create({
          data: { name: body.company.trim(), tenantId: user.tenantId! },
        });
      }
    }

    // Create or find Contact (person-level dedup)
    const normalizedEmail = body.email.toLowerCase().trim();
    let contact = await prisma.contact.findUnique({
      where: { tenantId_normalizedEmail: { tenantId: user.tenantId!, normalizedEmail } },
    });
    if (contact) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: { firstName: body.firstName, lastName: body.lastName, company: body.company, title: body.title, email: body.email, phone: body.phone, linkedIn: body.linkedIn, whatsApp: body.whatsApp, normalizedEmail, normalizedPhone: normalizePhone(body.phone), normalizedLinkedIn: normalizeLinkedIn(body.linkedIn) },
      });
    } else {
      contact = await prisma.contact.create({
        data: { firstName: body.firstName, lastName: body.lastName, company: body.company, title: body.title, email: body.email, phone: body.phone, linkedIn: body.linkedIn, whatsApp: body.whatsApp, normalizedEmail, normalizedPhone: normalizePhone(body.phone), normalizedLinkedIn: normalizeLinkedIn(body.linkedIn), tenantId: user.tenantId! },
      });
    }

    const lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        accountId: account?.id ?? null,
        firstName: body.firstName,
        lastName: body.lastName,
        company: body.company,
        title: body.title,
        email: body.email,
        phone: body.phone,
        linkedIn: body.linkedIn,
        whatsApp: body.whatsApp,
        stage: body.stage ?? 'new',
        assignedToId: body.assignedToId ?? user.id,
        campaignId: body.campaignId,
        source: body.source,
        importListName: body.importListName,
        emailValidation: body.emailValidation,
        emailScore: body.emailScore,
        vendorSource: body.vendorSource,
        tags: body.tags ?? [],
        crmPriorityScore: priority,
        engagementScore: aiScore?.score ?? null,
        normalizedEmail, normalizedPhone: normalizePhone(body.phone), normalizedLinkedIn: normalizeLinkedIn(body.linkedIn),
      },
    });

    // Auto-log lead_created activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        type: 'lead_created',
        description: `Lead ${lead.firstName} ${lead.lastName} created`,
      },
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    return handleApiError('api/leads POST', err);
  }
}
