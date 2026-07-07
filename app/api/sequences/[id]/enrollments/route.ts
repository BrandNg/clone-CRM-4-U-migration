import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const stepFilter = searchParams.get('step');
  const statusFilter = searchParams.get('status');

  try {
    const enrollments = await prisma.sequenceEnrollment.findMany({
      where: {
        sequenceId: id,
        tenantId: user.tenantId,
        ...(stepFilter ? { currentStep: parseInt(stepFilter) } : {}),
        ...(statusFilter ? { status: statusFilter as any } : { status: { not: 'unenrolled' } }),
      },
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            tasks: {
              where: { sequenceId: id, status: 'pending' },
              select: { id: true, dueDate: true, type: true }
            }
          }
        }
      },
      orderBy: { startedAt: 'desc' },
    });

    return NextResponse.json(enrollments);
  } catch (err) {
    console.error('Fetch enrollments error:', err);
    return NextResponse.json({ error: 'Failed to fetch enrollments' }, { status: 500 });
  }
}
