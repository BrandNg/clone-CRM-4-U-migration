import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireRole('floor_manager');
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { id } = await params;

  try {
    const importBatch = await prisma.importBatch.findUnique({
      where: { id },
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
        importRows: {
          orderBy: {
            rowIndex: 'asc',
          },
        },
      },
    });

    if (!importBatch) {
      return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
    }

    return NextResponse.json(importBatch);
  } catch (err: any) {
    console.error('[admin/imports/[id] GET] Error fetching import batch details:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
