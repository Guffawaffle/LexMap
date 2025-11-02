/**
 * Adjacency graph generation from LexMap policy
 * 
 * Generates a derived adjacency graph showing which modules can legally communicate,
 * based on allowed_callers and forbidden_callers in the policy.
 */

import { stableStringify } from './hash.js';

export interface AdjacencyGraph {
  adjacency: Record<string, string[]>;
  forbidden: Record<string, string[]>;
}

export interface PolicyWithModuleCallers {
  modules?: Record<string, {
    description?: string;
    allowed_callers?: string[];
    forbidden_callers?: string[];
    [key: string]: any;
  }>;
}

export interface PolicyWithAllowedDeps {
  modules?: {
    patterns?: Array<{ name: string; match: string }>;
    allowed_deps?: Array<{ from: string; to: string }>;
  };
}

/**
 * Cache for adjacency graphs keyed by policy hash
 */
const adjacencyCache = new Map<string, AdjacencyGraph>();

/**
 * Generate a stable hash for the policy object to use as cache key
 */
function hashPolicy(policy: any): string {
  return stableStringify(policy);
}

/**
 * Add a bidirectional edge to the adjacency graph
 */
function addBidirectionalEdge(
  graph: Record<string, string[]>,
  from: string,
  to: string
): void {
  if (!graph[from]) {
    graph[from] = [];
  }
  if (!graph[to]) {
    graph[to] = [];
  }
  
  if (!graph[from].includes(to)) {
    graph[from].push(to);
  }
  if (!graph[to].includes(from)) {
    graph[to].push(from);
  }
}

/**
 * Add a unidirectional edge to the adjacency graph
 */
function addUnidirectionalEdge(
  graph: Record<string, string[]>,
  from: string,
  to: string
): void {
  if (!graph[from]) {
    graph[from] = [];
  }
  
  if (!graph[from].includes(to)) {
    graph[from].push(to);
  }
}

/**
 * Generate adjacency graph from policy with allowed_callers/forbidden_callers format
 */
function generateFromModuleCallers(
  policy: PolicyWithModuleCallers
): AdjacencyGraph {
  const adjacency: Record<string, string[]> = {};
  const forbidden: Record<string, string[]> = {};

  if (!policy.modules) {
    return { adjacency, forbidden };
  }

  // Process each module
  for (const [moduleId, moduleConfig] of Object.entries(policy.modules)) {
    // Process allowed_callers - bidirectional relationships
    if (moduleConfig.allowed_callers && Array.isArray(moduleConfig.allowed_callers)) {
      for (const caller of moduleConfig.allowed_callers) {
        addBidirectionalEdge(adjacency, moduleId, caller);
      }
    }

    // Process forbidden_callers - bidirectional forbidden relationships
    if (moduleConfig.forbidden_callers && Array.isArray(moduleConfig.forbidden_callers)) {
      for (const caller of moduleConfig.forbidden_callers) {
        addBidirectionalEdge(forbidden, moduleId, caller);
      }
    }
  }

  return { adjacency, forbidden };
}

/**
 * Generate adjacency graph from policy with allowed_deps format
 */
function generateFromAllowedDeps(
  policy: PolicyWithAllowedDeps
): AdjacencyGraph {
  const adjacency: Record<string, string[]> = {};
  const forbidden: Record<string, string[]> = {};

  if (!policy.modules?.allowed_deps) {
    return { adjacency, forbidden };
  }

  // Process allowed dependencies - unidirectional relationships
  for (const dep of policy.modules.allowed_deps) {
    if (dep.from && dep.to) {
      addUnidirectionalEdge(adjacency, dep.from, dep.to);
    }
  }

  return { adjacency, forbidden };
}

/**
 * Detect which policy format is being used
 */
function detectPolicyFormat(policy: any): 'module-callers' | 'allowed-deps' | 'unknown' {
  if (policy.modules) {
    // Check if it's the newer format with module IDs as keys
    const moduleKeys = Object.keys(policy.modules);
    
    // If modules is an object with module IDs that have allowed_callers/forbidden_callers
    if (moduleKeys.some(key => 
      typeof policy.modules[key] === 'object' && 
      (policy.modules[key].allowed_callers || policy.modules[key].forbidden_callers)
    )) {
      return 'module-callers';
    }
    
    // If modules has patterns and allowed_deps arrays
    if (policy.modules.patterns || policy.modules.allowed_deps) {
      return 'allowed-deps';
    }
  }
  
  return 'unknown';
}

/**
 * Generate adjacency graph from policy object
 * 
 * Automatically detects policy format and generates appropriate adjacency graph.
 * Results are cached for performance.
 * 
 * @param policy - Policy object in either format
 * @param useCache - Whether to use caching (default: true)
 * @returns Adjacency graph with allowed and forbidden edges
 */
export function generateAdjacencyGraph(
  policy: PolicyWithModuleCallers | PolicyWithAllowedDeps,
  useCache: boolean = true
): AdjacencyGraph {
  // Check cache first
  if (useCache) {
    const cacheKey = hashPolicy(policy);
    const cached = adjacencyCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Detect format and generate appropriate graph
  const format = detectPolicyFormat(policy);
  let graph: AdjacencyGraph;

  if (format === 'module-callers') {
    graph = generateFromModuleCallers(policy as PolicyWithModuleCallers);
  } else if (format === 'allowed-deps') {
    graph = generateFromAllowedDeps(policy as PolicyWithAllowedDeps);
  } else {
    // Unknown format, return empty graph
    graph = { adjacency: {}, forbidden: {} };
  }

  // Cache the result
  if (useCache) {
    const cacheKey = hashPolicy(policy);
    adjacencyCache.set(cacheKey, graph);
  }

  return graph;
}

/**
 * Clear the adjacency graph cache
 */
export function clearAdjacencyCache(): void {
  adjacencyCache.clear();
}

/**
 * Get the size of the adjacency graph cache
 */
export function getAdjacencyCacheSize(): number {
  return adjacencyCache.size;
}
