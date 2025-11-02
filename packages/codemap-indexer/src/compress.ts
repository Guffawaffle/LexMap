import { init as initZstd, compress, decompress } from '@zstd/wasm';
import { stableStringify } from './hash.js';

let zstdReady = false;

export async function initCompress(): Promise<void> {
  if (!zstdReady) {
    await initZstd();
    zstdReady = true;
  }
}

export async function toB64(obj: any): Promise<string> {
  await initCompress();

  const json = stableStringify(obj);
  const compressed = compress(Buffer.from(json, 'utf8'), 10);

  return Buffer.from(compressed).toString('base64');
}

export async function fromB64(b64: string): Promise<any> {
  await initCompress();

  const compressed = Buffer.from(b64, 'base64');
  const decompressed = decompress(compressed);
  const json = Buffer.from(decompressed).toString('utf8');

  return JSON.parse(json);
}
