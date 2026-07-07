import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userOrRes = await requireRole('floor_manager');
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  try {
    const outboundMessages = await prisma.outboundMessage.findMany({
      where: {
        ...(status && { status }),
      },
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
          },
        },
        account: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(outboundMessages);
  } catch (err: any) {
    console.error('[admin/outbound GET] Error fetching outbound messages:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
