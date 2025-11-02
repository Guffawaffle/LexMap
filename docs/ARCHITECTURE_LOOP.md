# LexMap Architecture Loop

This document explains the closed loop between LexMap (policy) and LexBrain (memory), and why that's the moat.

---

## The Moat

Most AI coding assistants operate in a vacuum. They see your code, but they don't know:

- What the architecture is **supposed** to allow
- Why you deliberately left something half-finished
- Which modules are forbidden from talking to each other

LexMap + LexBrain solves this. Here's how.

---

## The Loop

### 1. LexMap = Policy (What's Allowed)

LexMap defines module boundaries in `lexmap.policy.json`:

```json
{
  "modules": {
    "services/auth-core": {
      "owns_namespaces": ["App\\Services\\AuthCore\\"],
      "owns_paths": ["src/services/auth-core/**"],
      "allowed_callers": ["services/user-access-api"],
      "forbidden_callers": ["ui/user-admin-panel"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": ["duplicate_auth_logic"],
      "notes": "Central auth. UI must not call this directly."
    },

    "ui/user-admin-panel": {
      "owns_paths": ["web-ui/admin/**"],
      "forbidden_callers": ["services/auth-core"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": ["direct_auth_core_call"],
      "notes": "Admin UI. Cannot call auth-core directly. Must use user-access-api."
    },

    "services/user-access-api": {
      "owns_paths": ["src/services/user-access-api/**"],
      "allowed_callers": ["ui/user-admin-panel"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "notes": "UI should call this service instead of going straight to auth-core."
    }
  },

  "global_kill_patterns": [
    "duplicate_auth_logic",
    "ui_calling_auth_core_directly"
  ]
}
```

This is the **law**. It defines:
- What code each module owns
- Who's allowed to call it
- Who's forbidden from calling it
- What feature flags gate it
- Which permissions protect it
- Which anti-patterns we're deleting

---

### 2. Scanners = Facts (What Code Actually Did)

Scanners walk code and emit **facts**:

```bash
# Scan PHP
python3 lexmap.scan/php_scanner.py src/ > php-scan.json

# Scan TypeScript / React
node lexmap.scan/ts_scanner.ts web-ui/ > ts-scan.json
```

Scanner output:

```json
{
  "files": [
    {
      "path": "web-ui/admin/UserAdminPanel.tsx",
      "symbols_declared": ["UserAdminPanel", "renderAddUserButton"],
      "imports": ["../../services/auth-core/AuthTokenValidator"],
      "calls": ["AuthTokenValidator.validate"],
      "feature_flags": ["beta_user_admin"],
      "permissions": ["can_manage_users"],
      "kill_patterns": ["direct_auth_core_call"]
    }
  ]
}
```

Scanners are **dumb by design**. They don't make architecture decisions. They just observe:
- "This file declared X"
- "It imported Y"
- "It called Z"
- "It referenced feature flag F"
- "It enforced permission P"
- "It smells like kill pattern K"

---

### 3. Merge + Check = Enforcement (Tell Me Violations Before Review)

Merge scanner outputs:

```bash
node lexmap.scan/lexmap-merge.ts php-scan.json ts-scan.json > merged.json
```

Check against policy:

```bash
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

Output:

```
❌ VIOLATION: ui/user-admin-panel called services/auth-core
   Forbidden caller detected.
   File: web-ui/admin/UserAdminPanel.tsx
   Line: 42
   Policy: services/auth-core.forbidden_callers includes ui/user-admin-panel

Exit code: 1
```

You wire this into CI:

```yaml
- name: LexMap Check
  run: |
    node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

Now violations are caught **before PR review**.

---

### 4. LexBrain Frames = Timestamped "What I Was Doing Last Night"

You're working on `TICKET-123`: enabling the Add User button in the admin panel.

You've been debugging for an hour. Tests are failing. You've diagnosed the blocker:

- The admin UI (`ui/user-admin-panel`) is calling `services/auth-core` directly.
- That call path is **forbidden** by policy.
- The correct path is: UI → `services/user-access-api` → auth-core, gated by `can_manage_users`.
- You've left the Add User button disabled until you fix the wiring.

It's 11 PM. You're about to go to sleep.

You hit `/remember`:

```bash
lexbrain remember \
  --jira TICKET-123 \
  --branch feature/TICKET-123_auth_handshake_fix \
  --summary "Auth handshake timeout; Add User button still disabled in admin panel" \
  --next "Enable Add User button for can_manage_users role" \
  --context ./test-output.txt ./current-diff.txt
```

LexBrain captures a **Frame**:

1. **A rendered "memory card" image**
   - Monospace panel showing test failures, stack trace, timeout message
   - Header band with timestamp (`2025-11-01T23:04:12-05:00`), branch, ticket ID
   - Human summary: "Auth handshake timeout; Add User button still disabled"
   - Next action: "Enable Add User button for can_manage_users role"

2. **The raw text** behind that card

3. **Structured metadata**:

```json
{
  "timestamp": "2025-11-01T23:04:12-05:00",
  "branch": "feature/TICKET-123_auth_handshake_fix",
  "jira": ["TICKET-123"],
  "module_scope": ["ui/user-admin-panel", "services/auth-core"],
  "feature_flags": ["beta_user_admin"],
  "permissions": ["can_manage_users"],
  "summary_caption": "Auth handshake timeout; Add User button still disabled in admin panel",
  "status_snapshot": {
    "tests_failing": 2,
    "merge_blockers": [
      "UserAccessController wiring",
      "ExternalAuthClient timeout handling"
    ],
    "next_action": "Enable Add User button for can_manage_users role"
  },
  "keywords": [
    "Add User disabled",
    "auth handshake timeout",
    "connect_handshake_ms",
    "UserAccessController",
    "ExternalAuthClient",
    "TICKET-123"
  ]
}
```

Key field: **`module_scope`** — the canonical module IDs from LexMap.

---

### 5. THE CRITICAL RULE = Shared Module Vocabulary

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

This rule is the bridge.

When you capture a Frame, LexBrain calls LexMap to resolve which modules own the files you touched. It records those canonical module IDs in `module_scope`.

Later, when you ask "Why is the Add User button still disabled?", the assistant can cross-check against policy.

---

### 6. Assistant = Can Now Answer "Why Is the Button Still Disabled?" with Proof

The next morning, you ask:

> "Why is the Add User button still disabled?"

The assistant does the following:

1. **Pulls the Frame** for `TICKET-123` from LexBrain

   ```json
   {
     "module_scope": ["ui/user-admin-panel", "services/auth-core"],
     "summary_caption": "Auth handshake timeout; Add User button still disabled",
     "next_action": "Enable Add User button for can_manage_users role"
   }
   ```

2. **Sees `module_scope = ["ui/user-admin-panel", "services/auth-core"]`**

3. **Asks LexMap** if `ui/user-admin-panel` is allowed to call `services/auth-core` directly

   ```bash
   node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
   ```

   Result:

   ```
   ❌ VIOLATION: ui/user-admin-panel called services/auth-core
      Forbidden caller detected.
   ```

4. **The assistant answers**:

   > "The Add User button is still disabled because the admin UI (`ui/user-admin-panel`) is calling `services/auth-core` directly, which is forbidden by policy. Policy says that path must go through `services/user-access-api` and be gated by the `can_manage_users` permission. Here's the timestamped Frame from 11:04 PM last night where you said you'd fix the `UserAccessController` wiring after sleep."

That's not vibes. That's **receipts**.

---

## Contrast: Without LexMap + LexBrain

### Without LexMap

You ask:

> "Is the admin UI allowed to call auth-core directly?"

The assistant says:

> "I don't know. Let me guess based on file names. Maybe?"

You have to explain:

> "No, it's forbidden. That's in the wiki. Or it was."

The assistant has no policy to reference. It's just guessing.

### Without LexBrain

You ask:

> "What was I doing on TICKET-123 yesterday?"

The assistant says:

> "I don't know. You didn't tell me."

You spend 15 minutes re-explaining the failure state, the blocker, the gating logic, and the next step.

### With LexMap + LexBrain

You ask:

> "Why is the Add User button still disabled?"

The assistant says:

> "The admin UI is calling `services/auth-core` directly, which is forbidden by policy. Policy says it must go through `services/user-access-api` and be gated by `can_manage_users`. Here's the timestamped Frame from 11:04 PM last night."

**That's the difference.**

---

## How This Scales

### One Engineer, One Ticket

LexBrain gives you continuity. You can recall what you were doing yesterday without re-explaining.

LexMap gives you enforcement. Violations are caught before merge.

### One Team, Many Tickets

LexBrain gives you a shared memory. A teammate can ask:

> "What's the deal with the Add User button?"

And get:

> "Last touched on TICKET-123, 11:04 PM last night. The button is disabled because the admin UI is calling a forbidden service. The engineer left a note to fix `UserAccessController` wiring and gate it with `can_manage_users`. Here's the memory card."

LexMap gives you shared policy. A teammate can ask:

> "Is the admin UI allowed to call auth-core directly?"

And get:

> "No. That's forbidden. See `lexmap.policy.json`, line 8."

### One Org, Many Teams

If every team uses:
- LexMap for architecture policy
- LexBrain for persistent work memory

Then assistants can:
- Cite exact Frames across teams
- Line those Frames up with org-wide policy
- Explain WHY a feature is blocked (not just "it's blocked," but "it's blocked **because** Team A's UI is calling Team B's forbidden service")

That's **explainable, timestamped, policy-aware reasoning at org scale**.

---

## The Moat

Most AI coding tools operate in a vacuum. They see your code, but they don't know:

- What you were doing last night
- Why you left it half-finished
- What the architecture is supposed to allow

LexMap + LexBrain gives your assistant a **shared vocabulary** between:

- What you were doing (captured in Frames)
- What the architecture policy says you're allowed to do (defined in LexMap)

When those align, the assistant can tell you:

> "The admin panel is still calling `auth-core` directly. That's forbidden by policy. That's why you left the Add User button gated. Here's the Frame from 11:04 PM last night where you said you'd fix the `UserAccessController` wiring after sleep."

That's the moat.

Without this, AI agents guess. With this, they cite and explain.

---

## What This Means for You

You get:

1. **Architecture policy as code** — versioned, reviewed, enforced in CI
2. **Violations caught before merge** — no more "oops, we shipped a forbidden edge"
3. **Persistent, policy-aware memory** — assistants can recall what you were doing and why you stopped
4. **Explainable reasoning with receipts** — assistants can cite policy violations from timestamped Frames

All of this is local-first, intentional, and engineer-controlled.

No surveillance. No cloud upload. No "phone home."

Just: "Here's what you were doing, why it mattered, what the policy says, and what you said you'd do next."

---

## Next Steps

- Read the [Adoption Guide](./ADOPTION_GUIDE.md) to roll this out without starting a war
- Read the [FAQ](./FAQ.md) for "Is this just a linter?" questions
- Read [Contributing](../CONTRIBUTING.md) to add a new scanner
