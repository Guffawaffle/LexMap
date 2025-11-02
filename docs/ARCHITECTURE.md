# LexMap Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         LexMap Ecosystem                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │   AI Agent   │ ◄─MCP─► │  codemap-mcp │                      │
│  │  (Claude,    │         │   manifest   │                      │
│  │   GPT, etc)  │         │  (port 6902) │                      │
│  └──────────────┘         └──────┬───────┘                      │
│                                   │                               │
│                                   ▼                               │
│  ┌─────────────────────────────────────────────────────┐        │
│  │          codemap-indexer (Orchestrator)              │        │
│  ├─────────────────────────────────────────────────────┤        │
│  │  CLI Commands:                                       │        │
│  │   • index  (cold/incremental, plan-ai)              │        │
│  │   • slice  (symbol neighborhood extraction)         │        │
│  │   • query  (callers/callees/violations)             │        │
│  │                                                       │        │
│  │  Core Modules:                                       │        │
│  │   ┌─────────┐  ┌─────────┐  ┌──────────┐           │        │
│  │   │   Git   │  │  Hash   │  │ Compress │           │        │
│  │   │ Tracker │  │ (SHA256)│  │  (zstd)  │           │        │
│  │   └─────────┘  └─────────┘  └──────────┘           │        │
│  │                                                       │        │
│  │   ┌─────────┐  ┌─────────┐  ┌──────────┐           │        │
│  │   │ Crypto  │  │ Frames  │  │ LexBrain │           │        │
│  │   │(AES-GCM)│  │ Builder │  │  Client  │           │        │
│  │   └─────────┘  └─────────┘  └──────────┘           │        │
│  │                                                       │        │
│  │   ┌─────────┐  ┌─────────┐  ┌──────────┐           │        │
│  │   │  Policy │  │   AI    │  │   HTTP   │           │        │
│  │   │ Loader  │  │ Planner │  │  Server  │           │        │
│  │   └─────────┘  └─────────┘  └──────────┘           │        │
│  └───────────────┬──────────────────┬──────────────────┘        │
│                  │                  │                            │
│                  ▼                  ▼                            │
│  ┌───────────────────┐  ┌────────────────────┐                 │
│  │   codemap-ts      │  │   codemap-php      │                 │
│  ├───────────────────┤  ├────────────────────┤                 │
│  │  • ts-morph       │  │  • nikic/php-parser│                 │
│  │  • Static calls   │  │  • Static calls    │                 │
│  │  • Type info      │  │  • Heuristics      │                 │
│  │  • Modules        │  │  • DI patterns     │                 │
│  └───────────────────┘  └────────────────────┘                 │
│                                                                   │
│                          │                                       │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────┐        │
│  │              LexBrain (External Service)             │        │
│  ├─────────────────────────────────────────────────────┤        │
│  │  Facts Storage (append-only):                        │        │
│  │   • codemap.symbols   - All definitions             │        │
│  │   • codemap.calls     - Call graph edges            │        │
│  │   • codemap.modules   - Module dependencies         │        │
│  │   • codemap.patterns  - Mined flows & n-grams       │        │
│  │   • codemap.slice     - Context slices              │        │
│  │   • codemap.plan      - Frozen AI plans             │        │
│  │   • codemap.metrics   - Run statistics              │        │
│  │                                                       │        │
│  │  Deduplication: frame_id = sha256(kind|scope|hash)  │        │
│  │  Payload: base64(zstd(JSON)) or encrypted           │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Incremental Index Flow

```
Git Working Tree
      │
      ▼
┌──────────────┐
│ Git ls-files │ ───► Get changed files since last commit
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Filter by ext    │ ───► .ts, .tsx, .js, .jsx → codemap-ts
│ (.ts, .js, .php) │      .php → codemap-php
└──────┬───────────┘
       │
       ├──────────┐
       ▼          ▼
┌─────────┐  ┌─────────┐
│   TS    │  │   PHP   │
│ Indexer │  │ Indexer │
└────┬────┘  └────┬────┘
     │            │
     └──────┬─────┘
            ▼
    ┌──────────────┐
    │ Merge graphs │
    │ symbols[]    │
    │ calls[]      │
    │ modules[]    │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Compute      │
    │ det_ratio    │ ───► edges_static / edges_total
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Build frames │ ───► Compress, chunk ≤200KB
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Encrypt?     │ ───► If mode=zk, AES-GCM
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ PUT to       │
    │ LexBrain     │ ───► HTTP POST /facts
    └──────────────┘
```

### 2. Cold Index with AI Planning

```
Repo Analysis
      │
      ▼
┌──────────────┐
│ AI Planner   │ ───► Analyze file counts, types, sizes
│ (generatePlan)│      Generate sharding strategy
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Freeze Plan  │ ───► Store as codemap.plan fact
│ as Fact      │      Include in inputs_hash
└──────┬───────┘
       │
       ▼
   [Continue as Incremental Index...]
```

### 3. Slice Query Flow

```
AI Agent Request
      │
      ▼
┌──────────────┐
│ MCP Tool:    │
│ codemap.slice│ ───► symbol="Foo::bar", radius=2
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ GET facts    │ ───► Fetch codemap.symbols + codemap.calls
│ from LexBrain│
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Decompress   │ ───► zstd decompress all frames
│ all chunks   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ BFS from     │ ───► Breadth-first search from symbol
│ target symbol│      Distance ≤ radius
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Return JSON  │ ───► { target, symbols[], calls[] }
│ slice        │
└──────────────┘
```

## Frame Structure

### Unencrypted Frame

```json
{
  "frame_id": "sha256(kind|scope|inputs_hash|blob_hash)",
  "kind": "codemap.symbols",
  "scope": {
    "repo": "my-app",
    "commit": "abc123...",
    "path": "src/services/",
    "symbol": null
  },
  "inputs_hash": "def456...",
  "payload_b64": "KLUv/QBY...base64(zstd(JSON))",
  "part": 1,
  "total_parts": 3,
  "ts": "2025-11-01T12:00:00.000Z",
  "stats": {
    "symbols_count": 1500,
    "compressed_kb": 45
  }
}
```

### Encrypted Frame (ZK mode)

```json
{
  "frame_id": "sha256(...)",
  "kind": "codemap.symbols",
  "scope": { "repo": "...", "commit": "..." },
  "inputs_hash": "...",
  "payload_b64": "{\"ivB64\":\"...\",\"ctB64\":\"...\"}",
  "ts": "2025-11-01T12:00:00.000Z"
}
```

The `payload_b64` contains JSON-encoded encrypted payload:
- `ivB64`: AES-GCM initialization vector (base64)
- `ctB64`: Ciphertext + auth tag (base64)
- AAD: `kind|frame_id`

## Determinism Guarantees

### Inputs Hash Computation

```javascript
inputs_hash = sha256({
  langVersions: { node: "22.0.0", typescript: "5.6.3" },
  config: {
    determinism_target: 0.95,
    heuristics: "auto",
    php_workers: 4,
    ts_workers: 4
  },
  git: {
    head: "abc123...",
    files: [
      { path: "src/index.ts", blobSha: "def456..." },
      { path: "src/util.ts", blobSha: "789abc..." }
    ]
  },
  policy: { ... },  // Optional
  plan: { ... }     // If --plan-ai
})
```

Same inputs → same inputs_hash → LexBrain deduplicates → `inserted: false`

### Heuristics Ladder

```
Static Pass → Compute det_ratio
                  │
                  ▼
          det_ratio >= target?
                  │
         ┌────────┴────────┐
         YES               NO
         │                 │
         ▼                 ▼
    Done             Enable heuristics
                           │
                     ┌─────┴─────┐
                     │           │
                  hard         soft
                 (0.95)       (0.6)
```

## Policy Enforcement

```
Code Changes → Index → Extract graph
                          │
                          ▼
                   ┌──────────────┐
                   │ Check policy │
                   └──────┬───────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    Kill patterns?   Module deps?   Allowed deps?
          │               │               │
          YES             │               │
          │               ▼               ▼
    Exclude file    Map to module   Check allowed_deps[]
                          │               │
                          └───────┬───────┘
                                  ▼
                            Violations?
                                  │
                          ┌───────┴───────┐
                          YES             NO
                          │               │
                          ▼               ▼
                    Report in         Continue
                    metrics fact      indexing
```

## MCP Tool Integration

```
AI Agent
    │
    ▼
┌─────────────────┐
│ MCP Client      │
│ (VS Code, etc)  │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│ LexMap Server   │ :6902
│ (tiny HTTP)     │
├─────────────────┤
│ POST /slice     │ → sliceCommand()
│ POST /query     │ → queryCommand()
│ GET  /metrics   │ → Prometheus
└─────────────────┘
```

Tools available:
1. `codemap.get` - List frames
2. `codemap.slice` - Extract symbol context
3. `codemap.query` - Run queries (callers/callees/deps/violations)
4. `codemap.plan` - Generate/fetch plans
5. `codemap.index` - Trigger indexing
6. `codemap.metrics` - Fetch stats

## Security Model

### Local Mode
- Frames stored as compressed JSON in LexBrain
- Trust boundary: LexBrain server

### Zero-Knowledge Mode
- Client-side encryption (AES-256-GCM)
- LexBrain stores ciphertext only
- Key never leaves client
- Trust boundary: Client machine only

```
Local Mode:     plaintext → compress → base64 → LexBrain
ZK Mode:        plaintext → compress → base64 → encrypt → LexBrain
```

## Performance Characteristics

| Operation | Cold (1000 files) | Incremental (10 files) |
|-----------|-------------------|------------------------|
| Parse     | ~30s              | ~1s                    |
| Compress  | ~2s               | ~100ms                 |
| Encrypt   | ~500ms            | ~50ms                  |
| PUT       | ~5s (chunked)     | ~200ms                 |
| **Total** | **~40s**          | **~2s**                |

Frames:
- Compression ratio: ~70% (zstd level 10)
- Chunk size: ≤200KB (configurable)
- Avg frame: ~50KB compressed

## Extension Points

1. **New language indexer**: Implement same schema, add to CLI
2. **Custom heuristics**: Define in policy, implement resolution
3. **Pattern mining**: Extend `miner/patterns.ts`
4. **AI planner**: Replace heuristic logic with LLM API
5. **MCP tools**: Add endpoints in `server.ts`

This architecture ensures:
- **Reproducibility** via deterministic inputs
- **Scalability** via chunking and compression
- **Security** via optional encryption
- **Extensibility** via policy and plugin points
