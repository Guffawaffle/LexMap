# LexMap Quickstart Guide

This guide will help you get LexMap up and running on your codebase.

## Prerequisites

Ensure you have:
- **Node.js 22+** installed
- **pnpm** package manager
- **PHP 8.2+** with Composer
- **LexBrain** service running (default: `http://localhost:8123`)

## Installation

1. **Clone and install dependencies:**

```bash
cd /srv/lex-map
pnpm install -r
```

2. **Install PHP dependencies:**

```bash
cd packages/codemap-php
composer install
cd ../..
```

3. **Build all packages:**

```bash
pnpm -r build
```

## Basic Usage

### 1. Incremental Index (Default)

Indexes only changed files since the last commit:

```bash
pnpm --filter @lex/lexmap-indexer dev index
```

### 2. Cold Index (Full Rebuild)

Indexes the entire codebase from scratch:

```bash
pnpm --filter @lex/lexmap-indexer dev index --cold
```

### 3. AI-Planned Cold Index

Uses AI to plan sharding and budgets, freezes the plan for reproducibility:

```bash
pnpm --filter @lex/lexmap-indexer dev index --cold --plan-ai --determinism-target 0.95
```

### 4. Query a Symbol Slice

Get a compact context slice around a symbol:

```bash
pnpm --filter @lex/lexmap-indexer dev slice --symbol 'App\Service\UserService::createUser' --radius 2
```

### 5. Run Queries

```bash
# Find all callers of a function
pnpm --filter @lex/lexmap-indexer dev query --type callers --args '{"symbol":"myFunctionId"}'

# Find all callees
pnpm --filter @lex/lexmap-indexer dev query --type callees --args '{"symbol":"myFunctionId"}'

# Check for violations
pnpm --filter @lex/lexmap-indexer dev query --type violations
```

## Configuration

### Environment Variables

```bash
export LEXBRAIN_URL=http://localhost:8123
export LEXBRAIN_MODE=local  # or 'zk' for zero-knowledge
export LEXBRAIN_KEY_HEX=<64-char-hex-key>  # required for zk mode
```

### Policy File

Create `lexmap.policy.json` in your repo root:

```json
{
  "modules": {
    "patterns": [
      {"name": "core", "match": "src/core/**"},
      {"name": "services", "match": "src/services/**"}
    ],
    "allowed_deps": [
      {"from": "controllers", "to": "services"}
    ]
  },
  "heuristics": {
    "enable": true,
    "confidence": {"hard": 0.95, "soft": 0.6}
  },
  "determinism_target": 0.95
}
```

See [POLICY.md](./POLICY.md) for full documentation.

## Zero-Knowledge Mode

To enable client-side encryption:

1. **Generate a 256-bit AES key:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. **Set environment variables:**

```bash
export LEXBRAIN_MODE=zk
export LEXBRAIN_KEY_HEX=<your-64-char-hex-key>
```

3. **Run indexer:**

```bash
pnpm --filter @lex/lexmap-indexer dev index --mode zk --key-hex $LEXBRAIN_KEY_HEX
```

All frames will be encrypted client-side before sending to LexBrain.

## MCP Server

Start the MCP HTTP server for AI agent integration:

```bash
pnpm --filter @lex/lexmap-indexer dev index --serve
```

The server will listen on `http://localhost:6902` and expose:
- `/slice` - Symbol context slicing
- `/query` - Query endpoints
- `/metrics` - Prometheus metrics

## CI/CD Integration

The included GitHub Actions workflow (`.github/workflows/lexmap.yml`) provides:

- **Incremental indexing** on every push
- **Manual cold reindex** via workflow dispatch

Set these secrets in your repository:
- `LEXBRAIN_URL` - LexBrain endpoint
- `LEXBRAIN_MODE` - `local` or `zk`
- `LEXBRAIN_KEY_HEX` - Encryption key (for zk mode)

## Troubleshooting

### "Cannot connect to LexBrain"

Ensure LexBrain is running:
```bash
curl http://localhost:8123/health
```

### "Parse errors in PHP files"

Check PHP syntax:
```bash
php -l path/to/file.php
```

### "Determinism ratio too low"

Increase heuristics or adjust target:
```bash
pnpm --filter @lex/lexmap-indexer dev index --determinism-target 0.90 --heuristics auto
```

### "Frame size exceeds limit"

Frames are automatically chunked at 200KB. If you see this, it's a bug - please report.

## Next Steps

- Read [POLICY.md](./POLICY.md) to configure module boundaries and dependencies
- Explore the MCP bridge in `packages/codemap-mcp`
- Review metrics at `http://localhost:6902/metrics` when running with `--serve`

## Support

This is AI-only infrastructure. Consult the source code and inline documentation for implementation details.
