export type ThoughtKindCodemap =
  | 'codemap.symbols'
  | 'codemap.calls'
  | 'codemap.modules'
  | 'codemap.patterns'
  | 'codemap.slice'
  | 'codemap.plan'
  | 'codemap.metrics';

export interface Scope {
  repo: string;
  commit: string;
  path?: string;
  symbol?: string;
}

export interface FrameMeta {
  frame_id: string;
  kind: ThoughtKindCodemap;
  scope: Scope;
  inputs_hash: string;
  payload_b64: string;
  part?: number;
  total_parts?: number;
  ts: string;
  ttl_seconds?: number;
  stats?: Record<string, number>;
}

export interface Symbol {
  id: string;
  fqname: string;
  kind: string;
  file: string;
  span: { start: number; end: number };
  visibility?: string;
  modifiers?: string[];
}

export interface Call {
  from: string;
  to: string;
  site: { file: string; line: number; col: number };
  kind: 'direct' | 'heuristic';
  confidence?: number;
}

export interface Module {
  from: string;
  to: string;
  weight: number;
}

export interface CodeGraph {
  symbols: Symbol[];
  calls: Call[];
  modules: Module[];
}

export interface IndexConfig {
  performance: {
    cold: { max_wall_ms: number; max_mem_mb: number };
    incremental: { max_wall_ms: number; max_changed_files: number };
  };
  concurrency: {
    php_workers: number;
    ts_workers: number;
  };
  frames: {
    max_payload_kb: number;
  };
  determinism_target: number;
  heuristics: 'off' | 'hard' | 'auto';
}

export interface Policy {
  modules?: {
    patterns?: Array<{ name: string; match: string }>;
    allowed_deps?: Array<{ from: string; to: string }>;
  };
  kill_patterns?: Array<{ kind: string; match: string }>;
  heuristics?: {
    enable: boolean;
    di_patterns?: Array<{
      kind: string;
      match?: string;
      class?: string;
      method?: string;
    }>;
    confidence?: { hard: number; soft: number };
  };
  determinism_target?: number;
}

export interface PlanJSON {
  shards: Array<{
    name: string;
    files: string[];
    worker_count: number;
  }>;
  budgets: {
    max_wall_ms: number;
    max_mem_mb: number;
  };
  heuristics_ladder: string[];
  ts: string;
}

export interface MetricsData {
  det_ratio: number;
  edges_static: number;
  edges_total: number;
  frames_written: number;
  wall_ms: number;
  peak_ram_mb: number;
  put_p95_ms: number;
}

export interface FileInfo {
  path: string;
  blobSha: string;
}

export interface GitInfo {
  head: string;
  files: FileInfo[];
}
