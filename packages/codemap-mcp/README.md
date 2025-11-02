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
