# LexMap Scanner Quickstart

This guide shows you how to go from "raw codebase" to "policy enforcement" in 5 commands.

## The Complete Flow

```
Codebase → Scanners → Merge → Policy Check → Violations Report
```

## Prerequisites

```bash
# Install scanner dependencies
pip install php-parser-python  # For PHP scanner
cd lexmap.scan && npm install  # For TypeScript scanner and merge tools
```

## Step 1: Create Your Policy File

Create `lexmap.policy.json` defining your module boundaries:

```json
{
  "modules": {
    "hie/core": {
      "owns_namespaces": ["App\\HIE\\Core"],
      "owns_paths": ["app/hie/core/**"],
      "exposes": ["SurescriptsClient", "IdentifierMapRepository"],
      "allowed_callers": ["hie/surescripts", "api/provider-endpoints-service"],
      "forbidden_callers": ["ui/**"],
      "feature_flags": ["enhanced_provider_lookup"],
      "requires_permissions": ["hie_core_read"],
      "kill_patterns": []
    },
    "ui/provider-endpoints": {
      "owns_paths": ["ui/provider-endpoints/**"],
      "forbidden_callers": [],
      "kill_patterns": ["ui_calling_hie_adapter_directly"]
    }
  },
  "global_kill_patterns": [
    {
      "pattern": "ui_calling_hie_adapter_directly",
      "description": "UI MUST NOT call HIE adapters directly"
    }
  ]
}
```

See `docs/schemas/policy.schema.json` for full specification.
See `docs/schemas/examples/lexmap.policy.example.json` for complete example.

## Step 2: Run Scanners

Scan your codebase with language-specific scanners:

```bash
# Scan PHP code
python3 lexmap.scan/php_scanner.py app/ > php-scan.json

# Scan TypeScript/JavaScript code
node lexmap.scan/ts_scanner.ts ui/ > ts-scan.json

# Scan Python code (if applicable)
python3 lexmap.scan/python_scanner.py backend/ > python-scan.json
```

Each scanner outputs JSON conforming to `docs/schemas/scanner-output.schema.json`.

## Step 3: Merge Scanner Outputs

Combine all scanner outputs into a single unified view:

```bash
node lexmap.scan/lexmap-merge.ts \
  php-scan.json \
  ts-scan.json \
  python-scan.json \
  > merged-scan.json
```

This deduplicates files and combines metadata.

## Step 4: Check Against Policy

Enforce architectural policy:

```bash
node lexmap.scan/lexmap-check.ts merged-scan.json lexmap.policy.json
```

Output:
```
❌ Found 2 violation(s):

File: ui/provider-endpoints/CreateEndpointModal.tsx
Module: ui/provider-endpoints
Type: forbidden_caller
Message: Module ui/provider-endpoints imports hie/surescripts but is forbidden
Details: Policy forbids: ui/**

File: app/hie/core/IdentifierMapRepository.php
Module: hie/core
Type: kill_pattern
Message: Kill pattern detected: duplicate_identifier_repo
Details: Multiple IdentifierRepository implementations found
```

Exit codes:
- `0` = No violations
- `1` = Violations found
- `2` = Error (file not found, invalid schema, etc.)

## Step 5: Integrate with CI

Add to your CI pipeline:

```yaml
# .github/workflows/lexmap-check.yml
name: LexMap Policy Check

on: [pull_request]

jobs:
  policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: |
          pip install php-parser-python
          cd lexmap.scan && npm install

      - name: Run scanners
        run: |
          python3 lexmap.scan/php_scanner.py app/ > php-scan.json
          node lexmap.scan/ts_scanner.ts ui/ > ts-scan.json

      - name: Merge outputs
        run: node lexmap.scan/lexmap-merge.ts php-scan.json ts-scan.json > merged.json

      - name: Check policy
        run: node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

## WEB-23621 Example (Complete Workflow)

Let's say you're working on ticket WEB-23621 (TLS handshake timeout + Create Endpoint disabled).

### 1. Scan your changes:

```bash
# You've modified these files:
# - app/hie/surescripts/SurescriptsClient.php
# - ui/provider-endpoints/CreateEndpointModal.tsx
# - app/api/provider-endpoints/ProviderEndpointsService.php

python3 lexmap.scan/php_scanner.py app/ > php-scan.json
node lexmap.scan/ts_scanner.ts ui/ > ts-scan.json
```

### 2. Merge:

```bash
node lexmap.scan/lexmap-merge.ts php-scan.json ts-scan.json > merged.json
```

### 3. Check policy:

```bash
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json --ticket WEB-23621
```

### 4. If violations found:

The checker tells you EXACTLY what's wrong:
```
❌ Violation: ui/provider-endpoints/CreateEndpointModal.tsx
   Module: ui/provider-endpoints
   Imports: App\HIE\Surescripts\SurescriptsAdapter
   Problem: UI modules MUST NOT import HIE adapters directly
   Policy: forbidden_callers includes "ui/**"
   Fix: Use api/provider-endpoints-service instead
```

### 5. Fix it:

Instead of:
```typescript
// ❌ Wrong: UI calling HIE adapter directly
import { SurescriptsAdapter } from 'app/hie/surescripts';
```

Do this:
```typescript
// ✅ Correct: UI calls API service
import { ProviderEndpointsService } from 'api/provider-endpoints-service';
```

### 6. Re-check:

```bash
node lexmap.scan/ts_scanner.ts ui/ > ts-scan.json
node lexmap.scan/lexmap-merge.ts php-scan.json ts-scan.json > merged.json
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

Output:
```
✅ No violations found
```

## LexBrain Integration

When you finish work on WEB-23621, capture the Frame:

```bash
# In VS Code Copilot chat:
/remember "Fixed TLS handshake timeout, wired Create Endpoint via API service"
```

LexBrain will:
1. Auto-detect metadata:
   - `jira: ["WEB-23621"]`
   - `branch: "feature/WEB-23621_rle_tls_handshake"`
   - `feature_flags: ["enhanced_provider_lookup"]`
2. Resolve file paths → `module_scope` using LexMap:
   - `app/hie/surescripts/SurescriptsClient.php` → `"hie/surescripts"`
   - `ui/provider-endpoints/CreateEndpointModal.tsx` → `"ui/provider-endpoints"`
3. Store Frame with this metadata

Later, when you (or someone else) asks:
```
/recall WEB-23621
```

LexBrain returns Frames with:
- Rendered memory card showing what you did
- `module_scope: ["hie/surescripts", "ui/provider-endpoints"]`
- `status_snapshot.next_action: "Enable Create Endpoint button behind permission"`

**The Critical Rule in action:**
- LexBrain `module_scope` values (`"hie/surescripts"`, `"ui/provider-endpoints"`)
- MUST match LexMap module keys from `lexmap.policy.json`
- This is the vocabulary alignment that makes the system work

## Validation

Validate scanner output and policy against schemas:

```bash
# Install ajv-cli
npm install -g ajv-cli

# Validate scanner output
ajv validate \
  -s docs/schemas/scanner-output.schema.json \
  -d php-scan.json

# Validate policy file
ajv validate \
  -s docs/schemas/policy.schema.json \
  -d lexmap.policy.json

# Validate LexBrain Frame metadata
ajv validate \
  -s docs/schemas/lexbrain-frame-metadata.schema.json \
  -d frame-metadata.json
```

## What You Get

**Before LexMap:**
- "Is this import allowed?" → ¯\\_(ツ)_/¯
- "Which module owns this file?" → Ask Drew
- "Did I violate architectural boundaries?" → Hope CI doesn't fail

**With LexMap:**
- "Is this import allowed?" → Policy says NO, forbidden_caller
- "Which module owns this file?" → hie/core (owns_paths match)
- "Did I violate boundaries?" → `lexmap check` tells you instantly

**With LexMap + LexBrain:**
- "What was I doing on WEB-23621?" → `/recall WEB-23621` shows Frame with full context
- "Which modules did I touch?" → `module_scope: ["hie/surescripts", "ui/provider-endpoints"]`
- "What's left to do?" → `status_snapshot.next_action` has the answer

## Next Steps

1. **Start simple:** Create `lexmap.policy.json` with 2-3 core modules
2. **Run scanners:** See what your codebase actually does
3. **Check policy:** Find existing violations
4. **Fix or acknowledge:** Either fix violations or update policy (with PR review)
5. **Add to CI:** Prevent future violations
6. **Iterate:** Add more modules as you understand boundaries better

## Questions?

Read:
- `docs/VISION.md` - Why scanners are dumb by design
- `docs/THE-FUTURE-MAP.md` - LexMap policy layer architecture
- `docs/schemas/README.md` - THE CRITICAL RULE
- `docs/schemas/INTEGRATION.md` - Complete integration walkthrough with examples

## The Philosophy (Quick Version)

**Scanners observe. LexMap enforces. LexBrain remembers.**

- **Scanners:** "Here's what the code does" (facts)
- **LexMap:** "Here's what the architecture allows" (policy)
- **LexBrain:** "Here's what actually happened" (temporal state)
- **AI Assistant:** "Here's why this matters and what to do next" (guidance with receipts)

That's the moat.
