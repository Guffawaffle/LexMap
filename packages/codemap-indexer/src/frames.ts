import { ThoughtKindCodemap, Scope, FrameMeta } from './types.js';
import { sha256, stableStringify } from './hash.js';
import { toB64 } from './compress.js';

const MAX_PAYLOAD_KB = 200;
const MAX_PAYLOAD_BYTES = MAX_PAYLOAD_KB * 1024;

interface ChunkResult {
  frames: FrameMeta[];
  totalSize: number;
}

/**
 * Build frame metadata and chunk if needed
 */
export async function buildFrames(
  kind: ThoughtKindCodemap,
  scope: Scope,
  inputsHash: string,
  data: any,
  stats?: Record<string, number>
): Promise<FrameMeta[]> {
  const payloadB64 = await toB64(data);
  const payloadSize = Buffer.from(payloadB64, 'base64').length;

  // If payload fits in one frame, return it
  if (payloadSize <= MAX_PAYLOAD_BYTES) {
    const blobHash = sha256(payloadB64);
    const frameId = computeFrameId(kind, scope, inputsHash, blobHash);

    return [{
      frame_id: frameId,
      kind,
      scope,
      inputs_hash: inputsHash,
      payload_b64: payloadB64,
      ts: new Date().toISOString(),
      stats
    }];
  }

  // Need to chunk the data
  return chunkData(kind, scope, inputsHash, data, stats);
}

/**
 * Chunk large data into multiple frames
 */
async function chunkData(
  kind: ThoughtKindCodemap,
  scope: Scope,
  inputsHash: string,
  data: any,
  stats?: Record<string, number>
): Promise<FrameMeta[]> {
  const frames: FrameMeta[] = [];

  // For arrays, split into chunks
  if (Array.isArray(data)) {
    const chunks = splitArray(data);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = { items: chunks[i] };
      const payloadB64 = await toB64(chunk);
      const blobHash = sha256(payloadB64);
      const frameId = computeFrameId(kind, scope, inputsHash, blobHash, i);

      frames.push({
        frame_id: frameId,
        kind,
        scope,
        inputs_hash: inputsHash,
        payload_b64: payloadB64,
        part: i + 1,
        total_parts: chunks.length,
        ts: new Date().toISOString(),
        stats: i === 0 ? stats : undefined
      });
    }
  } else {
    // For objects, try to split by keys
    const keys = Object.keys(data);
    const chunks: any[] = [];
    let current: any = {};
    let currentSize = 0;

    for (const key of keys) {
      const item = { [key]: data[key] };
      const itemSize = JSON.stringify(item).length;

      if (currentSize + itemSize > MAX_PAYLOAD_BYTES && Object.keys(current).length > 0) {
        chunks.push(current);
        current = {};
        currentSize = 0;
      }

      current[key] = data[key];
      currentSize += itemSize;
    }

    if (Object.keys(current).length > 0) {
      chunks.push(current);
    }

    for (let i = 0; i < chunks.length; i++) {
      const payloadB64 = await toB64(chunks[i]);
      const blobHash = sha256(payloadB64);
      const frameId = computeFrameId(kind, scope, inputsHash, blobHash, i);

      frames.push({
        frame_id: frameId,
        kind,
        scope,
        inputs_hash: inputsHash,
        payload_b64: payloadB64,
        part: i + 1,
        total_parts: chunks.length,
        ts: new Date().toISOString(),
        stats: i === 0 ? stats : undefined
      });
    }
  }

  return frames;
}

/**
 * Split array into chunks that fit within size limit
 */
function splitArray(arr: any[]): any[][] {
  const chunks: any[][] = [];
  let current: any[] = [];
  let currentSize = 0;

  for (const item of arr) {
    const itemSize = JSON.stringify(item).length;

    if (currentSize + itemSize > MAX_PAYLOAD_BYTES && current.length > 0) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(item);
    currentSize += itemSize;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Compute deterministic frame ID
 */
export function computeFrameId(
  kind: ThoughtKindCodemap,
  scope: Scope,
  inputsHash: string,
  blobHash: string,
  part?: number
): string {
  const parts = [
    kind,
    stableStringify(scope),
    inputsHash,
    blobHash
  ];

  if (part !== undefined) {
    parts.push(String(part));
  }

  return sha256(parts.join('|'));
}
