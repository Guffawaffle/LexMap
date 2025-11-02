# Fold-Radius Neighborhood Extraction

This module provides functionality to extract N-hop neighborhoods from module dependency graphs with full policy metadata attachment.

## Overview

Given a seed module (or set of modules) and a fold radius, the neighborhood extractor identifies all modules within N hops in the dependency graph and attaches relevant policy metadata to each module.

## API

### Types

```typescript
interface AdjacencyGraph {
  outgoing: Map<string, Set<string>>;  // module -> dependencies
  incoming: Map<string, Set<string>>;  // module -> dependents
  weights: Map<string, number>;         // edge -> weight
}

interface ModuleWithMetadata {
  id: string;
  coords: [number, number];
  allowed_callers: string[];
  forbidden_callers: string[];
  feature_flags: string[];
  requires_permissions: string[];
  kill_patterns: string[];
}

interface NeighborhoodData {
  seed_modules: string[];
  fold_radius: number;
  modules: ModuleWithMetadata[];
}
```

### Functions

#### `buildAdjacencyGraph(modules: Module[]): AdjacencyGraph`

Builds a bidirectional adjacency graph from a list of module dependencies.

**Parameters:**
- `modules`: Array of module dependencies with `from`, `to`, and `weight` fields

**Returns:**
- `AdjacencyGraph` with outgoing edges, incoming edges, and edge weights

**Example:**
```typescript
const modules = [
  { from: 'A', to: 'B', weight: 1 },
  { from: 'B', to: 'C', weight: 2 }
];

const graph = buildAdjacencyGraph(modules);
// graph.outgoing.get('A') => Set(['B'])
// graph.incoming.get('B') => Set(['A'])
```

#### `extractNeighborhood(seedModules: string[], adjacencyGraph: AdjacencyGraph, policy: Policy, foldRadius?: number): NeighborhoodData`

Extracts an N-hop neighborhood from the adjacency graph starting from seed modules.

**Parameters:**
- `seedModules`: Array of module IDs to start the neighborhood extraction from
- `adjacencyGraph`: The bidirectional adjacency graph
- `policy`: Policy object containing module metadata
- `foldRadius`: (Optional) Number of hops to expand, defaults to 1

**Returns:**
- `NeighborhoodData` containing seed modules, fold radius, and modules with metadata

**Algorithm:**
1. Initialize a BFS queue with seed modules at distance 0
2. For each module in the queue:
   - Mark as visited
   - If distance < foldRadius, add all neighbors (both incoming and outgoing) to queue
3. Attach policy metadata to all discovered modules
4. Generate coordinates for layout visualization

**Example:**
```typescript
const neighborhood = extractNeighborhood(
  ['ui/user-admin-panel'],
  graph,
  policy,
  1  // 1-hop neighborhood
);

// Result includes:
// - ui/user-admin-panel (seed)
// - services/user-access-api (1-hop away)
// All with full policy metadata
```

## Usage Examples

### Basic 1-Hop Neighborhood

```typescript
import { buildAdjacencyGraph, extractNeighborhood } from './neighborhood.js';

const modules = [
  { from: 'ui/admin', to: 'api/users', weight: 5 },
  { from: 'api/users', to: 'db/postgres', weight: 10 }
];

const graph = buildAdjacencyGraph(modules);
const policy = {
  modules: {
    'ui/admin': {
      allowed_callers: ['api/users'],
      forbidden_callers: [],
      feature_flags: ['admin_ui'],
      requires_permissions: ['admin_access'],
      kill_patterns: []
    }
  }
};

const neighborhood = extractNeighborhood(['ui/admin'], graph, policy, 1);
// Returns: ui/admin and api/users (1-hop neighbors)
```

### Multiple Seed Modules

```typescript
const neighborhood = extractNeighborhood(
  ['frontend/app', 'admin/dashboard'],
  graph,
  policy,
  2  // 2-hop neighborhood
);
// Returns neighborhood covering both seed modules
```

### Handling Circular Dependencies

The algorithm handles circular dependencies correctly by tracking visited modules:

```typescript
const modules = [
  { from: 'A', to: 'B', weight: 1 },
  { from: 'B', to: 'C', weight: 1 },
  { from: 'C', to: 'A', weight: 1 }  // circular
];

const neighborhood = extractNeighborhood(['A'], graph, policy, 2);
// Returns: A, B, C (handles cycle without infinite loop)
```

## Features

### ✅ Implemented

- [x] Build adjacency graph from module dependencies
- [x] Extract N-hop neighborhoods using BFS
- [x] Default fold radius of 1
- [x] Attach full policy metadata to modules
- [x] Handle edge cases:
  - Isolated modules (no dependencies)
  - Circular dependencies
  - Multiple seed modules
  - Zero radius (seed only)
- [x] Generate coordinates for visualization
- [x] Comprehensive test coverage

### 🎯 Edge Cases Handled

1. **Isolated Modules**: Modules with no dependencies return only themselves
2. **Circular Dependencies**: Visited tracking prevents infinite loops
3. **Multiple Seeds**: Combines neighborhoods of all seed modules
4. **Zero Radius**: Returns only seed modules without expansion
5. **Missing Policy**: Gracefully handles modules without policy metadata

## Output Format

The output follows the specification from the issue:

```json
{
  "seed_modules": ["ui/user-admin-panel"],
  "fold_radius": 1,
  "modules": [
    {
      "id": "ui/user-admin-panel",
      "coords": [0, 2],
      "allowed_callers": ["services/user-access-api"],
      "forbidden_callers": ["services/auth-core"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": ["duplicate_auth_logic"]
    },
    {
      "id": "services/user-access-api",
      "coords": [1, 1],
      "allowed_callers": ["ui/user-admin-panel"],
      "forbidden_callers": [],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": []
    }
  ]
}
```

## Testing

Run the test suite:

```bash
npm run test:neighborhood
```

Run examples:

```bash
node tests/neighborhood.example.mjs
```

The test suite includes 11 comprehensive tests covering:
- Graph construction
- 1-hop and 2-hop neighborhoods
- Multiple seed modules
- Isolated modules
- Circular dependencies
- Policy metadata attachment
- Coordinate generation
- Default parameters
- Complex graph topologies
- Edge cases

## Integration

This feature integrates with the LexMap indexer and can be used to:

1. **Atlas Frame Export**: Extract relevant subgraphs for visualization
2. **LexBrain Mind Palace**: Create focused context for LLM reasoning
3. **Policy Validation**: Identify modules affected by policy changes
4. **Impact Analysis**: Understand ripple effects of code changes

## Related

- Issue: #5 (Implement fold-radius neighborhood extraction)
- Depends on: #4 (Adjacency graph generation)
- Blocks: #6 (Atlas Frame export)
- Epic: LexBrain#2 (cross-repo Mind Palace)
