/**
 * Unit tests for adjacency graph generation
 */

import { generateAdjacencyGraph, clearAdjacencyCache, getAdjacencyCacheSize } from '../dist/adjacency.js';
import { strict as assert } from 'assert';

// Test policy with allowed_callers/forbidden_callers format
const policyModuleCallers = {
  modules: {
    'services/auth-core': {
      description: 'Core auth abstractions',
      allowed_callers: ['external-auth-adapter', 'api/user-access-service'],
      forbidden_callers: [],
    },
    'external-auth-adapter': {
      description: 'External auth adapter',
      allowed_callers: ['ui/auth-dashboard'],
      forbidden_callers: ['ui/user-admin-panel'],
    },
    'ui/user-admin-panel': {
      description: 'User admin UI',
      allowed_callers: ['api/user-access-service'],
      forbidden_callers: ['external-auth-adapter', 'services/auth-core'],
    },
    'api/user-access-service': {
      description: 'Service layer for user access',
      allowed_callers: ['ui/user-admin-panel'],
      forbidden_callers: [],
    },
  },
};

// Test policy with allowed_deps format
const policyAllowedDeps = {
  modules: {
    patterns: [
      { name: 'controllers', match: 'app/Http/Controllers/**' },
      { name: 'services', match: 'app/Services/**' },
      { name: 'models', match: 'app/Models/**' },
    ],
    allowed_deps: [
      { from: 'controllers', to: 'services' },
      { from: 'controllers', to: 'models' },
      { from: 'services', to: 'models' },
    ],
  },
};

function testModuleCallersFormat() {
  console.log('Testing module callers format...');
  
  clearAdjacencyCache();
  const graph = generateAdjacencyGraph(policyModuleCallers);

  // Check allowed adjacencies (bidirectional)
  assert.ok(graph.adjacency['services/auth-core'], 'services/auth-core should exist in adjacency');
  assert.ok(graph.adjacency['services/auth-core'].includes('external-auth-adapter'), 
    'services/auth-core should allow external-auth-adapter');
  assert.ok(graph.adjacency['services/auth-core'].includes('api/user-access-service'), 
    'services/auth-core should allow api/user-access-service');
  
  // Verify bidirectionality
  assert.ok(graph.adjacency['external-auth-adapter'].includes('services/auth-core'), 
    'external-auth-adapter should allow services/auth-core (bidirectional)');
  assert.ok(graph.adjacency['api/user-access-service'].includes('services/auth-core'), 
    'api/user-access-service should allow services/auth-core (bidirectional)');

  // Check forbidden adjacencies (bidirectional)
  assert.ok(graph.forbidden['ui/user-admin-panel'], 'ui/user-admin-panel should exist in forbidden');
  assert.ok(graph.forbidden['ui/user-admin-panel'].includes('external-auth-adapter'), 
    'ui/user-admin-panel should forbid external-auth-adapter');
  assert.ok(graph.forbidden['ui/user-admin-panel'].includes('services/auth-core'), 
    'ui/user-admin-panel should forbid services/auth-core');
  
  // Verify bidirectionality of forbidden
  assert.ok(graph.forbidden['external-auth-adapter'].includes('ui/user-admin-panel'), 
    'external-auth-adapter should forbid ui/user-admin-panel (bidirectional)');
  assert.ok(graph.forbidden['services/auth-core'].includes('ui/user-admin-panel'), 
    'services/auth-core should forbid ui/user-admin-panel (bidirectional)');

  console.log('✓ Module callers format tests passed');
}

function testAllowedDepsFormat() {
  console.log('Testing allowed deps format...');
  
  clearAdjacencyCache();
  const graph = generateAdjacencyGraph(policyAllowedDeps);

  // Check allowed adjacencies (unidirectional)
  assert.ok(graph.adjacency['controllers'], 'controllers should exist in adjacency');
  assert.ok(graph.adjacency['controllers'].includes('services'), 
    'controllers should allow services');
  assert.ok(graph.adjacency['controllers'].includes('models'), 
    'controllers should allow models');
  assert.ok(graph.adjacency['services'].includes('models'), 
    'services should allow models');

  // Verify unidirectionality (reverse edges should NOT exist)
  assert.ok(!graph.adjacency['services']?.includes('controllers'), 
    'services should NOT have reverse edge to controllers');
  assert.ok(!graph.adjacency['models']?.includes('controllers'), 
    'models should NOT have reverse edge to controllers');
  assert.ok(!graph.adjacency['models']?.includes('services'), 
    'models should NOT have reverse edge to services');

  // Forbidden should be empty for this format
  assert.equal(Object.keys(graph.forbidden).length, 0, 
    'forbidden should be empty for allowed_deps format');

  console.log('✓ Allowed deps format tests passed');
}

function testCaching() {
  console.log('Testing caching...');
  
  clearAdjacencyCache();
  assert.equal(getAdjacencyCacheSize(), 0, 'Cache should be empty initially');

  // Generate graph with caching enabled
  const graph1 = generateAdjacencyGraph(policyModuleCallers, true);
  assert.equal(getAdjacencyCacheSize(), 1, 'Cache should have one entry');

  // Generate again with same policy
  const graph2 = generateAdjacencyGraph(policyModuleCallers, true);
  assert.equal(getAdjacencyCacheSize(), 1, 'Cache should still have one entry');

  // Verify graphs are identical
  assert.deepEqual(graph1, graph2, 'Cached graph should be identical');

  // Generate with different policy
  const graph3 = generateAdjacencyGraph(policyAllowedDeps, true);
  assert.equal(getAdjacencyCacheSize(), 2, 'Cache should have two entries');

  // Generate without caching
  clearAdjacencyCache();
  const graph4 = generateAdjacencyGraph(policyModuleCallers, false);
  assert.equal(getAdjacencyCacheSize(), 0, 'Cache should remain empty when caching disabled');

  console.log('✓ Caching tests passed');
}

function testEmptyPolicy() {
  console.log('Testing empty policy...');
  
  clearAdjacencyCache();
  const graph = generateAdjacencyGraph({});

  assert.deepEqual(graph.adjacency, {}, 'adjacency should be empty for empty policy');
  assert.deepEqual(graph.forbidden, {}, 'forbidden should be empty for empty policy');

  console.log('✓ Empty policy tests passed');
}

function testNoDuplicates() {
  console.log('Testing no duplicates in adjacency lists...');
  
  clearAdjacencyCache();
  
  // Create a policy with duplicate entries
  const policyWithDuplicates = {
    modules: {
      'module-a': {
        allowed_callers: ['module-b', 'module-b', 'module-c'],
      },
      'module-b': {
        allowed_callers: ['module-a'],
      },
    },
  };
  
  const graph = generateAdjacencyGraph(policyWithDuplicates);
  
  // Check for duplicates
  for (const [module, connections] of Object.entries(graph.adjacency)) {
    const uniqueConnections = [...new Set(connections)];
    assert.equal(connections.length, uniqueConnections.length, 
      `Module ${module} should not have duplicate connections`);
  }
  
  console.log('✓ No duplicates tests passed');
}

function runTests() {
  console.log('Running adjacency graph tests...\n');
  
  try {
    testModuleCallersFormat();
    testAllowedDepsFormat();
    testCaching();
    testEmptyPolicy();
    testNoDuplicates();
    
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Test failed:', err);
    process.exit(1);
  }
}

runTests();
