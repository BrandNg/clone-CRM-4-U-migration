export type ApiErrorBody = {
  error?: string;
  details?: Array<{ path?: string; message?: string }>;
  issues?: Array<{ path?: string; message?: string }>;
};

export async function readApiError(res: Response, fallback: string): Promise<string> {
  let body: ApiErrorBody | null = null;
  try {
    body = await res.json();
  } catch {
    return fallback;
  }

  const detailItems = body?.details ?? body?.issues ?? [];
  const detailText = detailItems
    .map((item) => [item.path, item.message].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('; ');

  if (body?.error && detailText) return `${body.error}: ${detailText}`;
  if (body?.error) return body.error;
  if (detailText) return detailText;
  return fallback;
}
