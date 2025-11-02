# LexMap ↔ LexBrain Integration

This document shows how the schemas work together in practice.

## The Full Loop: Scanner → LexMap → LexBrain → AI Assistant

### Step 1: Scanner Observes Code

PHP scanner walks `barebones/integrations/hie/core/` and outputs facts:

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

**Scanner's job:** Just facts. No judgment.

---

### Step 2: LexMap Resolves to Modules

LexMap merge logic reads `lexmap.policy.json`:

```json
{
  "modules": {
    "hie/core": {
      "owns_paths": ["barebones/integrations/hie/core/"]
    }
  }
}
```

**Resolution:**
- Path `barebones/integrations/hie/core/SurescriptsClient.php` → module `hie/core`
- Import `TransportClientInterface` also in `hie/core` → no cross-module edge
- **Verdict:** ✅ On-policy

---

### Step 3: Developer Works on WEB-23621

User is debugging Create Endpoint button. Copilot chat shows:
- Stack trace from `ProviderEndpointsController`
- Test failures: "2 failing"
- Error: "TLS handshake timeout"

User hits `/remember`.

---

### Step 4: LexBrain Creates Frame

LexBrain:
1. Captures chat context (logs, errors, stack traces)
2. Auto-detects metadata:
   - Branch: `feature/WEB-23621_rle_tls_handshake`
   - Jira: `WEB-23621` (from branch name)
   - Module scope: Sees `ProviderEndpointsController` → queries LexMap → resolves to `ui/provider-endpoints`
   - Feature flags: Sees `enhanced_provider_lookup` in code
   - Permissions: Sees `upr_physician_list` check
3. Renders "memory card" image (monospace panel + header)
4. Stores Frame with metadata:

```json
{
  "timestamp": "2025-11-01T16:04:12-05:00",
  "branch": "feature/WEB-23621_rle_tls_handshake",
  "jira": ["WEB-23621"],
  "module_scope": ["hie/core", "ui/provider-endpoints"],
  "feature_flags": ["enhanced_provider_lookup"],
  "keywords": ["Create Endpoint disabled", "ProviderEndpointsController", "WEB-23621"]
}
```

**Critical:** `module_scope` values come from LexMap's canonical module IDs.

---

### Step 5: Later, User Asks for Help

User returns next day:

> "Where did we leave off on Create Endpoint?"

---

### Step 6: AI Assistant Uses Both Systems

**Assistant queries LexBrain:**
```
thought_recap({ query: "Create Endpoint" })
```

**LexBrain returns Frame:**
- Rendered image of stack traces + test failures
- Metadata: `module_scope: ["ui/provider-endpoints"]`
- Keywords match: "Create Endpoint disabled"

**Assistant queries LexMap:**
```
lexmap.describe_module({ module_id: "ui/provider-endpoints" })
```

**LexMap returns policy:**
```json
{
  "allowed_callers": ["api/provider-endpoints-service"],
  "forbidden_callers": ["hie/surescripts"],
  "requires_permissions": ["upr_physician_list"],
  "feature_flags": ["enhanced_provider_lookup"]
}
```

**Assistant synthesizes:**

> "Last work on Create Endpoint (WEB-23621) was at 4:04pm yesterday. You were debugging a TLS handshake timeout in the provider endpoints UI.
>
> **Status from Frame:**
> - 2 tests still failing
> - Blocker: ProviderEndpointsController wiring incomplete
> - Next action: Enable Create Endpoint button behind upr_physician_list permission
>
> **Policy check from LexMap:**
> - Module `ui/provider-endpoints` requires:
>   - Permission: `upr_physician_list` ✅ (you identified this)
>   - Feature flag: `enhanced_provider_lookup` ✅ (present)
>   - Must call `api/provider-endpoints-service`, NOT `hie/surescripts` directly
>
> The button is likely disabled because the controller wiring isn't complete. Want me to check if the current code violates the 'no direct surescripts calls' rule?"

---

## Why This Works

### Without the integration:
- **LexBrain alone:** "Here's what you were doing" (no architectural context)
- **LexMap alone:** "Here's the rules" (no temporal context)
- **Result:** AI has to guess why things are broken

### With the integration:
- **LexBrain:** "Here's the exact state when we stopped, including what was broken"
- **LexMap:** "Here's what the architecture requires"
- **AI:** "Here's the gap between what happened and what should happen"
- **Result:** Automated Drew Review with receipts

---

## The Critical Contracts

### 1. Module ID Alignment
```
LexMap modules = {"hie/core", "ui/provider-endpoints", ...}
                    ↓
LexBrain Frame.module_scope = ["hie/core", "ui/provider-endpoints"]
```

**If these don't match:** Search breaks, policy checks fail, AI hallucinates.

### 2. Feature Flag Alignment
```
LexMap policy: "enhanced_provider_lookup" gates ui/provider-endpoints
                    ↓
LexBrain Frame.feature_flags = ["enhanced_provider_lookup"]
```

**If these don't match:** Can't answer "why is this button disabled?"

### 3. Kill Pattern Recognition
```
Scanner detects: "duplicate_identifier_repo"
                    ↓
LexMap policy: global_kill_patterns = ["duplicate_identifier_repo"]
                    ↓
AI: "This file violates policy, should be removed"
```

**If these don't match:** Technical debt is invisible.

---

## Enforcement: The One Rule

> **`module_scope` values in LexBrain Frames MUST match `modules` keys in LexMap.**
>
> If you invent a new module name in a Frame, that name must first get added to LexMap.

### How to add a new module:

1. **Add to `lexmap.policy.json` first** (PR with review):
   ```json
   {
     "modules": {
       "api/new-service": {
         "description": "...",
         "owns_paths": ["..."],
         ...
       }
     }
   }
   ```

2. **Scanners discover it** (next scan):
   Files under those paths get tagged with module ID

3. **LexBrain can now use it** (automatic):
   When user hits `/remember`, LexBrain queries LexMap for module resolution

4. **AI can enforce it** (automatic):
   Policy violations detected when code crosses forbidden edges

---

## Implementation Checklist

To make this real:

- [ ] **LexMap:**
  - [ ] Create initial `lexmap.policy.json` with current modules
  - [ ] Build `lexmap.merge` tool to combine scanner outputs
  - [ ] Implement module resolver (path → module_id)
  - [ ] Implement policy checker (allowed_callers vs actual edges)

- [ ] **LexBrain:**
  - [ ] Add `module_scope` field to Frame schema
  - [ ] Query LexMap during `/remember` to resolve modules
  - [ ] Validate module IDs against LexMap before storing
  - [ ] Update `thought_recap` to include module metadata in results

- [ ] **Scanners:**
  - [ ] PHP scanner stub (emit declarations, imports, flags)
  - [ ] TypeScript scanner stub (emit components, imports, flags)
  - [ ] Python scanner stub (for tooling scripts)

- [ ] **Integration:**
  - [ ] LexBrain queries LexMap API for module resolution
  - [ ] AI assistant uses both tools in tandem
  - [ ] Error if Frame module_scope contains unknown module ID

---

## What You Get

With schemas checked in and the critical rule enforced:

✅ **Scanners → LexMap:** "Here's what the code actually does"
✅ **LexMap → LexBrain:** "Here's what the architecture allows"
✅ **LexBrain → AI:** "Here's what actually happened, with receipts"
✅ **AI → You:** "This is off-policy and here's exactly why"

That's not just dev convenience.

That's:
- Onboarding ("what does this module do?")
- Handoff ("where did we leave off?")
- Architecture conformance ("is this allowed?")
- Regulatory justification ("why is this gated?")
- Technical debt tracking ("where are the kill patterns?")

That's the product.

That's the moat.
