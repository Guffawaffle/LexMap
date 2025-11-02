import { Policy, Module } from './types.js';

/**
 * Represents an adjacency graph built from module dependencies
 */
export interface AdjacencyGraph {
  /** Map of module ID to set of modules it depends on (outgoing edges) */
  outgoing: Map<string, Set<string>>;
  /** Map of module ID to set of modules that depend on it (incoming edges) */
  incoming: Map<string, Set<string>>;
  /** Map of module ID to edge weight */
  weights: Map<string, number>;
}

/**
 * Module with full policy metadata
 */
export interface ModuleWithMetadata {
  id: string;
  coords: [number, number];
  allowed_callers: string[];
  forbidden_callers: string[];
  feature_flags: string[];
  requires_permissions: string[];
  kill_patterns: string[];
}

/**
 * Result of neighborhood extraction
 */
export interface NeighborhoodData {
  seed_modules: string[];
  fold_radius: number;
  modules: ModuleWithMetadata[];
}

/**
 * Build adjacency graph from module dependencies
 */
export function buildAdjacencyGraph(modules: Module[]): AdjacencyGraph {
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const weights = new Map<string, number>();

  for (const module of modules) {
    const { from, to, weight } = module;

    // Initialize sets if they don't exist
    if (!outgoing.has(from)) {
      outgoing.set(from, new Set());
    }
    if (!incoming.has(to)) {
      incoming.set(to, new Set());
    }

    // Add edges
    outgoing.get(from)!.add(to);
    incoming.get(to)!.add(from);

    // Track edge weight
    const edgeKey = `${from}->${to}`;
    weights.set(edgeKey, weight);

    // Ensure all modules exist in the graph even if they have no edges
    if (!outgoing.has(to)) {
      outgoing.set(to, new Set());
    }
    if (!incoming.has(from)) {
      incoming.set(from, new Set());
    }
  }

  return { outgoing, incoming, weights };
}

/**
 * Extract N-hop neighborhood from adjacency graph starting from seed modules
 */
export function extractNeighborhood(
  seedModules: string[],
  adjacencyGraph: AdjacencyGraph,
  policy: Policy,
  foldRadius: number = 1
): NeighborhoodData {
  const visited = new Set<string>();
  const modulesInNeighborhood = new Set<string>();

  // BFS to find all modules within fold radius
  const queue: Array<{ moduleId: string; distance: number }> = [];

  // Initialize with seed modules
  for (const seedModule of seedModules) {
    queue.push({ moduleId: seedModule, distance: 0 });
    modulesInNeighborhood.add(seedModule);
  }

  while (queue.length > 0) {
    const { moduleId, distance } = queue.shift()!;

    if (visited.has(moduleId)) {
      continue;
    }
    visited.add(moduleId);

    // Stop expanding if we've reached the fold radius
    if (distance >= foldRadius) {
      continue;
    }

    // Explore neighbors (both incoming and outgoing edges)
    const outgoingNeighbors = adjacencyGraph.outgoing.get(moduleId) || new Set();
    const incomingNeighbors = adjacencyGraph.incoming.get(moduleId) || new Set();

    const allNeighbors = new Set([...outgoingNeighbors, ...incomingNeighbors]);

    for (const neighbor of allNeighbors) {
      if (!visited.has(neighbor)) {
        modulesInNeighborhood.add(neighbor);
        queue.push({ moduleId: neighbor, distance: distance + 1 });
      }
    }
  }

  // Build modules with metadata
  const modules: ModuleWithMetadata[] = [];
  const moduleIdArray = Array.from(modulesInNeighborhood).sort();

  for (let i = 0; i < moduleIdArray.length; i++) {
    const moduleId = moduleIdArray[i];
    const metadata = getModuleMetadata(moduleId, policy, i, moduleIdArray.length);
    modules.push(metadata);
  }

  return {
    seed_modules: seedModules,
    fold_radius: foldRadius,
    modules
  };
}

/**
 * Get policy metadata for a module
 */
function getModuleMetadata(
  moduleId: string,
  policy: Policy,
  index: number,
  total: number
): ModuleWithMetadata {
  // Get module-specific policy if it exists
  const modulePolicies = (policy.modules as any)?.modules || policy.modules || {};
  const modulePolicy = modulePolicies[moduleId] || {};

  // Generate coordinates based on index (simple layout)
  // In a real implementation, this could use a graph layout algorithm
  const coords: [number, number] = [
    index % Math.ceil(Math.sqrt(total)),
    Math.floor(index / Math.ceil(Math.sqrt(total)))
  ];

  return {
    id: moduleId,
    coords,
    allowed_callers: modulePolicy.allowed_callers || [],
    forbidden_callers: modulePolicy.forbidden_callers || [],
    feature_flags: modulePolicy.feature_flags || [],
    requires_permissions: modulePolicy.requires_permissions || [],
    kill_patterns: modulePolicy.kill_patterns || []
  };
}
