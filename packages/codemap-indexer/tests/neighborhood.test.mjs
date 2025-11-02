/**
 * Tests for neighborhood extraction functionality
 */
import { strict as assert } from 'assert';
import {
  buildAdjacencyGraph,
  extractNeighborhood
} from '../dist/neighborhood.js';

// Test utilities
function assertModuleExists(neighborhood, moduleId) {
  const found = neighborhood.modules.find(m => m.id === moduleId);
  assert.ok(found, `Module ${moduleId} should exist in neighborhood`);
}

function assertModuleNotExists(neighborhood, moduleId) {
  const found = neighborhood.modules.find(m => m.id === moduleId);
  assert.ok(!found, `Module ${moduleId} should not exist in neighborhood`);
}

// Test 1: Build adjacency graph from module dependencies
function testBuildAdjacencyGraph() {
  console.log('Test 1: Build adjacency graph');

  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'B', to: 'C', weight: 2 },
    { from: 'A', to: 'C', weight: 1 },
    { from: 'C', to: 'D', weight: 3 }
  ];

  const graph = buildAdjacencyGraph(modules);

  // Verify outgoing edges
  assert.deepEqual(Array.from(graph.outgoing.get('A') || []).sort(), ['B', 'C']);
  assert.deepEqual(Array.from(graph.outgoing.get('B') || []).sort(), ['C']);
  assert.deepEqual(Array.from(graph.outgoing.get('C') || []).sort(), ['D']);
  assert.deepEqual(Array.from(graph.outgoing.get('D') || []).sort(), []);

  // Verify incoming edges
  assert.deepEqual(Array.from(graph.incoming.get('B') || []).sort(), ['A']);
  assert.deepEqual(Array.from(graph.incoming.get('C') || []).sort(), ['A', 'B']);
  assert.deepEqual(Array.from(graph.incoming.get('D') || []).sort(), ['C']);

  // Verify weights
  assert.equal(graph.weights.get('A->B'), 1);
  assert.equal(graph.weights.get('B->C'), 2);
  assert.equal(graph.weights.get('C->D'), 3);

  console.log('✓ Build adjacency graph test passed');
}

// Test 2: Extract 1-hop neighborhood (default)
function testExtractOneHopNeighborhood() {
  console.log('Test 2: Extract 1-hop neighborhood');

  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'B', to: 'C', weight: 1 },
    { from: 'C', to: 'D', weight: 1 },
    { from: 'D', to: 'E', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {};

  const neighborhood = extractNeighborhood(['B'], graph, policy, 1);

  // Should include: B (seed), A (1-hop incoming), C (1-hop outgoing)
  assert.equal(neighborhood.seed_modules.length, 1);
  assert.equal(neighborhood.seed_modules[0], 'B');
  assert.equal(neighborhood.fold_radius, 1);
  assert.equal(neighborhood.modules.length, 3);

  assertModuleExists(neighborhood, 'A');
  assertModuleExists(neighborhood, 'B');
  assertModuleExists(neighborhood, 'C');
  assertModuleNotExists(neighborhood, 'D');
  assertModuleNotExists(neighborhood, 'E');

  console.log('✓ 1-hop neighborhood test passed');
}

// Test 3: Extract 2-hop neighborhood
function testExtractTwoHopNeighborhood() {
  console.log('Test 3: Extract 2-hop neighborhood');

  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'B', to: 'C', weight: 1 },
    { from: 'C', to: 'D', weight: 1 },
    { from: 'D', to: 'E', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {};

  const neighborhood = extractNeighborhood(['B'], graph, policy, 2);

  // Should include: A, B, C, D (within 2 hops)
  assert.equal(neighborhood.fold_radius, 2);
  assert.equal(neighborhood.modules.length, 4);

  assertModuleExists(neighborhood, 'A');
  assertModuleExists(neighborhood, 'B');
  assertModuleExists(neighborhood, 'C');
  assertModuleExists(neighborhood, 'D');
  assertModuleNotExists(neighborhood, 'E');

  console.log('✓ 2-hop neighborhood test passed');
}

// Test 4: Multiple seed modules
function testMultipleSeedModules() {
  console.log('Test 4: Multiple seed modules');

  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'C', to: 'D', weight: 1 },
    { from: 'E', to: 'F', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {};

  const neighborhood = extractNeighborhood(['A', 'C'], graph, policy, 1);

  // Should include neighborhoods of both A and C
  assert.equal(neighborhood.seed_modules.length, 2);
  assert.deepEqual(neighborhood.seed_modules, ['A', 'C']);
  assert.equal(neighborhood.modules.length, 4);

  assertModuleExists(neighborhood, 'A');
  assertModuleExists(neighborhood, 'B');
  assertModuleExists(neighborhood, 'C');
  assertModuleExists(neighborhood, 'D');
  assertModuleNotExists(neighborhood, 'E');
  assertModuleNotExists(neighborhood, 'F');

  console.log('✓ Multiple seed modules test passed');
}

// Test 5: Isolated module (no dependencies)
function testIsolatedModule() {
  console.log('Test 5: Isolated module');

  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'B', to: 'C', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {};

  // Add isolated module to graph manually
  graph.outgoing.set('ISOLATED', new Set());
  graph.incoming.set('ISOLATED', new Set());

  const neighborhood = extractNeighborhood(['ISOLATED'], graph, policy, 1);

  // Should only include the isolated module itself
  assert.equal(neighborhood.modules.length, 1);
  assertModuleExists(neighborhood, 'ISOLATED');

  console.log('✓ Isolated module test passed');
}

// Test 6: Circular dependencies
function testCircularDependencies() {
  console.log('Test 6: Circular dependencies');

  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'B', to: 'C', weight: 1 },
    { from: 'C', to: 'A', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {};

  const neighborhood = extractNeighborhood(['A'], graph, policy, 1);

  // Should handle circular dependencies without infinite loop
  assert.equal(neighborhood.modules.length, 3);
  assertModuleExists(neighborhood, 'A');
  assertModuleExists(neighborhood, 'B');
  assertModuleExists(neighborhood, 'C');

  console.log('✓ Circular dependencies test passed');
}

// Test 7: Policy metadata attachment
function testPolicyMetadata() {
  console.log('Test 7: Policy metadata attachment');

  const modules = [
    { from: 'ui/user-admin-panel', to: 'services/user-access-api', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {
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
        description: 'User access API',
        allowed_callers: ['ui/user-admin-panel'],
        forbidden_callers: [],
        feature_flags: ['beta_user_admin'],
        requires_permissions: ['can_manage_users'],
        kill_patterns: []
      }
    }
  };

  const neighborhood = extractNeighborhood(['ui/user-admin-panel'], graph, policy, 1);

  const uiModule = neighborhood.modules.find(m => m.id === 'ui/user-admin-panel');
  assert.ok(uiModule, 'UI module should exist');
  assert.deepEqual(uiModule.allowed_callers, ['services/user-access-api']);
  assert.deepEqual(uiModule.forbidden_callers, ['services/auth-core']);
  assert.deepEqual(uiModule.feature_flags, ['beta_user_admin']);
  assert.deepEqual(uiModule.requires_permissions, ['can_manage_users']);
  assert.deepEqual(uiModule.kill_patterns, ['duplicate_auth_logic']);

  const apiModule = neighborhood.modules.find(m => m.id === 'services/user-access-api');
  assert.ok(apiModule, 'API module should exist');
  assert.deepEqual(apiModule.allowed_callers, ['ui/user-admin-panel']);
  assert.deepEqual(apiModule.forbidden_callers, []);

  console.log('✓ Policy metadata test passed');
}

// Test 8: Module coordinates are assigned
function testModuleCoordinates() {
  console.log('Test 8: Module coordinates');

  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'B', to: 'C', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {};

  const neighborhood = extractNeighborhood(['A'], graph, policy, 2);

  // All modules should have coordinates
  for (const module of neighborhood.modules) {
    assert.ok(Array.isArray(module.coords), 'Module should have coords array');
    assert.equal(module.coords.length, 2, 'Coords should be [x, y]');
    assert.equal(typeof module.coords[0], 'number', 'X coord should be number');
    assert.equal(typeof module.coords[1], 'number', 'Y coord should be number');
  }

  console.log('✓ Module coordinates test passed');
}

// Test 9: Default fold radius is 1
function testDefaultFoldRadius() {
  console.log('Test 9: Default fold radius');

  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'B', to: 'C', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {};

  // Call without foldRadius parameter (should default to 1)
  const neighborhood = extractNeighborhood(['A'], graph, policy);

  assert.equal(neighborhood.fold_radius, 1);
  assert.equal(neighborhood.modules.length, 2); // A and B only

  console.log('✓ Default fold radius test passed');
}

// Test 10: Complex graph topology
function testComplexGraphTopology() {
  console.log('Test 10: Complex graph topology');

  // Diamond-shaped graph
  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'A', to: 'C', weight: 1 },
    { from: 'B', to: 'D', weight: 1 },
    { from: 'C', to: 'D', weight: 1 },
    { from: 'D', to: 'E', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {};

  const neighborhood = extractNeighborhood(['D'], graph, policy, 1);

  // Should include: B, C, D, E (D's neighbors)
  assert.equal(neighborhood.modules.length, 4);
  assertModuleNotExists(neighborhood, 'A'); // 2 hops away
  assertModuleExists(neighborhood, 'B');
  assertModuleExists(neighborhood, 'C');
  assertModuleExists(neighborhood, 'D');
  assertModuleExists(neighborhood, 'E');

  console.log('✓ Complex graph topology test passed');
}

// Test 11: Zero radius (only seed modules)
function testZeroRadius() {
  console.log('Test 11: Zero radius');

  const modules = [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'B', to: 'C', weight: 1 }
  ];

  const graph = buildAdjacencyGraph(modules);
  const policy= {};

  const neighborhood = extractNeighborhood(['B'], graph, policy, 0);

  // Should only include seed module B
  assert.equal(neighborhood.fold_radius, 0);
  assert.equal(neighborhood.modules.length, 1);
  assertModuleExists(neighborhood, 'B');
  assertModuleNotExists(neighborhood, 'A');
  assertModuleNotExists(neighborhood, 'C');

  console.log('✓ Zero radius test passed');
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Running neighborhood extraction tests...\n');

  try {
    testBuildAdjacencyGraph();
    testExtractOneHopNeighborhood();
    testExtractTwoHopNeighborhood();
    testMultipleSeedModules();
    testIsolatedModule();
    testCircularDependencies();
    testPolicyMetadata();
    testModuleCoordinates();
    testDefaultFoldRadius();
    testComplexGraphTopology();
    testZeroRadius();

    console.log('\n✅ All neighborhood extraction tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runAllTests();
