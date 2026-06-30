import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { updateSequenceSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';
import { invalidateList } from '@/lib/cache';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { id } = await params;

  try {
    const sequence = await prisma.sequence.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: { template: { select: { id: true, name: true, channel: true } } },
        },
        _count: { select: { leads: true } },
      },
    });

    if (!sequence) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(sequence);
  } catch (err) {
    return handleApiError('api/sequences/[id] GET', err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireRole('team_lead');
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const parsed = await parseBody(req, updateSequenceSchema, 'Invalid sequence update');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    // Sequential statements — the Neon HTTP driver doesn't support interactive
    // transactions, so rebuild steps as delete-then-create.
    if (body.steps !== undefined) {
      await prisma.sequenceStep.deleteMany({ where: { sequenceId: id } });
      await prisma.sequenceStep.createMany({
        data: (body.steps ?? []).map((step, idx) => ({
          sequenceId: id,
          order: step.order ?? idx + 1,
          channel: step.channel,
          delayDays: step.delayDays ?? 1,
          delayHours: step.delayHours ?? 0,
          templateId: step.templateId ?? null,
          instructions: step.instructions,
          autoComplete: step.autoComplete ?? false,
        })),
      });
    }

    const sequence = await prisma.sequence.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    await invalidateList(user.tenantId, 'sequences');
    return NextResponse.json(sequence);
  } catch (err) {
    return handleApiError('api/sequences/[id] PUT', err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireRole('team_lead');
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;

  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    // Archive, don't delete (SKILL.md §3): history and step config stay intact.
    // Unenroll all leads and skip their pending sequence tasks first.
    await prisma.task.updateMany({
      where: { sequenceId: id, status: 'pending' },
      data: { status: 'skipped' },
    });
    await prisma.lead.updateMany({
      where: { sequenceId: id },
      data: { sequenceId: null, sequenceStep: null, sequenceStatus: null },
    });
    await prisma.sequence.update({
      where: { id },
      data: { isArchived: true, isActive: false },
    });

    await invalidateList(user.tenantId, 'sequences');
    return NextResponse.json({ success: true, archived: true });
  } catch (err) {
    return handleApiError('api/sequences/[id] DELETE', err);
  }
}
