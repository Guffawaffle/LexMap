# LexMap Schemas

This directory contains the canonical schema contracts that define how LexMap, LexBrain, and language scanners communicate.

## The Three Core Schemas

### 1. Scanner Output (`scanner-output.schema.json`)

**Purpose:** Contract for language scanner plugins.

**What it does:** Language scanners (PHP, TypeScript, Python, etc.) observe code and emit structured facts **without architectural judgment**. They just answer:
- "What symbols did this file define?"
- "What symbols did it reference?"
- "What flags/permissions did it touch?"

**Who produces it:** Language scanner plugins (`php_scanner.py`, `js_scanner.ts`, etc.)

**Who consumes it:** LexMap merge logic resolves these raw facts into module boundaries and policy violations.

**Key principle:** Scanners are dumb by design. They never edit `lexmap.policy.json`. They just describe what exists.

---

### 2. Policy File (`policy.schema.json`)

**Purpose:** Canonical architectural truth for the repository.

**What it does:** Defines:
- Module boundaries (`owns_namespaces`, `owns_paths`)
- Allowed/forbidden call edges (`allowed_callers`, `forbidden_callers`)
- Feature flags and permissions that gate behavior
- Kill patterns (anti-patterns to eliminate)

**Who owns it:** You. This file is **human-reviewed and versioned**. Updating it is a PR.

**Who consumes it:**
- LexMap merge logic (to validate scanner output against policy)
- LexBrain (to tag Frames with canonical module IDs)
- AI assistants (to judge "is this code on-policy?")

**Key principle:** This is sacred. Module IDs here are the only valid `module_scope` values in LexBrain Frames.

---

### 3. LexBrain Frame Metadata (`lexbrain-frame-metadata.schema.json`)

**Purpose:** Metadata structure for LexBrain memory Frames.

**What it does:** Tags each Frame with:
- `module_scope`: which modules were touched
- `feature_flags`: which flags are relevant
- `keywords`: searchable tokens for recall
- `status_snapshot`: tests failing, blockers, next actions

**Who produces it:** LexBrain when user hits `/remember` or end-of-session.

**Who consumes it:**
- LexBrain retrieval (`thought_recap`)
- AI assistants (to resume work context)
- Audit/review tools (to track what happened when)

**Key principle:** Uses **exact same vocabulary** as LexMap policy. `module_scope` values MUST be valid module keys from `lexmap.policy.json`.

---

## The Critical Rule: Vocabulary Alignment

> **`module_scope` values in LexBrain Frames MUST match `modules` keys in LexMap.**
>
> If you invent a new module name in a Frame, that name must first get added to LexMap.

This is the bridge between temporal state (LexBrain) and structural truth (LexMap).

This is how the AI can say "this violates policy" with authority, not vibes.

This is your moat.

---

## Example Flow

1. **Scanner observes code:**
   ```json
   {
     "language": "php",
     "files": [{
       "path": "barebones/integrations/hie/core/SurescriptsClient.php",
       "declares": ["barebones\\integrations\\hie\\core\\SurescriptsClient"],
       "imports": ["barebones\\integrations\\hie\\core\\Contracts\\TransportClientInterface"]
     }]
   }
   ```

2. **LexMap resolves to modules using policy:**
   - Path `barebones/integrations/hie/core/` → module `hie/core`
   - Import references `TransportClientInterface` → also in `hie/core`
   - No cross-module edge detected

3. **User works on WEB-23621, hits `/remember`:**
   ```json
   {
     "module_scope": ["hie/core", "ui/provider-endpoints"],
     "keywords": ["Create Endpoint disabled", "ProviderEndpointsController", "WEB-23621"]
   }
   ```

4. **AI assistant recalls Frame and checks policy:**
   - Query LexMap: "Is `ui/provider-endpoints` allowed to call `hie/surescripts`?"
   - LexMap says: "FORBIDDEN"
   - Assistant: "Your UI path is still off-policy. UI should call provider-endpoints-service, not surescripts directly."

---

## Schema Validation

These schemas are JSON Schema Draft 7 format. Validate with:

```bash
# Example with ajv-cli
ajv validate -s scanner-output.schema.json -d scanner-output-example.json
```

---

## Contributing

When adding a new language scanner:
1. Output must conform to `scanner-output.schema.json`
2. You never edit `lexmap.policy.json` directly
3. LexMap core will handle module resolution and policy checking

When adding a new module to the codebase:
1. Add it to `lexmap.policy.json` first (PR with review)
2. Define `owns_paths`/`owns_namespaces`, allowed edges, flags, etc.
3. Then LexBrain can start using that module ID in Frames

---

## Why These Schemas Matter

### Without them:
- "AI notes" that can't be queried
- Architecture docs that nobody trusts
- "What was I doing on WEB-23621?" → guesswork

### With them:
- **Scanners → LexMap:** "Here's what the code actually does"
- **LexMap → LexBrain:** "Here's what the architecture allows"
- **LexBrain → AI:** "Here's what actually happened, with receipts"
- **Result:** "This is off-policy and here's exactly why"

That's the product.

That's the moat.

That's why you're checking in schemas instead of relying on vibes.
