import crypto from 'crypto';
import { requireEnv } from '@rtb-ai-hub/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const _AUTH_TAG_LENGTH = 16;

let encryptionKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (!encryptionKey) {
    const keyHex = requireEnv('CREDENTIAL_ENCRYPTION_KEY');
    encryptionKey = Buffer.from(keyHex, 'hex');

    if (encryptionKey.length !== 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
  }

  return encryptionKey;
}

interface EncryptedData {
  iv: string;
  encrypted: string;
  authTag: string;
}

export function encryptApiKey(apiKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);

  const authTag = cipher.getAuthTag();

  const data: EncryptedData = {
    iv: iv.toString('hex'),
    encrypted: encrypted.toString('hex'),
    authTag: authTag.toString('hex'),
  };

  return JSON.stringify(data);
}

export function decryptApiKey(encryptedData: string): string {
  const key = getEncryptionKey();
  const data: EncryptedData = JSON.parse(encryptedData);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'));

  decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data.encrypted, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
