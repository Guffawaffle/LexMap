import crypto from 'crypto';

export interface EncryptedPayload {
  ivB64: string;
  ctB64: string;
}

/**
 * Encrypt base64-encoded payload using AES-256-GCM
 */
export function encryptB64(keyHex: string, payloadB64: string, aad?: string): EncryptedPayload {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  let encrypted = cipher.update(payloadB64, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([encrypted, authTag]);

  return {
    ivB64: iv.toString('base64'),
    ctB64: ciphertext.toString('base64')
  };
}

/**
 * Decrypt base64-encoded ciphertext using AES-256-GCM
 */
export function decryptB64(keyHex: string, ivB64: string, ctB64: string, aad?: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  // Last 16 bytes are the auth tag
  const authTag = ciphertext.slice(-16);
  const encrypted = ciphertext.slice(0, -16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}
