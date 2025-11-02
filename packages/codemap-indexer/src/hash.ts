import crypto from 'crypto';

/**
 * Stable JSON stringification for deterministic hashing
 */
export function stableStringify(obj: any): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj !== 'object') return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }

  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

export function sha256(input: string | Buffer | object): string {
  const data = typeof input === 'object' && !(input instanceof Buffer)
    ? stableStringify(input)
    : input;

  return crypto.createHash('sha256').update(data).digest('hex');
}

export function sha256Buffer(input: string | Buffer | object): Buffer {
  const data = typeof input === 'object' && !(input instanceof Buffer)
    ? stableStringify(input)
    : input;

  return crypto.createHash('sha256').update(data).digest();
}
