import { NextResponse } from 'next/server';
import { z } from 'zod';

export type ParseResult<T> = { data: T; error?: never } | { data?: never; error: NextResponse };

/**
 * Parse and validate a JSON request body. Returns `{ data }` on success or
 * `{ error }` holding a ready-to-return 400 response with field-level issues.
 *
 * Usage:
 *   const parsed = await parseBody(req, createLeadSchema);
 *   if (parsed.error) return parsed.error;
 *   const body = parsed.data;
 */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  errorMessage = 'Validation failed'
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return {
      error: NextResponse.json(
        {
          error: errorMessage,
          details,
          issues: details,
        },
        { status: 400 }
      ),
    };
  }
  return { data: result.data };
}

/** Parse a `?limit=` query param with a default and hard cap (DoS guard). */
export function capLimit(raw: string | null, fallback = 50, max = 200): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// Shared atoms
export const id = z.string().min(1).max(64);
export const isoDate = z.coerce.date();
const emptyStringToNull = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const shortText = z.string().trim().max(500);
export const longText = z.string().trim().max(20_000);
export const nullableShortText = z.preprocess(emptyStringToNull, z.string().max(500).nullish());
export const nullableLongText = z.preprocess(emptyStringToNull, z.string().max(20_000).nullish());
export const nullableText = (max: number) =>
  z.preprocess(emptyStringToNull, z.string().max(max).nullish());
