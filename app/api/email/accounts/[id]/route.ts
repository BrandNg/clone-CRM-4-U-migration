import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;

  const account = await prisma.emailAccount.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (account.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.emailAccount.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;

  const account = await prisma.emailAccount.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (account.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const signature = body.signature === null ? null : String(body.signature);

    const updated = await prisma.emailAccount.update({
      where: { id },
      data: { signature },
      select: {
        id: true,
        email: true,
        provider: true,
        isActive: true,
        signature: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[email-accounts-patch] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
