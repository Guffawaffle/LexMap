/**
 * Example: Using the neighborhood extraction feature
 * 
 * This example demonstrates how to extract a fold-radius neighborhood
 * from a module dependency graph with policy metadata.
 */

import {
  buildAdjacencyGraph,
  extractNeighborhood
} from '../dist/neighborhood.js';

// Example 1: Simple module graph
console.log('=== Example 1: Simple Module Graph ===\n');

const simpleModules = [
  { from: 'ui/user-admin-panel', to: 'services/user-access-api', weight: 5 },
  { from: 'services/user-access-api', to: 'services/auth-core', weight: 10 },
  { from: 'services/auth-core', to: 'external-auth-adapter', weight: 3 },
  { from: 'external-auth-adapter', to: 'lib/http-client', weight: 2 }
];

const simpleGraph = buildAdjacencyGraph(simpleModules);

const simplePolicy = {
  modules: {
    'ui/user-admin-panel': {
      description: 'User admin UI',
      allowed_callers: ['services/user-access-api'],
      forbidden_callers: ['services/auth-core'],
      feature_flags: ['beta_user_admin'],
      requires_permissions: ['can_manage_users'],
      kill_patterns: ['duplicate_auth_logic']
    },
    'services/user-access-api': {
      description: 'User access service',
      allowed_callers: ['ui/user-admin-panel'],
      forbidden_callers: [],
      feature_flags: ['beta_user_admin'],
      requires_permissions: ['can_manage_users'],
      kill_patterns: []
    },
    'services/auth-core': {
      description: 'Core authentication service',
      allowed_callers: ['external-auth-adapter', 'services/user-access-api'],
      forbidden_callers: [],
      feature_flags: [],
      requires_permissions: [],
      kill_patterns: ['duplicate_auth_logic']
    }
  }
};

// Extract 1-hop neighborhood from UI panel
const neighborhood1 = extractNeighborhood(
  ['ui/user-admin-panel'],
  simpleGraph,
  simplePolicy,
  1
);

console.log('1-hop neighborhood from ui/user-admin-panel:');
console.log(JSON.stringify(neighborhood1, null, 2));
console.log('\n');

// Extract 2-hop neighborhood from UI panel
const neighborhood2 = extractNeighborhood(
  ['ui/user-admin-panel'],
  simpleGraph,
  simplePolicy,
  2
);

console.log('2-hop neighborhood from ui/user-admin-panel:');
console.log(`Modules in 2-hop: ${neighborhood2.modules.map(m => m.id).join(', ')}`);
console.log('\n');

// Example 2: Complex graph with circular dependencies
console.log('=== Example 2: Circular Dependencies ===\n');

const circularModules = [
  { from: 'A', to: 'B', weight: 1 },
  { from: 'B', to: 'C', weight: 1 },
  { from: 'C', to: 'A', weight: 1 },
  { from: 'B', to: 'D', weight: 1 }
];

const circularGraph = buildAdjacencyGraph(circularModules);
const emptyPolicy = {};

const circularNeighborhood = extractNeighborhood(
  ['A'],
  circularGraph,
  emptyPolicy,
  2
);

console.log('2-hop neighborhood from A (with circular deps):');
console.log(`Modules: ${circularNeighborhood.modules.map(m => m.id).join(', ')}`);
console.log('\n');

// Example 3: Multiple seed modules
console.log('=== Example 3: Multiple Seed Modules ===\n');

const multiSeedModules = [
  { from: 'frontend/app', to: 'api/gateway', weight: 1 },
  { from: 'api/gateway', to: 'services/users', weight: 1 },
  { from: 'api/gateway', to: 'services/orders', weight: 1 },
  { from: 'services/users', to: 'db/postgres', weight: 1 },
  { from: 'services/orders', to: 'db/postgres', weight: 1 },
  { from: 'admin/dashboard', to: 'api/admin-gateway', weight: 1 },
  { from: 'api/admin-gateway', to: 'services/users', weight: 1 }
];

const multiGraph = buildAdjacencyGraph(multiSeedModules);

const multiNeighborhood = extractNeighborhood(
  ['frontend/app', 'admin/dashboard'],
  multiGraph,
  emptyPolicy,
  1
);

console.log('1-hop neighborhood from [frontend/app, admin/dashboard]:');
console.log(`Modules: ${multiNeighborhood.modules.map(m => m.id).join(', ')}`);
console.log('\n');

// Example 4: Isolated module
console.log('=== Example 4: Isolated Module ===\n');

const isolatedModules = [
  { from: 'A', to: 'B', weight: 1 },
  { from: 'B', to: 'C', weight: 1 }
];

const isolatedGraph = buildAdjacencyGraph(isolatedModules);
// Manually add an isolated module
isolatedGraph.outgoing.set('ISOLATED', new Set());
isolatedGraph.incoming.set('ISOLATED', new Set());

const isolatedNeighborhood = extractNeighborhood(
  ['ISOLATED'],
  isolatedGraph,
  emptyPolicy,
  1
);

console.log('1-hop neighborhood from ISOLATED:');
console.log(`Modules: ${isolatedNeighborhood.modules.map(m => m.id).join(', ')}`);
console.log('(Only the isolated module itself should appear)');
console.log('\n');

console.log('✅ All examples completed successfully!');
