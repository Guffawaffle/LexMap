#!/usr/bin/env node
/**
 * Example: Generate and display adjacency graph from policy
 * 
 * This demonstrates how to use the adjacency graph API
 */

import { generateAdjacencyGraph } from '../packages/codemap-indexer/dist/adjacency.js';
import { readFileSync } from 'fs';

// Example 1: Module callers format (newer)
console.log('Example 1: Module Callers Format');
console.log('==================================\n');

const policyModuleCallers = {
  modules: {
    'services/auth-core': {
      description: 'Core auth abstractions',
      allowed_callers: ['external-auth-adapter', 'api/user-access-service'],
      forbidden_callers: []
    },
    'ui/admin-panel': {
      description: 'Admin UI',
      allowed_callers: ['api/user-access-service'],
      forbidden_callers: ['services/auth-core']
    },
    'api/user-access-service': {
      description: 'User access API',
      allowed_callers: ['ui/admin-panel'],
      forbidden_callers: []
    }
  }
};

const graph1 = generateAdjacencyGraph(policyModuleCallers);

console.log('Allowed connections (bidirectional):');
for (const [module, connections] of Object.entries(graph1.adjacency).sort()) {
  if (connections.length > 0) {
    console.log(`  ${module} ↔ ${connections.sort().join(', ')}`);
  }
}

console.log('\nForbidden connections:');
for (const [module, connections] of Object.entries(graph1.forbidden).sort()) {
  if (connections.length > 0) {
    console.log(`  ${module} ✗ ${connections.sort().join(', ')}`);
  }
}

// Example 2: Allowed deps format (legacy)
console.log('\n\nExample 2: Allowed Dependencies Format');
console.log('========================================\n');

const policyAllowedDeps = {
  modules: {
    patterns: [
      { name: 'controllers', match: 'app/Controllers/**' },
      { name: 'services', match: 'app/Services/**' },
      { name: 'models', match: 'app/Models/**' }
    ],
    allowed_deps: [
      { from: 'controllers', to: 'services' },
      { from: 'controllers', to: 'models' },
      { from: 'services', to: 'models' }
    ]
  }
};

const graph2 = generateAdjacencyGraph(policyAllowedDeps);

console.log('Allowed connections (unidirectional):');
for (const [module, connections] of Object.entries(graph2.adjacency).sort()) {
  if (connections.length > 0) {
    console.log(`  ${module} → ${connections.sort().join(', ')}`);
  }
}

// Example 3: Load from file
console.log('\n\nExample 3: Load from Policy File');
console.log('==================================\n');

try {
  const policyPath = process.argv[2] || 'docs/schemas/examples/lexmap.policy.example.json';
  const policyContent = readFileSync(policyPath, 'utf8');
  const policy = JSON.parse(policyContent);
  
  const graph3 = generateAdjacencyGraph(policy);
  
  console.log(`Loaded policy from: ${policyPath}`);
  console.log(`Modules with allowed connections: ${Object.keys(graph3.adjacency).length}`);
  console.log(`Modules with forbidden connections: ${Object.keys(graph3.forbidden).length}`);
  
  console.log('\nSample allowed connections:');
  let count = 0;
  for (const [module, connections] of Object.entries(graph3.adjacency).sort()) {
    if (connections.length > 0 && count < 5) {
      console.log(`  ${module} ↔ ${connections.sort().join(', ')}`);
      count++;
    }
  }
  
  if (Object.keys(graph3.forbidden).length > 0) {
    console.log('\nSample forbidden connections:');
    count = 0;
    for (const [module, connections] of Object.entries(graph3.forbidden).sort()) {
      if (connections.length > 0 && count < 5) {
        console.log(`  ${module} ✗ ${connections.sort().join(', ')}`);
        count++;
      }
    }
  }
} catch (err) {
  console.log('Could not load policy file (this is expected in CI)');
}

console.log('\n✓ Adjacency graph examples complete!');
