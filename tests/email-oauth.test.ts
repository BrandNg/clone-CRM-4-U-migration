import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SessionUser } from '@/lib/auth';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getGoogleAuthUrl: vi.fn((state?: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
  exchangeGoogleCode: vi.fn(),
  getMicrosoftAuthUrl: vi.fn((state?: string) => `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=${state}`),
  exchangeMicrosoftCode: vi.fn(),
  encrypt: vi.fn(async (value: string) => `enc:${value}`),
  emailAccountFindFirst: vi.fn(),
  emailAccountCreate: vi.fn(),
  emailAccountUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: any[]) => mocks.requireAuth(...args),
}));

vi.mock('@/lib/email/adapters/GmailAdapter', () => ({
  getGoogleAuthUrl: (...args: any[]) => mocks.getGoogleAuthUrl(...args),
  exchangeGoogleCode: (...args: any[]) => mocks.exchangeGoogleCode(...args),
}));

vi.mock('@/lib/email/adapters/OutlookAdapter', () => ({
  getMicrosoftAuthUrl: (...args: any[]) => mocks.getMicrosoftAuthUrl(...args),
  exchangeMicrosoftCode: (...args: any[]) => mocks.exchangeMicrosoftCode(...args),
}));

vi.mock('@/lib/crypto', () => ({
  encrypt: (...args: [string]) => mocks.encrypt(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    emailAccount: {
      findFirst: (...args: any[]) => mocks.emailAccountFindFirst(...args),
      create: (...args: any[]) => mocks.emailAccountCreate(...args),
      update: (...args: any[]) => mocks.emailAccountUpdate(...args),
    },
    auditLog: {
      create: (...args: any[]) => mocks.auditLogCreate(...args),
    },
  },
}));

const { GET: getProviders } = await import('@/app/api/email/providers/route');
const { GET: startGoogleOAuth } = await import('@/app/api/email/oauth/google/route');
const { GET: googleCallback } = await import('@/app/api/email/oauth/google/callback/route');
const { GET: startMicrosoftOAuth } = await import('@/app/api/email/oauth/microsoft/route');
const { GET: microsoftCallback } = await import('@/app/api/email/oauth/microsoft/callback/route');

const user: SessionUser = {
  id: 'user-1',
  email: 'sdr@example.com',
  firstName: 'Sam',
  lastName: 'Sender',
  role: 'sdr',
  tenantId: 'tenant-1',
};

const savedEnv = { ...process.env };

const setOAuthEnv = () => {
  process.env.GOOGLE_CLIENT_ID = 'google-client';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/email/oauth/google/callback';
  process.env.MICROSOFT_CLIENT_ID = 'microsoft-client';
  process.env.MICROSOFT_CLIENT_SECRET = 'microsoft-secret';
  process.env.MICROSOFT_REDIRECT_URI = 'http://localhost:3000/api/email/oauth/microsoft/callback';
};

describe('email OAuth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...savedEnv };
    mocks.requireAuth.mockResolvedValue(user);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('reports configured and missing provider env keys', async () => {
    setOAuthEnv();
    delete process.env.MICROSOFT_CLIENT_SECRET;

    const res = await getProviders();
    const body = await res.json();

    expect(body.gmail).toEqual({ configured: true, missing: [] });
    expect(body.outlook).toEqual({
      configured: false,
      missing: ['MICROSOFT_CLIENT_SECRET'],
    });
  });

  it('redirects to Google OAuth and sets the nonce cookie', async () => {
    setOAuthEnv();

    const res = await startGoogleOAuth(new NextRequest('http://localhost:3000/api/email/oauth/google'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(res.headers.get('set-cookie')).toContain('oauth_nonce_google=');
    expect(mocks.getGoogleAuthUrl).toHaveBeenCalledWith(expect.any(String));
  });

  it('redirects to Microsoft OAuth and sets the nonce cookie', async () => {
    setOAuthEnv();

    const res = await startMicrosoftOAuth(new NextRequest('http://localhost:3000/api/email/oauth/microsoft'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    expect(res.headers.get('set-cookie')).toContain('oauth_nonce_microsoft=');
    expect(mocks.getMicrosoftAuthUrl).toHaveBeenCalledWith(expect.any(String));
  });

  it('rejects callback requests with an invalid state', async () => {
    setOAuthEnv();

    const req = new NextRequest('http://localhost:3000/api/email/oauth/google/callback?code=abc&state=wrong', {
      headers: { cookie: 'oauth_nonce_google=expected' },
    });
    const res = await googleCallback(req);

    expect(res.headers.get('location')).toContain('/settings?error=google_invalid_state');
    expect(mocks.exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it('creates a Gmail account with encrypted OAuth tokens and audit log', async () => {
    setOAuthEnv();
    const tokenExpiry = new Date('2026-07-14T00:00:00.000Z');
    mocks.exchangeGoogleCode.mockResolvedValue({
      email: 'sender@gmail.com',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenExpiry,
    });
    mocks.emailAccountFindFirst.mockResolvedValue(null);
    mocks.emailAccountCreate.mockResolvedValue({ id: 'account-1' });

    const req = new NextRequest('http://localhost:3000/api/email/oauth/google/callback?code=abc&state=nonce', {
      headers: { cookie: 'oauth_nonce_google=nonce' },
    });
    const res = await googleCallback(req);

    expect(res.headers.get('location')).toContain('/settings?success=gmail_connected');
    expect(mocks.emailAccountCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        email: 'sender@gmail.com',
        provider: 'gmail',
        accessToken: null,
        refreshToken: null,
        encAccessToken: 'enc:access-token',
        encRefreshToken: 'enc:refresh-token',
        tokenExpiry,
        isActive: true,
      }),
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: 'connect_email',
        tableName: 'EmailAccount',
        recordId: 'account-1',
        tenantId: 'tenant-1',
      }),
    });
  });

  it('reactivates an existing Outlook account without requiring a new refresh token', async () => {
    setOAuthEnv();
    const tokenExpiry = new Date('2026-07-14T01:00:00.000Z');
    mocks.exchangeMicrosoftCode.mockResolvedValue({
      email: 'sender@outlook.com',
      accessToken: 'new-access-token',
      refreshToken: null,
      tokenExpiry,
    });
    mocks.emailAccountFindFirst.mockResolvedValue({
      id: 'account-2',
      encRefreshToken: 'enc:old-refresh-token',
      refreshToken: null,
    });
    mocks.emailAccountUpdate.mockResolvedValue({ id: 'account-2' });

    const req = new NextRequest('http://localhost:3000/api/email/oauth/microsoft/callback?code=abc&state=nonce', {
      headers: { cookie: 'oauth_nonce_microsoft=nonce' },
    });
    const res = await microsoftCallback(req);

    expect(res.headers.get('location')).toContain('/settings?success=outlook_connected');
    expect(mocks.emailAccountUpdate).toHaveBeenCalledWith({
      where: { id: 'account-2' },
      data: expect.objectContaining({
        accessToken: null,
        encAccessToken: 'enc:new-access-token',
        tokenExpiry,
        isActive: true,
      }),
    });
    expect(mocks.emailAccountUpdate.mock.calls[0][0].data.refreshToken).toBeUndefined();
    expect(mocks.emailAccountUpdate.mock.calls[0][0].data.encRefreshToken).toBeUndefined();
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'reconnect_email',
        recordId: 'account-2',
      }),
    });
  });
});
