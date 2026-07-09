import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id: templateId } = await params;

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { tenantId: true },
  });

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (template.tenantId !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const attachments = await prisma.attachment.findMany({
    where: { templateId },
    select: {
      id: true,
      name: true,
      contentType: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(attachments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id: templateId } = await params;

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { tenantId: true },
  });

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (template.tenantId !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const name = file.name;
    const contentType = file.type || 'application/octet-stream';
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Check file size (limit to 5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
    }

    const content = buffer.toString('base64');

    const attachment = await prisma.attachment.create({
      data: {
        name,
        contentType,
        content,
        templateId,
        tenantId: user.tenantId!,
      },
      select: {
        id: true,
        name: true,
        contentType: true,
        createdAt: true,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error('[template-attachments-post] Error:', error);
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
  }
}
