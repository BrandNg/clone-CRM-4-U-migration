import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

const MAX_MEMORIES = 25;

export async function GET() {
  try {
    const userOrRes = await requireAuth();
    if (userOrRes instanceof NextResponse) return userOrRes;
    const user = userOrRes as SessionUser;

    const memories = await prisma.aiMemory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_MEMORIES,
    });

    return NextResponse.json(memories.map((m) => m.memory), {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai/memory GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userOrRes = await requireAuth();
    if (userOrRes instanceof NextResponse) return userOrRes;
    const user = userOrRes as SessionUser;

    const { memory } = await req.json();
    if (!memory || typeof memory !== 'string' || memory.trim().length === 0) {
      return NextResponse.json({ error: 'memory is required' }, { status: 400 });
    }

    const trimmed = memory.trim().slice(0, 500);

    const count = await prisma.aiMemory.count({ where: { userId: user.id } });
    if (count >= MAX_MEMORIES) {
      const oldest = await prisma.aiMemory.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      });
      if (oldest) await prisma.aiMemory.delete({ where: { id: oldest.id } });
    }

    const saved = await prisma.aiMemory.create({
      data: { userId: user.id, memory: trimmed },
    });

    return NextResponse.json({ id: saved.id, memory: saved.memory });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai/memory POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const userOrRes = await requireAuth();
    if (userOrRes instanceof NextResponse) return userOrRes;
    const user = userOrRes as SessionUser;

    await prisma.aiMemory.deleteMany({ where: { userId: user.id } });

    return NextResponse.json({ cleared: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai/memory DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
