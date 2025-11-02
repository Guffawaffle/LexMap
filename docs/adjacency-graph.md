# Adjacency Graph Generation

## Overview

The adjacency graph feature generates a derived graph that shows which modules can legally communicate, based on `allowed_callers` and `forbidden_callers` in the LexMap policy.

## Output Format

```json
{
  "adjacency": {
    "module-a": ["module-b", "module-c"],
    "module-b": ["module-a"]
  },
  "forbidden": {
    "module-a": ["module-d"],
    "module-d": ["module-a"]
  }
}
```

### Fields

- **adjacency**: Record of module IDs to arrays of modules they can communicate with
- **forbidden**: Record of module IDs to arrays of modules they are explicitly forbidden from communicating with

## Usage

### Programmatic API

```typescript
import { generateAdjacencyGraph } from '@lex/lexmap-indexer/dist/adjacency.js';

// Load your policy
const policy = {
  modules: {
    'services/auth-core': {
      description: 'Core auth abstractions',
      allowed_callers: ['api/user-access-service'],
      forbidden_callers: []
    },
    'ui/admin-panel': {
      description: 'Admin UI',
      allowed_callers: ['api/user-access-service'],
      forbidden_callers: ['services/auth-core']
    }
  }
};

// Generate adjacency graph
const graph = generateAdjacencyGraph(policy);

console.log(graph.adjacency);
// {
//   'services/auth-core': ['api/user-access-service'],
//   'api/user-access-service': ['services/auth-core', 'ui/admin-panel'],
//   'ui/admin-panel': ['api/user-access-service']
// }

console.log(graph.forbidden);
// {
//   'ui/admin-panel': ['services/auth-core'],
//   'services/auth-core': ['ui/admin-panel']
// }
```

### CLI Tool

```bash
# Generate adjacency graph in JSON format
node lexmap.scan/lexmap-adjacency.ts lexmap.policy.json

# Generate in human-readable text format
node lexmap.scan/lexmap-adjacency.ts lexmap.policy.json --format text

# Save to file
node lexmap.scan/lexmap-adjacency.ts lexmap.policy.json --output adjacency.json
```

## Supported Policy Formats

The adjacency graph generator supports two policy formats:

### 1. Module Callers Format (Newer)

Uses `allowed_callers` and `forbidden_callers` fields in module definitions:

```json
{
  "modules": {
    "services/auth-core": {
      "description": "Core auth abstractions",
      "allowed_callers": ["api/user-access-service"],
      "forbidden_callers": ["ui/admin-panel"]
    }
  }
}
```

**Behavior**: Creates **bidirectional** edges. If module A allows module B to call it, both A→B and B→A edges are added.

### 2. Allowed Dependencies Format (Legacy)

Uses `patterns` and `allowed_deps` arrays:

```json
{
  "modules": {
    "patterns": [
      { "name": "controllers", "match": "app/Controllers/**" },
      { "name": "services", "match": "app/Services/**" }
    ],
    "allowed_deps": [
      { "from": "controllers", "to": "services" }
    ]
  }
}
```

**Behavior**: Creates **unidirectional** edges. Only the specified direction is added to the adjacency graph.

## Caching

The adjacency graph generation includes built-in caching for performance:

```typescript
// With caching (default)
const graph1 = generateAdjacencyGraph(policy, true);

// Without caching
const graph2 = generateAdjacencyGraph(policy, false);

// Clear cache
import { clearAdjacencyCache } from '@lex/lexmap-indexer/dist/adjacency.js';
clearAdjacencyCache();
```

Cache is automatically invalidated when the policy changes (based on content hash).

## Testing

Unit tests are included in `packages/codemap-indexer/tests/adjacency.test.mjs`:

```bash
cd packages/codemap-indexer
pnpm test:adjacency
```

Tests cover:
- Module callers format (bidirectional edges)
- Allowed deps format (unidirectional edges)
- Caching behavior
- Empty policies
- Duplicate prevention

## Integration with LexBrain

The adjacency graph can be exported as a LexBrain frame for use in neighborhood extraction and atlas visualization:

```typescript
// Future integration example
import { generateAdjacencyGraph } from '@lex/lexmap-indexer/dist/adjacency.js';
import { createFrame } from '@lex/lexmap-indexer/dist/frames.js';

const graph = generateAdjacencyGraph(policy);
const frame = createFrame('codemap.adjacency', graph, scope);
// Upload to LexBrain for visualization
```

## Use Cases

1. **Neighborhood Extraction**: Find all modules that can communicate with a given module
2. **Atlas Frame Export**: Visualize module communication patterns
3. **Policy Validation**: Verify that actual code dependencies match policy
4. **Architecture Documentation**: Generate living documentation of module relationships
5. **Impact Analysis**: Determine which modules are affected by changes to a given module

## API Reference

### `generateAdjacencyGraph(policy, useCache?): AdjacencyGraph`

Generates adjacency graph from policy object.

**Parameters:**
- `policy`: Policy object in either format
- `useCache` (optional): Whether to use caching (default: `true`)

**Returns:** `AdjacencyGraph` object with `adjacency` and `forbidden` fields

### `clearAdjacencyCache(): void`

Clears the adjacency graph cache.

### `getAdjacencyCacheSize(): number`

Returns the current size of the adjacency graph cache.

## Related

- Issue: [LexMap] Generate adjacency graph from policy
- Epic: LexBrain#2 (cross-repo Mind Palace)
- Depends on: Spatial coordinates (LexMap feature complete)
- Blocks: Neighborhood extraction (#3), Atlas Frame export (#4)
