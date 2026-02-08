import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encryptApiKey, decryptApiKey, generateEncryptionKey } from '../credential/encryption';

const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

describe('encryption', () => {
  const originalEnv = process.env.CREDENTIAL_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.CREDENTIAL_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    }
  });

  describe('encryptApiKey / decryptApiKey round-trip', () => {
    it('encrypts and decrypts back to original value', () => {
      const apiKey = 'sk-ant-api03-test-key-12345';
      const encrypted = encryptApiKey(apiKey);
      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe(apiKey);
    });

    it('produces different ciphertext for same input (random IV)', () => {
      const apiKey = 'sk-test-key';
      const encrypted1 = encryptApiKey(apiKey);
      const encrypted2 = encryptApiKey(apiKey);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('handles empty string', () => {
      const encrypted = encryptApiKey('');
      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe('');
    });

    it('handles long API keys', () => {
      const longKey = 'sk-' + 'x'.repeat(500);
      const encrypted = encryptApiKey(longKey);
      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe(longKey);
    });

    it('handles special characters', () => {
      const specialKey = 'sk-test/+= key!@#$%^&*()';
      const encrypted = encryptApiKey(specialKey);
      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe(specialKey);
    });

    it('handles unicode characters', () => {
      const unicodeKey = 'sk-테스트-키-🔑';
      const encrypted = encryptApiKey(unicodeKey);
      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe(unicodeKey);
    });
  });

  describe('encrypted data format', () => {
    it('produces valid JSON with iv, encrypted, and authTag fields', () => {
      const encrypted = encryptApiKey('test-key');
      const parsed = JSON.parse(encrypted);
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('encrypted');
      expect(parsed).toHaveProperty('authTag');
      expect(typeof parsed.iv).toBe('string');
      expect(typeof parsed.encrypted).toBe('string');
      expect(typeof parsed.authTag).toBe('string');
    });
  });

  describe('decryption failure cases', () => {
    it('throws on invalid JSON', () => {
      expect(() => decryptApiKey('not-json')).toThrow();
    });

    it('throws on tampered ciphertext', () => {
      const encrypted = encryptApiKey('test-key');
      const parsed = JSON.parse(encrypted);
      parsed.encrypted = 'ff'.repeat(16);
      expect(() => decryptApiKey(JSON.stringify(parsed))).toThrow();
    });

    it('throws on tampered auth tag', () => {
      const encrypted = encryptApiKey('test-key');
      const parsed = JSON.parse(encrypted);
      parsed.authTag = 'ff'.repeat(16);
      expect(() => decryptApiKey(JSON.stringify(parsed))).toThrow();
    });
  });

  describe('generateEncryptionKey', () => {
    it('generates a 64-character hex string', () => {
      const key = generateEncryptionKey();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      expect(key1).not.toBe(key2);
    });
  });
});
