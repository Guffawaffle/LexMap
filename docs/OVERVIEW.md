# LexMap Overview

## The Pain

You're on a team with a 10-year-old codebase. It's grown organically. It has layers: a legacy admin UI, a newer React frontend, a mess of PHP services, and a few Node.js APIs bolted on.

There are rules. Tribal rules.

- "The admin UI can't call auth-core directly. It has to go through the user-access-api service."
- "Feature X is gated by the `beta_user_admin` flag and the `can_manage_users` permission."
- "We're deleting all instances of duplicate auth logic. Don't add more."

These rules live in:
- A wiki that no one updates
- Comments in the code that get deleted
- The one senior dev's brain

A new engineer joins. They open a PR. The PR violates a rule. The senior dev catches it in review (if they're not on vacation).

PR comment: "No, the admin UI can't call auth-core directly."

New engineer: "Where is that documented?"

Senior dev: "It's in the wiki. Or it was. Just trust me."

PR gets fixed. Merge. Ship.

Six months later, a different engineer makes the same mistake. The cycle repeats.

Even worse: someone asks "Why is the Add User button still disabled?" and the answer is "No idea. Let me dig through the code."

This is **exhausting**.

---

## LexMap's Answer

LexMap makes architecture policy **explicit, versioned, and enforceable**.

You define modules in a machine-readable file called `lexmap.policy.json`:

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
    }
  }
}
```

Then you run **scanners** to extract facts from your code:

```bash
# Scan PHP
python3 lexmap.scan/php_scanner.py src/ > php-scan.json

# Scan TypeScript / React
node lexmap.scan/ts_scanner.ts web-ui/ > ts-scan.json
```

Then you **merge** scanner outputs:

```bash
node lexmap.scan/lexmap-merge.ts php-scan.json ts-scan.json > merged.json
```

Then you **check** against policy:

```bash
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

Output:

```
❌ VIOLATION: ui/user-admin-panel called services/auth-core
   Forbidden caller detected.
   Policy: services/auth-core.forbidden_callers includes ui/user-admin-panel
   File: web-ui/admin/UserAdminPanel.tsx
   Line: 42

Exit code: 1
```

You wire that into CI. Now violations are caught **before PR review**.

No more "Ask the one person who knows." Just `lexmap check`.

---

## How Scanners, Policy, Merge, and Check Fit Together

### 1. Scanners (Dumb by Design)

Scanners are per-language analyzers that walk code and emit **facts**:

- "This file declared class X"
- "It imported Y"
- "It called Z"
- "It referenced feature flag F"
- "It enforced permission P"
- "It smells like kill pattern K"

Scanners do **not** make architecture decisions. They just observe.

We have scanners for:
- **PHP** (uses regex for now, will move to `nikic/php-parser`)
- **TypeScript/JavaScript** (uses TypeScript compiler API)
- **Python** (uses `ast`)

Scanners are intentionally naive. They don't understand policy. They don't guess. They just report what they see.

### 2. Policy (`lexmap.policy.json`)

This is the source of truth for architecture rules.

It defines:
- **Modules** — logical components (e.g. `services/auth-core`, `ui/user-admin-panel`)
- **Ownership** — which code each module owns (by path or namespace)
- **Allowed/forbidden callers** — who can call this module, who can't
- **Feature flags** — which flags gate this module
- **Permissions** — which permissions protect it
- **Kill patterns** — anti-patterns we're actively deleting

Example:

```json
{
  "modules": {
    "ui/user-admin-panel": {
      "owns_paths": ["web-ui/admin/**"],
      "allowed_callers": [],
      "forbidden_callers": ["services/auth-core"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": ["direct_auth_core_call"],
      "notes": "Admin UI. Cannot call auth-core directly."
    }
  },
  "global_kill_patterns": [
    "duplicate_auth_logic",
    "ui_calling_auth_core_directly"
  ]
}
```

### 3. Merge

Combines multiple scanner outputs into one `merged.json`.

This lets you scan different languages separately and then unify the facts.

```bash
node lexmap.scan/lexmap-merge.ts php-scan.json ts-scan.json > merged.json
```

### 4. Check

Compares `merged.json` against `lexmap.policy.json` and reports violations:

```bash
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

Exit codes:
- `0` = clean
- `1` = violations (forbidden edge, missing permission, kill pattern detected)
- `2` = tool error (bad policy, malformed input)

You wire this into CI:

```yaml
- name: LexMap Check
  run: |
    node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

Now violations block merges.

---

## Why Policy Lives in Git, Not a Wiki

Wikis rot. Comments get deleted. The one person who knows goes on vacation.

`lexmap.policy.json` is **versioned, reviewed, and enforced like code**.

If you want to change the policy (e.g. allow a new caller), you open a PR. The PR is reviewed. The policy is updated. `lexmap check` enforces the new rule immediately.

This makes architecture intent **auditable**:

- "When did we forbid the admin UI from calling auth-core directly?"
  - Answer: `git log lexmap.policy.json`

- "Who approved that change?"
  - Answer: PR #123, approved by @senior-dev

- "Is this PR violating policy?"
  - Answer: `lexmap check` → yes/no

No more guessing. No more tribal knowledge.

---

## How This Becomes Proof / Audit Trail

Every time you run `lexmap check`, you get a snapshot of:

- What the code actually does (from scanners)
- What the policy says is allowed (from `lexmap.policy.json`)
- What violations exist right now

You can save that output. You can show it in PR reviews. You can cite it in retros:

> "We had 12 violations of the 'UI calling auth-core directly' rule last month. We fixed 10. Here are the 2 remaining."

That's an audit trail. That's proof that you're actually enforcing policy.

Compare that to:

> "I think we told people not to do that. Maybe they're doing it. I don't know."

LexMap gives you **receipts**.

---

## How LexBrain Fits In

**LexBrain** is persistent working memory for engineers.

When you hit `/remember` at the end of a debugging session, LexBrain captures a **Frame**:

1. **A rendered "memory card" image**
   - Monospace panel with failing tests, stack trace, next action
   - Header with timestamp, branch, ticket ID

2. **The raw text** behind that card

3. **Structured metadata**:
   ```json
   {
     "timestamp": "2025-11-01T16:04:12-05:00",
     "branch": "feature/TICKET-123_auth_handshake_fix",
     "jira": ["TICKET-123"],
     "module_scope": ["ui/user-admin-panel", "services/auth-core"],
     "feature_flags": ["beta_user_admin"],
     "permissions": ["can_manage_users"],
     "summary_caption": "Auth handshake timeout; Add User button still disabled",
     "status_snapshot": {
       "tests_failing": 2,
       "merge_blockers": ["UserAccessController wiring"],
       "next_action": "Enable Add User button for can_manage_users role"
     },
     "keywords": ["Add User disabled", "auth timeout", "TICKET-123"]
   }
   ```

Later, when you ask "What was blocking TICKET-123 yesterday?", LexBrain returns that Frame.

### The Connection

Because LexBrain stores `module_scope` using **LexMap's module IDs** (THE CRITICAL RULE), your assistant can cross-check against policy:

1. Pull the Frame for `TICKET-123`
2. See `module_scope = ["ui/user-admin-panel", "services/auth-core"]`
3. Ask LexMap: "Is `ui/user-admin-panel` allowed to call `services/auth-core`?"
4. Answer: "No. That's forbidden. Policy says it must go through `services/user-access-api`."

The assistant can now say:

> "The Add User button is still disabled because the admin UI (`ui/user-admin-panel`) is calling `services/auth-core` directly, which is forbidden by policy. Policy says it must go through `services/user-access-api` and be gated by `can_manage_users`. Here's the timestamped Frame from 11:04 PM last night where you said you'd fix the `UserAccessController` wiring after sleep."

That's not vibes. That's **receipts**.

Without LexMap, the assistant guesses.
With LexMap, the assistant **cites policy and explains violations**.

---

## Why This Should Exist at Your Company

If you have:

- A large codebase (10+ years old)
- Multiple languages (PHP, TypeScript, Python, etc.)
- Tribal rules about "who can call what"
- Engineers who waste time re-explaining architecture in PR reviews
- A wiki that no one updates

Then LexMap solves a real problem.

You define modules once in `lexmap.policy.json`. You run scanners. You wire `lexmap check` into CI. Violations are caught before merge.

No more "Ask the one person who knows."
No more "I think we're not supposed to do that."

Just: `lexmap check` → yes/no.

And if you add LexBrain, you get persistent, policy-aware memory across work sessions. Your assistant can say:

> "You were working on TICKET-123 last night. You diagnosed that the admin UI is calling a forbidden service. Here's the policy violation. Here's the timestamped Frame. Here's what you said you'd do next."

That's the moat.

---

## Status

LexMap is **alpha**.

- Scanners work but are naive (PHP uses regex, TS uses TypeScript compiler API, Python uses `ast`)
- You can run this today and get real value if you define 1–2 modules in `lexmap.policy.json`
- CI gating works right now
- LexBrain integration is conceptually defined and the schema is stable

We are **not** claiming:
- Fully polished product
- Cloud service
- Magic AI that writes code for you

We **are** claiming:
- Architecture policy as code, enforced in CI
- That your assistant can understand and reason about later

---

## Next Steps

- Read the [Adoption Guide](./ADOPTION_GUIDE.md) to roll this out without starting a war
- Read the [Architecture Loop](./ARCHITECTURE_LOOP.md) to understand the closed-loop moat
- Read the [FAQ](./FAQ.md) for "Is this just a linter?" questions
- Read [Contributing](../CONTRIBUTING.md) to add a new scanner
