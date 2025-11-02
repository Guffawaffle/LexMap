# LexMap MCP Bridge

Model Context Protocol (MCP) bridge for LexMap code indexer.

## Tools

### codemap.get
List available codemap frames from LexBrain.

**Parameters:**
- `kind` (optional): Filter by frame kind
- `repo` (optional): Filter by repository
- `commit` (optional): Filter by commit hash

### codemap.slice
Return compact slice for a symbol with neighborhood context.

**Parameters:**
- `symbol` (required): Symbol FQN or ID
- `radius` (optional): Hop distance (default: 2)

### codemap.query
Run codemap queries.

**Parameters:**
- `type` (required): Query type - `callers`, `callees`, `module_deps`, `recent_patterns`, `violations`
- `args` (optional): Query-specific arguments as JSON object

### codemap.plan
Generate or fetch frozen AI execution plan.

**Parameters:**
- `mode` (required): `generate` or `fetch`
- `repo` (optional): Repository name
- `commit` (optional): Commit hash

### codemap.index
Execute indexing.

**Parameters:**
- `mode` (required): `cold` or `incremental`
- `plan_ai` (optional): Use AI planner
- `determinism_target` (optional): Min determinism ratio
- `heuristics` (optional): `off`, `hard`, or `auto`

### codemap.metrics
Fetch last-run metrics.

**Parameters:**
- `repo` (optional): Repository name
- `commit` (optional): Commit hash

### lexmap_get_atlas_frame
Get structural neighborhood data for modules (Atlas Frame).

**Parameters:**
- `module_scope` (required): Array of seed module IDs
- `fold_radius` (optional): How many hops to expand (default: 1)

**Output Format:**
```json
{
  "atlas_timestamp": "2025-11-01T23:17:00Z",
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
    }
  ],
  "critical_rule": "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming."
}
```

**Use Case:**
Enables LexBrain to generate visual/structural context cards for architectural navigation. The Atlas Frame provides a structured neighborhood view around specified modules, incorporating policy rules and architectural constraints.

## Usage

Start the MCP server:

```bash
codemap index --serve
```

The server will listen on `http://localhost:6902` and expose all tools via HTTP endpoints.

## Integration

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "lexmap": {
      "url": "http://localhost:6902",
      "manifest": "path/to/packages/codemap-mcp/manifest.json"
    }
  }
}
```
