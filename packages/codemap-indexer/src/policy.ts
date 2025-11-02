import { readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { Policy } from './types.js';

const DEFAULT_POLICY: Policy = {
  modules: {
    patterns: [],
    allowed_deps: []
  },
  kill_patterns: [],
  heuristics: {
    enable: true,
    di_patterns: [],
    confidence: { hard: 0.95, soft: 0.6 }
  },
  determinism_target: 0.95
};

export async function loadPolicy(path: string): Promise<Policy> {
  try {
    await access(path, constants.F_OK);
    const content = await readFile(path, 'utf8');
    const policy = JSON.parse(content);

    // Merge with defaults
    return {
      ...DEFAULT_POLICY,
      ...policy,
      heuristics: {
        ...DEFAULT_POLICY.heuristics,
        ...policy.heuristics
      }
    };
  } catch {
    // Policy file doesn't exist, use defaults
    return DEFAULT_POLICY;
  }
}
