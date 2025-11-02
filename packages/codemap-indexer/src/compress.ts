import {
  decompress as fzstdDecompress,
} from "fzstd";
import { stableStringify } from "./hash.js";
import { gzipSync } from "zlib";

export async function initCompress(): Promise<void> {
  // fzstd doesn't require initialization
}

export async function toB64(obj: any): Promise<string> {
  const json = stableStringify(obj);
  // Use gzip compression instead of zstd for now since fzstd doesn't export compress
  const compressed = gzipSync(Buffer.from(json, "utf8"));

  return Buffer.from(compressed).toString("base64");
}

export async function fromB64(b64: string): Promise<any> {
  const compressed = Buffer.from(b64, "base64");
  const decompressed = fzstdDecompress(compressed);
  const json = Buffer.from(decompressed).toString("utf8");

  return JSON.parse(json);
}
