import { NextRequest, NextResponse } from 'next/server';
import { prisma, tenantStorage } from '@/lib/prisma';
import { auth } from '@/auth';

const MANAGER_ROLES = ['director', 'floor_manager', 'team_lead'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const isManager = session?.user && MANAGER_ROLES.includes((session.user as any)?.role ?? '');
  
  if (!isManager) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  
  try {
    const body = await req.json();
    const dailyCap = Number(body.dailyCap);
    
    if (isNaN(dailyCap) || dailyCap < 1) {
      return NextResponse.json({ error: 'Invalid daily cap' }, { status: 400 });
    }

    const account = await prisma.emailAccount.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await tenantStorage.run({ tenantId: account.tenantId }, async () => {
      await prisma.emailAccount.update({
        where: { id },
        data: { dailyCap },
      });
    });

    return NextResponse.json({ success: true, dailyCap });
  } catch (error) {
    console.error('[automation-account-cap] Failed to update cap:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
