import { request } from 'undici';
import { FrameMeta } from './types.js';
import { encryptB64 } from './crypto.js';

export interface LexBrainConfig {
  url: string;
  mode: 'local' | 'zk';
  keyHex?: string;
}

export interface PutFactResponse {
  inserted: boolean;
  frame_id: string;
}

export interface GetFactsQuery {
  kind?: string;
  scope?: any;
  limit?: number;
}

let config: LexBrainConfig;

export function initLexBrain(cfg: LexBrainConfig): void {
  config = cfg;

  if (cfg.mode === 'zk' && !cfg.keyHex) {
    throw new Error('ZK mode requires keyHex');
  }

  if (cfg.mode === 'zk' && cfg.keyHex && cfg.keyHex.length !== 64) {
    throw new Error('keyHex must be 64 hex characters (32 bytes)');
  }
}

export async function putFact(frame: FrameMeta): Promise<PutFactResponse> {
  let payload = frame.payload_b64;

  // Encrypt if in ZK mode
  if (config.mode === 'zk' && config.keyHex) {
    const aad = `${frame.kind}|${frame.frame_id}`;
    const encrypted = encryptB64(config.keyHex, payload, aad);
    payload = JSON.stringify(encrypted);
  }

  const body = {
    ...frame,
    payload_b64: payload
  };

  const response = await request(`${config.url}/facts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (response.statusCode !== 200 && response.statusCode !== 201) {
    const text = await response.body.text();
    throw new Error(`LexBrain PUT failed: ${response.statusCode} ${text}`);
  }

  return await response.body.json() as PutFactResponse;
}

export async function getFacts(query: GetFactsQuery): Promise<FrameMeta[]> {
  const params = new URLSearchParams();

  if (query.kind) params.set('kind', query.kind);
  if (query.scope) params.set('scope', JSON.stringify(query.scope));
  if (query.limit) params.set('limit', String(query.limit));

  const url = `${config.url}/facts?${params.toString()}`;

  const response = await request(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (response.statusCode !== 200) {
    const text = await response.body.text();
    throw new Error(`LexBrain GET failed: ${response.statusCode} ${text}`);
  }

  const result = await response.body.json() as any;
  return result.facts || [];
}
