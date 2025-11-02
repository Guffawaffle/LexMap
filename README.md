# LexMap

**Architecture policy as code, enforced in CI.**

LexMap is a pluggable architectural policy enforcement system. It defines module boundaries, allowed/forbidden call edges, feature flags, permissions, and anti-patterns in a machine-readable JSON file (`lexmap.policy.json`). It then checks your codebase against that policy and tells you what's broken—before PR review.

---

## What is LexMap?

LexMap solves a specific problem: in large codebases, architectural rules live in tribal knowledge, wikis, or "ask the one senior dev who knows."

Those rules rot. PRs violate them. Engineers waste time re-explaining "no, the admin UI can't call auth-core directly."

LexMap fixes that by making architecture policy **explicit, versioned, and enforceable**.

You define modules in `lexmap.policy.json`:
- What code each module owns
- Who's allowed to call it
- Who's forbidden from calling it
- What feature flags gate it
- Which permissions protect it
- Which anti-patterns ("kill patterns") we're actively deleting

Then you run:

```bash
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

It tells you:
- ✅ Clean (exit 0)
- ❌ Violations: forbidden edges, missing permissions, kill patterns detected (exit 1)
- 🛑 Tool error (exit 2)

You wire that into CI. Now violations are caught before they merge.

---

## What Problems Does LexMap Solve?

### Before LexMap

- "Is this admin UI allowed to call that auth service directly?"
  - Answer: "Ask the one person who knows. They're on vacation."
- PR gets merged with a forbidden dependency.
- Six months later: "Why is this button disabled?"
  - Answer: "No idea. Let me grep for it."

### After LexMap

- "Is this admin UI allowed to call that auth service directly?"
  - Answer: `lexmap check` → "Violation: `ui/user-admin-panel` called `services/auth-core`, which is forbidden. Must go through `services/user-access-api`."
- PR fails CI. You fix it before merge.
- Six months later: "Why is this button disabled?"
  - Answer: "The UI is calling a forbidden service. Here's the policy violation from `lexmap check`. Here's the timestamped Frame from LexBrain showing when you diagnosed it last night."

That's the difference.

---

## How It Works

LexMap has four steps:

### 1. **Scanners** (dumb by design)

Per-language analyzers that walk code and emit simple facts:
- "This file declared class X"
- "It imported Y"
- "It referenced feature flag Z"
- "It enforced permission U"
- "It smells like kill pattern K"

Scanners do **not** make architecture decisions. They just observe.

Example:

```bash
# Scan PHP
python3 lexmap.scan/php_scanner.py src/ > php-scan.json

# Scan TypeScript / React
node lexmap.scan/ts_scanner.ts web-ui/ > ts-scan.json
```

### 2. **Merge**

Combine multiple scanner outputs into one `merged.json`:

```bash
node lexmap.scan/lexmap-merge.ts php-scan.json ts-scan.json > merged.json
```

### 3. **Check**

Compare `merged.json` against `lexmap.policy.json` and report violations:

```bash
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

Exit codes:
- `0` = clean
- `1` = violations
- `2` = tool error

### 4. **Enforce in CI**

Add this to your CI pipeline:

```yaml
- name: LexMap Check
  run: |
    node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

Now violations block merges.

---

## THE CRITICAL RULE

> **THE CRITICAL RULE:**
> Every module name used anywhere in the system MUST match the IDs in `lexmap.policy.json`.
> That includes:
> - `module_scope` inside LexBrain Frames,
> - `allowed_callers` and `forbidden_callers` in LexMap policy,
> - anything we show in violation reports,
> - anything the assistant says back to the user.
>
> No ad hoc naming. No "kind of the same module but spelled different."
> The vocabulary stays consistent or the whole loop breaks.

This rule is the bridge between LexMap (policy) and LexBrain (memory). It's what lets an assistant say:

> "The Add User button is still disabled because the admin UI is calling a forbidden service. Here's the policy violation. Here's the timestamped Frame from last night."

That's not vibes. That's **receipts**.

---

## Quick Start

Try LexMap in under 5 minutes:

### 1. Clone the repo

```bash
git clone https://github.com/yourorg/lexmap.git /srv/lex-map
cd /srv/lex-map
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Define one module in `lexmap.policy.json`

```json
{
  "modules": {
    "ui/user-admin-panel": {
      "owns_paths": ["web-ui/admin/**"],
      "allowed_callers": [],
      "forbidden_callers": ["services/auth-core"],
      "notes": "Admin UI cannot call auth-core directly. Must use services/user-access-api."
    }
  }
}
```

### 4. Scan your codebase

```bash
node lexmap.scan/ts_scanner.ts web-ui/ > ts-scan.json
```

### 5. Check for violations

```bash
node lexmap.scan/lexmap-check.ts ts-scan.json lexmap.policy.json
```

If you get violations, fix them. If you get exit 0, you're clean.

---

## Status

LexMap is **alpha**.

- Scanners work but are naive (PHP scanner uses regex; TS scanner uses TypeScript compiler API; Python scanner uses `ast`)
- You can run this today and get real value if you're willing to define 1–2 modules in `lexmap.policy.json`
- CI gating works right now
- Multi-language support (PHP, TS/JS, Python) is functional but evolving

We are **not** claiming:
- Fully polished product
- Cloud service
- Magical AI autonomy
- Security audit tooling

We **are** claiming:
- Architecture policy as code, enforced in CI
- That your assistant can understand and reason about later

---

## LexBrain Integration (Companion Project)

**LexBrain** is persistent working memory for engineers.

When you hit `/remember` at the end of a debugging session, LexBrain captures a **Frame**:
- A rendered "memory card" image (failing tests, stack trace, next action)
- The raw text behind it
- Structured metadata: timestamp, branch, ticket ID, `module_scope`, feature flags, permissions, `next_action`

Later, when you ask "What was blocking TICKET-123 yesterday?", LexBrain returns that Frame.

Because LexBrain stores `module_scope` using LexMap's module IDs (THE CRITICAL RULE), your assistant can cross-check against policy:

> "The Add User button is still disabled because the admin UI (`ui/user-admin-panel`) is calling `services/auth-core` directly, which is forbidden. Policy says it must go through `services/user-access-api`. Here's the timestamped Frame from last night."

You can run LexMap standalone. You add LexBrain when you want persistent, policy-aware memory across work sessions.

---

## Learn More

- [Overview](./docs/OVERVIEW.md) — why this should exist at your company
- [Adoption Guide](./docs/ADOPTION_GUIDE.md) — how to roll this out without starting a war
- [Architecture Loop](./docs/ARCHITECTURE_LOOP.md) — the closed-loop moat
- [FAQ](./docs/FAQ.md) — "Is this just a linter?"
- [Contributing](./CONTRIBUTING.md) — how to add a new scanner

---

## License

See [LICENSE](./LICENSE)

**Start MCP Server:**
```bash
pnpm --filter @lex/lexmap-indexer dev index --serve
```

See [QUICKSTART.md](./QUICKSTART.md) for detailed setup instructions.

## Configuration

### Environment Variables

```bash
LEXBRAIN_URL=http://localhost:8123
LEXBRAIN_MODE=local|zk
LEXBRAIN_KEY_HEX=<64-char-hex-when-zk>
```

### Policy File (optional)

Create `lexmap.policy.json` at your repo root:

```json
{
  "modules": {
    "patterns": [
      {"name":"core", "match":"src/core/**"}
    ],
    "allowed_deps": [
      {"from":"controllers","to":"services"},
      {"from":"services","to":"repositories"}
    ]
  },
  "kill_patterns": [
    {"kind":"pass_through_wrapper","match":"*/WrapperClass.php"}
  ],
  "heuristics": {
    "enable": true,
    "di_patterns": [
      {"kind":"container_get","match":"$container->get('%s')"}
    ],
    "confidence": {"hard": 0.95, "soft": 0.6}
  },
  "determinism_target": 0.95
}
```

See [POLICY.md](./POLICY.md) for detailed documentation.

## LexBrain Integration

Frames are stored as facts with these kinds:
- `codemap.symbols` – Symbol definitions
- `codemap.calls` – Call graph edges
- `codemap.modules` – Module dependency graph
- `codemap.patterns` – Mined patterns (flows, AST n-grams)
- `codemap.slice` – Compact context slices
- `codemap.plan` – Frozen AI execution plan
- `codemap.metrics` – Run statistics

**Scope:** `{ repo, commit, path?, symbol? }`
**Deduplication:** Facts are keyed by `frame_id = sha256(kind|scope|inputs_hash|blob_hash)`

## CLI Reference

```bash
codemap index [options]
  --cold                    Full rebuild (default: incremental)
  --plan-ai                 Use AI planner for sharding/budgets
  --determinism-target N    Min static edge ratio (default: 0.95)
  --heuristics <mode>       off|hard|auto (default: auto)
  --lexbrain <url>          LexBrain endpoint
  --mode <mode>             local|zk
  --key-hex <hex>           AES key for zk mode
  --php-workers N           PHP parser concurrency (default: 4)
  --ts-workers N            TS parser concurrency (default: 4)
  --policy <path>           Policy JSON file
  --serve                   Start HTTP server for MCP

codemap slice [options]
  --symbol <FQN|SymId>      Symbol to slice
  --radius N                Hop distance (default: 2)
  --lexbrain <url>          LexBrain endpoint

codemap atlas-frame [options]
  --module-scope <modules>  Comma-separated seed module IDs
  --fold-radius N           How many hops to expand (default: 1)
  --policy <path>           Policy JSON file
  --lexbrain <url>          LexBrain endpoint

codemap query [options]
  --type <type>             callers|callees|module_deps|recent_patterns|violations
  --args <json>             Query-specific arguments
```

## Development

**Run tests:**
```bash
pnpm --filter @lex/lexmap-indexer test:smoke
```

**Build all packages:**
```bash
pnpm -r build
```

## License

MIT © 2025 Guffawaffle
