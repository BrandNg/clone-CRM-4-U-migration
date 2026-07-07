import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { updateCampaignSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';
import { invalidateList } from '@/lib/cache';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireRole('floor_manager');
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const parsed = await parseBody(req, updateCampaignSchema, 'Invalid campaign update');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  try {
    const existing = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.targetVertical !== undefined && { targetVertical: body.targetVertical ?? null }),
        ...(body.targetGeo !== undefined && { targetGeo: body.targetGeo ?? null }),
      },
      include: { client: true },
    });

    await invalidateList(user.tenantId, 'campaigns');
    return NextResponse.json(campaign);
  } catch (err) {
    return handleApiError('api/campaigns/[id] PUT', err);
  }
}
