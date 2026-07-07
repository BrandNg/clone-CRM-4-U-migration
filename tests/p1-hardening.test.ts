import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '@/lib/crypto';

describe('P1.9 Token Encryption — encrypt/decrypt round-trip', () => {
  it('encrypts and decrypts an access token', async () => {
    const token = 'ya29.a0AfH6SMDummyToken123456789';
    const encrypted = await encrypt(token);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(token);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(token);
  });

  it('encrypts and decrypts a refresh token', async () => {
    const token = '1//0gDummyRefreshToken987654321';
    const encrypted = await encrypt(token);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(token);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(token);
  });

  it('produces different ciphertexts for the same plaintext (IV uniqueness)', async () => {
    const token = 'ya29-same-token-every-time';
    const [a, b] = await Promise.all([encrypt(token), encrypt(token)]);
    expect(a).not.toBe(b);
  });

  it('handles empty string', async () => {
    const encrypted = await encrypt('');
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe('');
  });
});
