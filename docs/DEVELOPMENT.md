# LexMap Development Guide

This guide is for developers working on LexMap itself.

## Development Setup

Run the setup script:

```bash
./setup.sh
```

Or manually:

```bash
# Install Node dependencies
pnpm install -r

# Install PHP dependencies
cd packages/codemap-php && composer install && cd ../..

# Build all packages
pnpm -r build
```

## Package Overview

### codemap-indexer (TypeScript)

Main orchestrator and CLI.

**Dev workflow:**
```bash
cd packages/codemap-indexer
pnpm dev index --help
```

**Key modules:**
- `cli.ts` - Command definitions
- `commands/` - Command implementations
- `git.ts` - Git operations
- `hash.ts` - Deterministic hashing
- `compress.ts` - zstd compression
- `crypto.ts` - AES-GCM encryption
- `frames.ts` - Frame building/chunking
- `lexbrain.ts` - HTTP client
- `indexers/` - Language-specific indexers
- `planner/` - AI planning
- `server.ts` - MCP HTTP server

**Testing:**
```bash
pnpm test:smoke
```

### codemap-ts (TypeScript)

TS/JS indexer using ts-morph.

**Dev workflow:**
```bash
cd packages/codemap-ts
pnpm build
```

**Key modules:**
- `src/extract.ts` - Main extraction logic

### codemap-php (PHP)

PHP indexer using nikic/php-parser.

**Dev workflow:**
```bash
cd packages/codemap-php
composer install
php bin/index.php --help
```

**Key classes:**
- `PhpIndexer` - Main indexer
- `IndexerVisitor` - AST visitor

**Testing:**
```bash
echo "test.php" > test.txt
php bin/index.php --files @test.txt --base . --jsonl
```

### codemap-mcp (Config)

MCP manifest and documentation only.

## Making Changes

### Adding a New Language Indexer

1. Create new package: `packages/codemap-<lang>/`
2. Implement extraction logic (symbols, calls, modules)
3. Output same schema as codemap-ts/php
4. Add integration in `codemap-indexer/src/indexers/<lang>.ts`
5. Update index command to process new file types

### Adding a New MCP Tool

1. Add tool definition to `packages/codemap-mcp/manifest.json`
2. Add HTTP endpoint in `codemap-indexer/src/server.ts`
3. Implement logic in appropriate module

### Modifying Frame Schema

⚠️ **Breaking change** - requires LexBrain schema update

1. Update `types.ts` - FrameMeta interface
2. Update frame building in `frames.ts`
3. Update LexBrain client expectations
4. Version the schema (add `schema_version` field)

### Adding Heuristics

For PHP (or other dynamic languages):

1. Define pattern in policy: `lexmap.policy.json`
2. Implement resolution in `codemap-php/src/PhpIndexer.php`
3. Mark calls with `kind: 'heuristic'` and `confidence: 0.6-0.95`

## Testing Locally

### With Real LexBrain

```bash
# Start LexBrain (separate terminal)
cd /path/to/lexbrain
./start.sh

# Run indexer
pnpm index --cold --plan-ai
```

### Mock Mode (for development)

```bash
# Set fake endpoint
export LEXBRAIN_URL=http://localhost:9999

# Indexer will fail to PUT, but you can test extraction
pnpm index --cold 2>&1 | grep "Extracting code graph"
```

## Debugging

### Enable verbose logging

```bash
# Add to commands
console.log('DEBUG:', JSON.stringify(data, null, 2));
```

### Inspect frames before sending

```bash
# In commands/index.ts, before putFact()
console.log('Frame:', JSON.stringify(frame, null, 2));
```

### Test compression

```bash
node -e "
  import('./packages/codemap-indexer/dist/compress.js').then(m => {
    m.initCompress().then(() => {
      const data = { test: 'hello' };
      m.toB64(data).then(b64 => {
        console.log('Compressed:', b64);
        m.fromB64(b64).then(dec => {
          console.log('Decompressed:', dec);
        });
      });
    });
  });
"
```

### Test encryption

```bash
# Generate test key
export TEST_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Test encrypt/decrypt
node -e "
  const crypto = require('./packages/codemap-indexer/dist/crypto.js');
  const enc = crypto.encryptB64('$TEST_KEY', 'hello world');
  console.log('Encrypted:', enc);
  const dec = crypto.decryptB64('$TEST_KEY', enc.ivB64, enc.ctB64);
  console.log('Decrypted:', dec);
"
```

## Build System

### Clean build

```bash
pnpm -r exec rm -rf dist node_modules
pnpm install -r
pnpm -r build
```

### Watch mode

```bash
cd packages/codemap-indexer
pnpm dev -- --help
# Uses tsx for instant feedback
```

## Code Style

- **TypeScript**: Strict mode, ESM only
- **Indentation**: 2 spaces (TS/JS), 4 spaces (PHP)
- **Naming**: camelCase for functions/vars, PascalCase for types/classes
- **Imports**: Use .js extension for local imports (ESM requirement)
- **Error handling**: Always catch and log, exit(1) on fatal

## Performance Profiling

```bash
node --prof packages/codemap-indexer/dist/cli.js index --cold
node --prof-process isolate-*.log > profile.txt
```

## Release Process

1. Update version in all package.json files
2. Update CHANGELOG.md
3. Build: `pnpm -r build`
4. Tag: `git tag v0.x.x`
5. Push: `git push && git push --tags`

## Common Issues

### "Cannot find module"

Run `pnpm -r build` - TypeScript modules need compilation.

### "ECONNREFUSED localhost:8123"

LexBrain is not running. Start it first.

### "Parse error in PHP"

Check PHP syntax: `php -l path/to/file.php`

### TypeScript errors in IDE

Run `pnpm install` in package directory to get type definitions.

## Contributing

This is AI-only infrastructure. Review the code, run tests, ensure determinism is preserved.

Key principles:
1. **Deterministic** - Same inputs → same outputs
2. **Compressed** - Minimize storage/network
3. **Encrypted** - Optional but seamless
4. **Fast** - Incremental by default
5. **Auditable** - All decisions logged in metrics
