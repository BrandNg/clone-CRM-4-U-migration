import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// `@aws-sdk/client-kms` is an OPTIONAL, server-only dependency that is only loaded
// when KMS_KEY_ARN is set (production AWS deployments). It is not installed in the
// default/local setup. Holding the specifier in a variable keeps the bundler from
// statically resolving it (which would emit a spurious "module not found" warning
// on every request); it is required lazily at runtime inside a try/catch instead.
const KMS_MODULE = '@aws-sdk/client-kms';

async function loadKms(): Promise<any> {
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ KMS_MODULE);
}

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY env var must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/** Encrypt a plaintext string. Returns a base64 string: iv + authTag + ciphertext (local) or kms:payload. */
export async function encrypt(plaintext: string): Promise<string> {
  const kmsKeyArn = process.env.KMS_KEY_ARN;

  if (kmsKeyArn) {
    try {
      const { KMSClient, GenerateDataKeyCommand } = await loadKms();
      const kms = new KMSClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const kmsResponse = await kms.send(
        new GenerateDataKeyCommand({
          KeyId: kmsKeyArn,
          KeySpec: 'AES_256',
        })
      );

      const rawDEK = kmsResponse.Plaintext!;
      const encryptedDEK = kmsResponse.CiphertextBlob!;

      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, rawDEK, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      const payload = {
        dek: Buffer.from(encryptedDEK).toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ciphertext: encrypted.toString('base64'),
      };

      return 'kms:' + Buffer.from(JSON.stringify(payload)).toString('base64');
    } catch (err) {
      console.error('[crypto] AWS KMS encryption failed, falling back to local encryption:', err);
    }
  }

  // Fallback / Local encryption
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** Decrypt a base64 string produced by encrypt(). Returns plaintext. */
export async function decrypt(encoded: string): Promise<string> {
  if (encoded.startsWith('kms:')) {
    try {
      const rawPayload = Buffer.from(encoded.substring(4), 'base64').toString('utf8');
      const payload = JSON.parse(rawPayload);

      const { KMSClient, DecryptCommand } = await loadKms();
      const kms = new KMSClient({ region: process.env.AWS_REGION || 'us-east-1' });

      const kmsResponse = await kms.send(
        new DecryptCommand({
          CiphertextBlob: Buffer.from(payload.dek, 'base64'),
        })
      );

      const rawDEK = kmsResponse.Plaintext!;
      const iv = Buffer.from(payload.iv, 'base64');
      const tag = Buffer.from(payload.tag, 'base64');
      const ciphertext = Buffer.from(payload.ciphertext, 'base64');

      const decipher = createDecipheriv(ALGORITHM, rawDEK, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (err) {
      console.error('[crypto] AWS KMS decryption failed, trying local decryption fallback:', err);
    }
  }

  // Local / Fallback decryption
  const key = getKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

