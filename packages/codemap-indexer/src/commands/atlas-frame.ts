import kleur from 'kleur';
import { initLexBrain, getFacts } from '../lexbrain.js';
import { fromB64 } from '../compress.js';
import { initCompress } from '../compress.js';
import { loadPolicy } from '../policy.js';
import { Policy } from '../types.js';

interface AtlasFrameOptions {
  moduleScope: string;
  foldRadius: string;
  policyPath: string;
  lexbrain: string;
  mode: string;
  keyHex?: string;
}

interface AtlasModule {
  id: string;
  coords?: [number, number];
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
}

interface AtlasFrameData {
  atlas_timestamp: string;
  seed_modules: string[];
  fold_radius: number;
  modules: AtlasModule[];
  critical_rule: string;
}

const GRID_WIDTH = 10;

export async function atlasFrameCommand(options: AtlasFrameOptions): Promise<void> {
  console.log(kleur.cyan('🗺️  LexMap Atlas Frame'));

  try {
    await initCompress();

    initLexBrain({
      url: options.lexbrain,
      mode: options.mode as 'local' | 'zk',
      keyHex: options.keyHex
    });

    // Parse module scope
    const seedModules = options.moduleScope.split(',').map(m => m.trim());
    const foldRadius = parseInt(options.foldRadius);

    // Load policy to get module definitions
    const policy = await loadPolicy(options.policyPath);

    // Fetch module dependencies
    const moduleFacts = await getFacts({ kind: 'codemap.modules', limit: 1000 });
    const allModules = await decompressFacts(moduleFacts);

    // Build neighborhood with fold radius
    const neighborhood = buildModuleNeighborhood(seedModules, allModules, foldRadius);

    // Create atlas frame data
    const atlasFrame: AtlasFrameData = {
      atlas_timestamp: new Date().toISOString(),
      seed_modules: seedModules,
      fold_radius: foldRadius,
      modules: neighborhood.map((moduleId, index) => createAtlasModule(moduleId, index, policy)),
      critical_rule: "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming."
    };

    console.log(JSON.stringify(atlasFrame, null, 2));

  } catch (error) {
    console.error(kleur.red('Error:'), error);
    process.exit(1);
  }
}

function buildModuleNeighborhood(
  seedModules: string[],
  moduleDeps: any[],
  radius: number
): string[] {
  const moduleSet = new Set<string>(seedModules);
  const queue: Array<{ id: string; dist: number }> = seedModules.map(id => ({ id, dist: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;

    if (visited.has(id) || dist > radius) continue;
    visited.add(id);
    moduleSet.add(id);

    // Find connected modules
    const connected = moduleDeps.filter(m => m.from === id || m.to === id);

    for (const dep of connected) {
      const nextId = dep.from === id ? dep.to : dep.from;
      if (!visited.has(nextId)) {
        queue.push({ id: nextId, dist: dist + 1 });
      }
    }
  }

  return Array.from(moduleSet);
}

function createAtlasModule(moduleId: string, index: number, policy: Policy): AtlasModule {
  // Generate simple grid coordinates based on index
  const coords: [number, number] = [index % GRID_WIDTH, Math.floor(index / GRID_WIDTH)];

  const module: AtlasModule = {
    id: moduleId,
    coords
  };

  // Extract policy rules for this module if available
  if (policy?.modules?.allowed_deps) {
    const allowedCallers = policy.modules.allowed_deps
      .filter((dep: any) => dep.to === moduleId)
      .map((dep: any) => dep.from);
    
    if (allowedCallers.length > 0) {
      module.allowed_callers = allowedCallers;
    }
  }

  // Check for kill patterns that might affect this module
  if (policy?.kill_patterns) {
    const relevantKillPatterns = policy.kill_patterns
      .filter((kp: any) => kp.kind && kp.match)
      .map((kp: any) => kp.kind);
    
    if (relevantKillPatterns.length > 0) {
      module.kill_patterns = relevantKillPatterns;
    }
  }

  return module;
}

async function decompressFacts(facts: any[]): Promise<any[]> {
  const result: any[] = [];

  for (const fact of facts) {
    const data = await fromB64(fact.payload_b64);
    if (data.items) {
      result.push(...data.items);
    } else if (Array.isArray(data)) {
      result.push(...data);
    } else {
      result.push(data);
    }
  }

  return result;
}
