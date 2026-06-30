import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

export type ApiIssue = { path?: string; message: string };

export function apiError(error: string, status: number, details?: ApiIssue[]): NextResponse {
  return NextResponse.json(
    {
      error,
      ...(details && details.length > 0 ? { details } : {}),
    },
    { status }
  );
}

export function badRequest(error: string, details?: ApiIssue[]): NextResponse {
  return apiError(error, 400, details);
}

export function unauthorized(error = 'Unauthorized'): NextResponse {
  return apiError(error, 401);
}

export function forbidden(error = 'Forbidden'): NextResponse {
  return apiError(error, 403);
}

export function notFound(error = 'Not found'): NextResponse {
  return apiError(error, 404);
}

export function duplicate(error: string): NextResponse {
  return apiError(error, 409);
}

/**
 * Standard API error response: log the full error server-side, return a
 * generic message to the client (provider/DB errors can leak account details).
 */
export function handleApiError(context: string, err: unknown): NextResponse {
  console.error(`[${context}]`, err);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return duplicate('Duplicate record');
    if (err.code === 'P2025') return notFound('Record not found');
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
