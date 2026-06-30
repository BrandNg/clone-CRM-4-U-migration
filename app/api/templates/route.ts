import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { createTemplateSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';
import { cacheGet, cacheSet, listKey, invalidateList } from '@/lib/cache';

const CACHE_TTL = 60;

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const user = userOrRes as SessionUser;
  try {
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel');
    const search = searchParams.get('search') || '';
    const cacheKey = listKey(user.tenantId, 'templates', `${channel ?? ''}:${search}`);

    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const templates = await prisma.template.findMany({
      where: {
        ...(channel ? { channel: channel as any } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { body: { contains: search, mode: 'insensitive' } },
                { subject: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    await cacheSet(cacheKey, templates, CACHE_TTL);
    return NextResponse.json(templates);
  } catch (err) {
    return handleApiError('api/templates GET', err);
  }
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createTemplateSchema, 'Invalid template create');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  try {
    const template = await prisma.template.create({
      data: {
        name: body.name,
        channel: body.channel,
        subject: body.subject ?? null,
        body: body.body,
        category: body.category,
        createdById: user.id,
      },
    });

    await invalidateList(user.tenantId, 'templates');
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    return handleApiError('api/templates POST', err);
  }
}
