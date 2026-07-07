import type { EmailAdapter, InboxMessage, SendEmailOptions } from '../EmailService';
import { encrypt } from '@/lib/crypto';

interface OutlookConfig {
  accessToken: string;
  refreshToken: string;
  tokenExpiry?: Date;
  /** EmailAccount.id — used to persist refreshed tokens back to the DB. */
  accountId?: string;
}

const GRAPH_SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

/**
 * Outlook/Exchange adapter using the Microsoft Graph API.
 * Requires MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in env.
 */
export class OutlookAdapter implements EmailAdapter {
  private config: OutlookConfig;

  constructor(config: OutlookConfig) {
    this.config = config;
  }

  private async refreshAccessToken(): Promise<string> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read offline_access',
      }),
    });

    if (!res.ok) {
      throw new Error(`Microsoft token refresh failed: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`Microsoft token refresh returned no access_token: ${data.error_description ?? data.error}`);
    }
    this.config.accessToken = data.access_token;
    if (data.refresh_token) {
      this.config.refreshToken = data.refresh_token;
    }
    if (this.config.accountId) {
      const { prisma } = await import('@/lib/prisma');
      const [encAccessToken, encRefreshToken] = await Promise.all([
        encrypt(data.access_token),
        data.refresh_token ? encrypt(data.refresh_token) : Promise.resolve(undefined),
      ]);
      await prisma.emailAccount.update({
        where: { id: this.config.accountId },
        data: {
          accessToken: data.access_token,
          encAccessToken,
          refreshToken: data.refresh_token ?? undefined,
          encRefreshToken,
          tokenExpiry: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        },
      });
    }
    return data.access_token;
  }

  async send(options: SendEmailOptions): Promise<string | undefined> {
    let token = this.config.accessToken;

    const payload: any = {
      message: {
        subject: options.subject,
        body: {
          contentType: options.html ? 'HTML' : 'Text',
          content: options.html ?? options.text ?? '',
        },
        toRecipients: [{ emailAddress: { address: options.to } }],
        ...(options.replyTo ? { replyTo: [{ emailAddress: { address: options.replyTo } }] } : {}),
      },
    };

    let res = await fetch(GRAPH_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Token expired — refresh and retry once
    if (res.status === 401) {
      token = await this.refreshAccessToken();
      res = await fetch(GRAPH_SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Microsoft Graph API error: ${err.error?.message ?? res.statusText}`);
    }
    // Graph sendMail returns 202 Accepted with no body — no message ID available for reconciliation.
    return undefined;
  }

  /**
   * Fetch inbox messages received since `since` (metadata only).
   * Requires the Mail.Read scope — accounts connected before that scope was
   * added must be reconnected from Settings.
   */
  async fetchMessagesSince(since: Date): Promise<InboxMessage[]> {
    const url =
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages' +
      `?$filter=receivedDateTime ge ${since.toISOString()}` +
      '&$select=from,subject,receivedDateTime&$orderby=receivedDateTime desc&$top=50';

    let token = this.config.accessToken;
    let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      token = await this.refreshAccessToken();
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Microsoft Graph inbox fetch failed: ${(err as any).error?.message ?? res.statusText}`);
    }

    const data = await res.json();
    return ((data.value ?? []) as any[]).map((m) => ({
      providerMessageId: m.id,
      fromEmail: (m.from?.emailAddress?.address ?? '').toLowerCase(),
      subject: m.subject ?? '',
      date: new Date(m.receivedDateTime),
      failedRecipient: null,
    }));
  }
}

/** Build the Microsoft OAuth authorization URL. */
export function getMicrosoftAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
    scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access',
    response_mode: 'query',
    ...(state ? { state } : {}),
  });

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

/** Exchange an authorization code for Microsoft tokens. */
export async function exchangeMicrosoftCode(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed: ${res.statusText}`);
  }

  const tokens = await res.json();
  if (!tokens.access_token) {
    throw new Error(`Microsoft token exchange returned no access_token: ${tokens.error_description ?? tokens.error}`);
  }

  // Get the user's email via Graph
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error(`Microsoft Graph profile fetch failed: ${profileRes.statusText}`);
  }
  const profile = await profileRes.json();

  return {
    email: (profile.mail ?? profile.userPrincipalName) as string,
    accessToken: tokens.access_token as string,
    refreshToken: tokens.refresh_token as string,
    tokenExpiry: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
  };
}
