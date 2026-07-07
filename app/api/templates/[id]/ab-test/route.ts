import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOrRes = await requireRole('team_lead');
  if (userOrRes instanceof NextResponse) return userOrRes;

  try {
    const { id } = await params;
    const variants = await prisma.abTestVariant.findMany({
      where: { templateId: id },
    });
    return NextResponse.json(variants);
  } catch (err) {
    return handleApiError('api/templates/[id]/ab-test GET', err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOrRes = await requireRole('team_lead');
  if (userOrRes instanceof NextResponse) return userOrRes;

  try {
    const { id } = await params;
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const body = await req.json();
    const { subjectB, bodyB } = body;

    if (!subjectB && !bodyB) {
      return NextResponse.json({ error: 'Provide at least subjectB or bodyB' }, { status: 400 });
    }

    const existingB = await prisma.abTestVariant.findFirst({
      where: { templateId: id, version: 'B' },
    });

    if (existingB) {
      const updated = await prisma.abTestVariant.update({
        where: { id: existingB.id },
        data: {
          subject: subjectB ?? undefined,
          body: bodyB ?? undefined,
        },
      });
      return NextResponse.json(updated);
    }

    const variant = await prisma.abTestVariant.create({
      data: {
        templateId: id,
        version: 'B',
        subject: subjectB ?? null,
        body: bodyB ?? null,
      },
    });

    return NextResponse.json(variant, { status: 201 });
  } catch (err) {
    return handleApiError('api/templates/[id]/ab-test POST', err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOrRes = await requireRole('team_lead');
  if (userOrRes instanceof NextResponse) return userOrRes;

  try {
    const { id } = await params;
    await prisma.abTestVariant.deleteMany({
      where: { templateId: id, version: 'B' },
    });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError('api/templates/[id]/ab-test DELETE', err);
  }
}
