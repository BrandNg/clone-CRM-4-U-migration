import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userOrRes = await requireRole('floor_manager');
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const queueName = searchParams.get('queueName');

  try {
    const jobRuns = await prisma.jobRun.findMany({
      where: {
        ...(status && { status }),
        ...(queueName && { queueName }),
      },
      orderBy: {
        enqueuedAt: 'desc',
      },
    });

    return NextResponse.json(jobRuns);
  } catch (err: any) {
    console.error('[admin/jobs GET] Error fetching job runs:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
