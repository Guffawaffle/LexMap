#!/usr/bin/env node
/**
 * LexMap Adjacency Graph Generator
 *
 * Generates a derived adjacency graph that shows which modules can legally communicate,
 * based on allowed_callers and forbidden_callers in the policy.
 *
 * Usage:
 *     lexmap-adjacency <policy.json> [--output <adjacency.json>] [--format json|text]
 *
 * What it does:
 *     1. Loads policy file (lexmap.policy.json)
 *     2. Generates adjacency graph from allowed_callers and forbidden_callers
 *     3. Outputs the graph in JSON or human-readable text format
 *
 * Exit codes:
 *     0 - Success
 *     1 - Error (file not found, invalid policy, etc.)
 *
 * Example:
 *     lexmap-adjacency lexmap.policy.json --output adjacency.json
 *
 *     Output (JSON):
 *     {
 *       "adjacency": {
 *         "ui/user-admin-panel": ["services/user-access-api"],
 *         "services/user-access-api": ["ui/user-admin-panel", "services/auth-core"],
 *         "services/auth-core": ["services/user-access-api"]
 *       },
 *       "forbidden": {
 *         "ui/user-admin-panel": ["services/auth-core"],
 *         "services/auth-core": ["ui/user-admin-panel"]
 *       }
 *     }
 *
 *     Output (Text):
 *     Allowed Connections:
 *       ui/user-admin-panel → services/user-access-api
 *       services/user-access-api → ui/user-admin-panel, services/auth-core
 *       services/auth-core → services/user-access-api
 *
 *     Forbidden Connections:
 *       ui/user-admin-panel ✗ services/auth-core
 *       services/auth-core ✗ ui/user-admin-panel
 *
 * Author: LexMap
 * License: MIT
 */

import * as fs from "fs";
import * as path from "path";

interface AdjacencyGraph {
  adjacency: Record<string, string[]>;
  forbidden: Record<string, string[]>;
}

interface PolicyWithModuleCallers {
  modules?: Record<string, {
    description?: string;
    allowed_callers?: string[];
    forbidden_callers?: string[];
    [key: string]: any;
  }>;
}

interface PolicyWithAllowedDeps {
  modules?: {
    patterns?: Array<{ name: string; match: string }>;
    allowed_deps?: Array<{ from: string; to: string }>;
  };
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
 */
function generateAdjacencyGraph(
  policy: PolicyWithModuleCallers | PolicyWithAllowedDeps
): AdjacencyGraph {
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

  return graph;
}

/**
 * Format adjacency graph as human-readable text
 */
function formatAsText(graph: AdjacencyGraph): string {
  let output = "";

  // Format allowed connections
  if (Object.keys(graph.adjacency).length > 0) {
    output += "Allowed Connections:\n";
    for (const [module, connections] of Object.entries(graph.adjacency).sort()) {
      if (connections.length > 0) {
        output += `  ${module} → ${connections.sort().join(", ")}\n`;
      }
    }
  } else {
    output += "Allowed Connections: (none)\n";
  }

  output += "\n";

  // Format forbidden connections
  if (Object.keys(graph.forbidden).length > 0) {
    output += "Forbidden Connections:\n";
    for (const [module, connections] of Object.entries(graph.forbidden).sort()) {
      if (connections.length > 0) {
        output += `  ${module} ✗ ${connections.sort().join(", ")}\n`;
      }
    }
  } else {
    output += "Forbidden Connections: (none)\n";
  }

  return output;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: lexmap-adjacency <policy.json> [--output <file>] [--format json|text]

Options:
  --output, -o <file>    Write output to file instead of stdout
  --format, -f <format>  Output format: json (default) or text
  --help, -h             Show this help message

Examples:
  lexmap-adjacency lexmap.policy.json
  lexmap-adjacency lexmap.policy.json --output adjacency.json
  lexmap-adjacency lexmap.policy.json --format text
    `);
    process.exit(0);
  }

  const policyPath = args[0];
  let outputPath: string | null = null;
  let format: "json" | "text" = "json";

  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--output" || args[i] === "-o") {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === "--format" || args[i] === "-f") {
      const formatArg = args[i + 1];
      if (formatArg === "json" || formatArg === "text") {
        format = formatArg;
      } else {
        console.error(`Error: Invalid format "${formatArg}". Use "json" or "text".`);
        process.exit(1);
      }
      i++;
    }
  }

  // Load policy file
  if (!fs.existsSync(policyPath)) {
    console.error(`Error: Policy file not found: ${policyPath}`);
    process.exit(1);
  }

  let policy: any;
  try {
    const policyContent = fs.readFileSync(policyPath, "utf8");
    policy = JSON.parse(policyContent);
  } catch (err) {
    console.error(`Error: Failed to parse policy file: ${err}`);
    process.exit(1);
  }

  // Generate adjacency graph
  const graph = generateAdjacencyGraph(policy);

  // Format output
  let output: string;
  if (format === "json") {
    output = JSON.stringify(graph, null, 2);
  } else {
    output = formatAsText(graph);
  }

  // Write or print output
  if (outputPath) {
    try {
      fs.writeFileSync(outputPath, output, "utf8");
      console.log(`✓ Adjacency graph written to ${outputPath}`);
    } catch (err) {
      console.error(`Error: Failed to write output file: ${err}`);
      process.exit(1);
    }
  } else {
    console.log(output);
  }
}

main();
