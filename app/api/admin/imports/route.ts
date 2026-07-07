import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userOrRes = await requireRole('floor_manager');
  if (userOrRes instanceof NextResponse) return userOrRes;

  try {
    const importBatches = await prisma.importBatch.findMany({
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(importBatches);
  } catch (err: any) {
    console.error('[admin/imports GET] Error fetching import batches:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
