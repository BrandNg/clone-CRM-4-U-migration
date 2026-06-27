import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function GET(_req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  // Retrieve Asterisk/FreePBX configuration from environment variables.
  // In a production BPO environment, this would query extension details 
  // from the database for the specific user (e.g. user.sipExtension, user.sipPassword).
  const websocketUrl = process.env.SIP_WEBSOCKET_URL || 'wss://pbx.telestar.vn:8089/ws';
  const domain = process.env.SIP_DOMAIN || 'pbx.telestar.vn';
  const username = process.env.SIP_DEFAULT_USERNAME || '101';
  const password = process.env.SIP_DEFAULT_PASSWORD || 'telestarPass123';

  return NextResponse.json({
    websocketUrl,
    domain,
    username,
    password,
    identity: user.id
  });
}
