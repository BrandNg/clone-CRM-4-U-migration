import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessLead } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { createNoteSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const leadId = new URL(req.url).searchParams.get('leadId');
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true, campaignId: true } });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!(await canAccessLead(user, lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const notes = await prisma.note.findMany({
    where: { leadId },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createNoteSchema, 'Invalid note create');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const lead = await prisma.lead.findUnique({ where: { id: body.leadId }, select: { assignedToId: true, campaignId: true } });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!(await canAccessLead(user, lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const note = await prisma.note.create({
      data: {
        leadId: body.leadId,
        content: body.content,
        createdById: user.id,
        isPinned: body.isPinned ?? false,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: body.leadId,
        type: 'note_added',
        description: 'Note added to lead',
        metadata: { excerpt: body.content.slice(0, 100) },
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return handleApiError('api/notes POST', err);
  }
}
