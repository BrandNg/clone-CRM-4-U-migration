import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { createCampaignSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';
import { cacheGet, cacheSet, listKey, invalidateList } from '@/lib/cache';

const CACHE_TTL = 60;

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const user = userOrRes as SessionUser;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const cacheKey = listKey(user.tenantId, 'campaigns', type === 'clients' ? 'clients' : 'list');

  const cached = await cacheGet<any>(cacheKey);
  if (cached) return NextResponse.json(cached, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
  });

  try {
    let data: any;
    if (type === 'clients') {
      data = await prisma.client.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, industry: true },
      });
      data = { clients: data };
    } else {
      data = await prisma.campaign.findMany({
        include: { client: true },
        orderBy: { startDate: 'desc' },
      });
    }

    await cacheSet(cacheKey, data, CACHE_TTL);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    });
  } catch (err) {
    return handleApiError('api/campaigns GET', err);
  }
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireRole('floor_manager');
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createCampaignSchema, 'Invalid campaign create');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  let clientId = body.clientId;

  if (!clientId && body.newClientName) {
    const newClient = await prisma.client.create({
      data: {
        name: body.newClientName,
        industry: body.targetVertical || '',
        contactName: user.firstName + ' ' + user.lastName,
        contactEmail: user.email,
        status: 'active',
      },
    });
    clientId = newClient.id;
  }

  if (!clientId) {
    return NextResponse.json({ error: 'Client is required' }, { status: 400 });
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: body.name,
        clientId,
        targetVertical: body.targetVertical ?? null,
        targetGeo: body.targetGeo ?? null,
        status: body.status ?? 'active',
        startDate: body.startDate ?? new Date(),
        endDate: null,
      },
    });

    await invalidateList(user.tenantId, 'campaigns');
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return handleApiError('api/campaigns POST', err);
  }
}
