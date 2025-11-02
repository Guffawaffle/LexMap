# THE_FUTURE-MAP.md

(LexMap / Structural Reality / Policy + Conformance Layer)

## 0. Goal

LexMap is the structural truth of the codebase.

LexBrain remembers *what you were doing and why* (temporal state).
LexMap defines *how the codebase is supposed to be shaped* (architectural state).

LexMap must:

* describe module boundaries and ownership,
* declare allowed/forbidden call paths,
* define canonical names for things so that metadata stays stable,
* expose those definitions in a way an assistant can use to judge “is this code aligned with policy or is this legacy drift?”

LexMap is what lets an assistant say:

> "ProviderEndpointsController is still calling the legacy thing in `hie/surescripts`, which violates the rule that Surescripts should go through `hie/core` now."

LexMap + LexBrain = "what actually happened vs what should have happened," with receipts.

---

## THE CRITICAL RULE

> **`module_scope` values in LexBrain Frames MUST match `modules` keys in LexMap.**
>
> If you invent a new module name in a Frame, that name must first get added to LexMap.

This is how we avoid drift. This is how we let AI say "this violates policy" with authority, instead of vibes.

This is your real moat. Consistency of naming.

**Canonical Schemas:** See `docs/schemas/` for the contracts:
- `scanner-output.schema.json` - what language scanners must produce
- `policy.schema.json` - the LexMap policy file structure (this document describes)
- `lexbrain-frame-metadata.schema.json` - how LexBrain tags Frames (must use LexMap vocabulary)

---

## 1. LexMap model

LexMap is a machine-readable map of the repo, not a prose README.

At minimum, we maintain something like `lexmap.json` (or `lexmap.policy.json`), checked into the repo root.

Core concepts:

```json
{
  "modules": {
    "services/auth-core": {
      "description": "Core auth abstractions. Canonical home for UserAccessRepository, TransportClientInterface, etc.",
      "owns_namespaces": [
        "App\\Services\\AuthCore\\"
      ],
      "exposes": [
        "UserAccessRepositoryInterface",
        "TransportClientInterface",
        "AccountNormalizerInterface"
      ],
      "allowed_callers": [
        "external-auth-adapter",
        "api/user-access-service"
      ],
      "forbidden_callers": []
    },

    "external-auth-adapter": {
      "description": "External auth adapter. Implements auth core contracts, adds external provider-specific request/response logic.",
      "owns_namespaces": [
        "App\\ExternalAuth\\"
      ],
      "exposes": [
        "ExternalAuthClient",
        "AuthPayloadBuilder"
      ],
      "allowed_callers": [
        "services/auth-core.tests",
        "cli/auth-sync",
        "ui/auth-dashboard"
      ],
      "forbidden_callers": [
        "ui/user-admin-panel-direct"
      ],
      "notes": "Must not define its own UserAccessRepository; must rely on services/auth-core."
    },

    "ui/user-admin-panel": {
      "description": "User admin UI (Add User button, etc.).",
      "owns_paths": [
        "ui/user-admin-panel/",
        "ui/shared/UserAdminComponents*"
      ],
      "exposes": [
        "renderUserAdminPanel",
        "openAddUserModal"
      ],
      "feature_flags": [
        "beta_user_admin"
      ],
      "requires_permissions": [
        "can_manage_users"
      ],
      "allowed_callers": [
        "api/user-access-service"
      ],
      "forbidden_callers": [
        "external-auth-adapter",
        "services/auth-core"
      ],
      "notes": "UI should not directly talk to legacy controller methods that bypass new perms/flag gating."
    }
  },

  "kill_patterns": [
    "pass-through wrappers that just forward to core and add nothing",
    "duplicated UserAccessRepository implementations outside services/auth-core",
    "ad-hoc auth clients that bypass TransportClientInterface and custom timeouts"
  ]
}
```

This is the contract.

A module is defined by:

* what it owns,
* what it exposes,
* who is allowed to call it,
* where it is forbidden to reach into,
* any flags / permissions that gate its behavior,
* and which “kill patterns” we want to wipe out.

This file becomes canonical. The names in here (module IDs, exposed interfaces, feature flag names) must match what LexBrain writes into each Frame’s metadata under `module_scope`, `feature_flags`, `keywords`, etc.

That alignment is where the real power comes from.

## 2. Metadata contract between LexMap and LexBrain

LexBrain tags each Frame with:

* `module_scope`: array of module IDs from LexMap (`["services/auth-core", "ui/user-admin-panel"]`)
* `feature_flags`: e.g. `["beta_user_admin"]`
* `keywords`: includes interface names / controller names / repo surfaces mentioned in LexMap policy.

LexMap publishes the authoritative list of valid:

* module IDs
* feature flags (and what they guard)
* canonical interface names
* known kill patterns

So:

* LexBrain can classify a Frame using LexMap’s vocabulary.
* Later, when we recall that Frame, we can ask: “Did this work violate LexMap?”

Example:

* A Frame for WEB-23621 says:
  `module_scope = ["ui/provider-endpoints", "hie/surescripts"]`
  and `keywords` includes `"Create Endpoint disabled"`, `"upr_physician_list"`.
* LexMap says:
  `"ui/provider-endpoints" must NOT directly call "hie/surescripts"`.

Assistant can immediately respond:

> “This flow is still wired to call Surescripts directly. LexMap forbids ui/provider-endpoints → hie/surescripts; UI should talk to provider-endpoints-service instead. That’s probably why the Create Endpoint button is still disabled.”

That is automated Drew Review: policy vs reality, backed by actual captured evidence.

## 3. How LexMap stays current

LexMap is not frozen documentation. It’s a living index, and it has to evolve in a controlled way.

We treat LexMap updates like code:

* It lives in version control.
* Updating it is a change request / PR.
* The PR diff to LexMap is itself reviewable: “you’re moving IdentifierMapRepository out of core?? justify that.”

In other words: you want to add a new module, relax a rule, or mark a new kill pattern? You do it in `lexmap.policy.json`, open a PR, and let reviewers (and AI) argue.

Why that matters:

* The AI can trust LexMap as “this is current truth,” not tribal memory.
* Humans can blame or praise specific diffs: “We explicitly allowed SurescriptsClient to take an `$options` timeout param on 2025-10-23, here’s the PR where we agreed that was fine.”
* You get historical architecture intent with timestamps, not just vibes.

That turns LexMap into an institutional memory of design decisions — in a form both machines and humans can consume.

## 4. Querying LexMap

We want simple programmatic questions like:

* “Given file X or namespace Y, which module is this part of?”
* “Is module A allowed to call module B?”
* “Is this class name on a kill list?”
* “What feature flag should gate this UI path?”

So LexMap needs to expose (via MCP or via a tiny lib) at least:

**`lexmap.resolve_module({ path | namespace }) -> module_id`**

**`lexmap.allowed_edge({ from_module, to_module }) -> boolean`**

**`lexmap.describe_module({ module_id }) -> { description, exposes[], feature_flags[], kill_patterns[] }`**

**`lexmap.required_flags({ module_id }) -> feature_flags[]`**

**`lexmap.kill_patterns()`**
Return known anti-pattern markers for scanners / cleanup passes.

Those calls let an assistant:

* inspect a Frame,
* map that Frame’s code references / controllers / calls to module IDs,
* check “is this allowed?” against LexMap,
* and tell you “this is off-policy” with evidence.

This is reusable across the whole codebase. You don’t have to prompt-train each time.

## 5. Enforcement / reporting loop

Here’s the loop we want:

1. You’re working on WEB-23621.
2. You `/remember` at end of night.
   LexBrain creates a Frame with metadata:
   `module_scope = ["hie/core", "hie/surescripts", "ui/provider-endpoints"]`,
   `keywords` includes `"Create Endpoint disabled"`, `"upr_physician_list"`, `"ProviderEndpointsController"`.
3. Later, you ask:
   “Where did we leave off on Create Endpoint?”
4. Assistant:

   * pulls that Frame (LexBrain),
   * reads its metadata (`module_scope`, `keywords`, etc.),
   * calls into LexMap to ask:

     * “Is `ui/provider-endpoints` allowed to depend directly on `hie/surescripts`?”
     * “What feature flags/permissions should gate this UI?”
   * replies:

     * “The UI path is still disabled because permissions `upr_physician_list` are hard-coded instead of using the approved service boundary. LexMap says UI should call provider-endpoints-service, not surescripts directly.”

This is not a hallucinated guess.
This is “your own saved session + your own architectural policy = diagnosis.”
You are holding your own receipts.

That’s the differentiator. Nobody else can do that out of the box.

## 6. Metadata discipline (must be consistent or this falls apart)

We need to lock down naming so LexBrain and LexMap never drift. Same rules every time:

### Module IDs

Short, stable keys like:

* `hie/core`
* `hie/surescripts`
* `ui/provider-endpoints`
* `api/provider-endpoints-service`
* `cli/hie-send`

These are the only valid `module_scope` entries in LexBrain Frames. No ad hoc spellings. If naming changes, it changes first in LexMap (PR), then LexBrain starts using the new IDs.

### Feature flags

Feature flags in LexBrain Frames (`feature_flags`) must match LexMap’s `feature_flags` list for that module. That lets us answer “which flags guard this path and why is it off in prod?”

### Permissions / access control

If something like `upr_physician_list` is expected, it should live somewhere in LexMap’s definition for `ui/provider-endpoints` under `requires_permissions`.
LexBrain then tags Frames with that permission string inside `keywords`.
Now the assistant can say:

> “This UI is gated on `upr_physician_list`, which is correct per LexMap, but the Create Endpoint button is still disabled because the controller wiring isn’t done.”

Consistent terms = consistent recall.

### Kill patterns

LexMap `kill_patterns` needs to be a list of recognizable signatures.
Examples:

* “IdentifierMapRepository duplicated outside hie/core”
* “Direct curl_init to Surescripts endpoint bypassing TransportClientInterface”
* “UI calling legacy controller action instead of service API”

LexBrain Frames should include any seen kill pattern (by normalized text label) in the Frame’s `keywords`. That lets us later query:

> “Show me last time we still saw ‘Direct curl_init to Surescripts endpoint bypassing TransportClientInterface’.”

That’s a cleanup roadmap. That’s technical debt you can actually track.

## 7. Team / business value

LexMap on its own is “architecture docs, but machine-readable.” Honestly useful, but lots of teams claim they already have that (they don’t, but they’ll say they do).

LexBrain on its own is “session memory that persists, locally, so I don’t lose the thread.”

The power move is the pairing:

* LexBrain = “what actually happened in practice at 2:13am when real work was getting done.”
* LexMap = “what we say we believe about how the system is shaped.”

When those disagree, we get:

* instant review feedback (“this path is still off-policy, fix it next”),
* an explainable reason why things are still gated/disabled,
* an auditable trail (“we left Create Endpoint off because perms weren’t enforced yet, here’s the exact state and date”).

That is not just dev convenience. That is:

* onboarding / handoff memory,
* architecture conformance tracking,
* regulatory / SOC2-ish justification (“why is this button behind a permission flag?”),
* and, bluntly, proof that you’re not asleep at the wheel.

That’s what management and compliance will pay for.

## 8. Summary

* LexMap defines canonical module boundaries, allowed call graphs, feature flags, kill patterns, and permission expectations in a machine-consumable JSON/policy file.
* LexBrain tags every saved Frame with those canonical IDs and terms, so that every snapshot of “what we were actually doing” can be reconciled against “how it was supposed to work.”
* Retrieval is no longer just “show me my old logs,” it’s “tell me what was blocking, who owned that surface, whether it was on-policy, and what the next action was.”
* Consistent metadata is everything. `module_scope`, `keywords`, `feature_flags`, `requires_permissions`, `kill_patterns` — these MUST share the same vocabulary between LexMap and LexBrain or the loop breaks.

Put bluntly:

* LexBrain = living timeline.
* LexMap = law.
* The assistant = enforcement + recall, with receipts.

That combination is the moat.
