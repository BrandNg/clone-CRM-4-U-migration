import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { markNotificationSchema } from '@/lib/validation/schemas';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const unreadOnly = new URL(req.url).searchParams.get('unreadOnly') === 'true';

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Derive unread count from fetched rows — avoids a second round-trip to Neon
  const unreadCount = unreadOnly
    ? notifications.length
    : notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({ notifications, unreadCount });
}

export async function PUT(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, markNotificationSchema, 'Invalid notification update');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  if (body.id) {
    // Mark a single notification as read — ownership enforced
    const updated = await prisma.notification.updateMany({
      where: { id: body.id, userId: user.id },
      data: { isRead: true },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } else {
    // Mark all as read
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ success: true });
}
