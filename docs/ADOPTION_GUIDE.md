# LexMap Adoption Guide

This guide walks you through rolling out LexMap in a real codebase—step by step, without boiling the ocean or starting a civil war with senior devs.

The goal: get to a state where `lexmap check` catches violations before they merge, and your team actually trusts it.

---

## Phase 1: Bootstrap One or Two Modules into `lexmap.policy.json`

### Goal

Prove that LexMap works by defining 1–2 modules and catching real violations.

### Steps

1. **Pick a module that everyone agrees has a boundary**

   Example:
   - "The admin UI shouldn't call auth-core directly"
   - "The payment service shouldn't be called by marketing code"

   Don't pick something controversial. Pick something obvious.

2. **Define it in `lexmap.policy.json`**

   ```json
   {
     "modules": {
       "services/auth-core": {
         "owns_namespaces": ["App\\Services\\AuthCore\\"],
         "owns_paths": ["src/services/auth-core/**"],
         "allowed_callers": ["services/user-access-api"],
         "forbidden_callers": ["ui/user-admin-panel"],
         "notes": "Central auth. UI must not call this directly."
       },

       "ui/user-admin-panel": {
         "owns_paths": ["web-ui/admin/**"],
         "forbidden_callers": ["services/auth-core"],
         "notes": "Admin UI. Cannot call auth-core directly. Must use user-access-api."
       }
     }
   }
   ```

3. **Save it and commit it**

   ```bash
   git add lexmap.policy.json
   git commit -m "Add initial LexMap policy for auth-core and admin UI"
   ```

4. **Tell the team**

   Post in Slack:
   > "We're trying LexMap. It's architecture policy as code. We defined two modules (auth-core and admin UI) in `lexmap.policy.json`. If you call auth-core from the admin UI, `lexmap check` will flag it. Let's see if this catches anything."

   Don't oversell. Don't mandate. Just "we're trying this."

---

## Phase 2: Run Scanners for Just PHP or TS First

### Goal

Scan one language (the one with the most violations) and see what `lexmap check` finds.

### Steps

1. **Pick a language**

   If your codebase is mostly PHP with some TypeScript, start with PHP.

2. **Run the scanner**

   ```bash
   python3 lexmap.scan/php_scanner.py src/ > php-scan.json
   ```

   This walks `src/` and emits facts:
   - Files analyzed
   - Symbols declared
   - Imports and calls made
   - Feature flags referenced
   - Permissions enforced

3. **Check for violations**

   ```bash
   node lexmap.scan/lexmap-check.ts php-scan.json lexmap.policy.json
   ```

   Output:

   ```
   ❌ VIOLATION: ui/user-admin-panel called services/auth-core
      Forbidden caller detected.
      File: web-ui/admin/UserAdminPanel.tsx
      Line: 42

   Exit code: 1
   ```

4. **Share the results**

   Post in Slack:
   > "LexMap found 3 violations of the 'admin UI calling auth-core directly' rule. Here's the list. We should fix these."

   If the team agrees the violations are real, proceed.

5. **Fix one violation as a proof of concept**

   Pick the easiest one. Fix it. Show the PR. Run `lexmap check` again. Show that it passes.

   Post:
   > "Fixed one violation. `lexmap check` now passes for this module. We can wire this into CI."

---

## Phase 3: Wire `lexmap check` into CI for Just Those Modules

### Goal

Make violations block merges—but only for the modules you've defined so far.

### Steps

1. **Add a CI step**

   Example (GitHub Actions):

   ```yaml
   name: LexMap Check

   on: [pull_request]

   jobs:
     lexmap:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: 22
         - run: pnpm install
         - run: python3 lexmap.scan/php_scanner.py src/ > php-scan.json
         - run: node lexmap.scan/lexmap-check.ts php-scan.json lexmap.policy.json
   ```

2. **Merge it**

   ```bash
   git add .github/workflows/lexmap.yml
   git commit -m "Add LexMap check to CI"
   git push
   ```

3. **Test it**

   Open a PR that violates the policy (e.g. admin UI calling auth-core directly).

   CI should fail:

   ```
   ❌ VIOLATION: ui/user-admin-panel called services/auth-core
   Exit code: 1
   ```

4. **Fix the violation**

   Update the PR to fix the violation. Push. CI should pass.

5. **Announce**

   Post:
   > "LexMap is now in CI. If you violate the 'admin UI → auth-core' rule, your PR will fail. Fix it before merge."

---

## Phase 4: Start Capturing LexBrain Frames and Tagging `module_scope`

### Goal

Wire LexBrain to LexMap so Frames get tagged with canonical module IDs, enabling policy-aware memory.

### Steps

1. **Install LexBrain** (if you haven't already)

   ```bash
   git clone https://github.com/yourorg/lexbrain.git /srv/lex-brain
   cd /srv/lex-brain
   pnpm install
   ```

2. **Configure LexBrain to call LexMap for module resolution**

   Edit `lexbrain.config.json`:

   ```json
   {
     "lexmap": {
       "enabled": true,
       "policy_path": "/srv/lex-map/lexmap.policy.json",
       "resolver_path": "/srv/lex-map/bin/resolve-modules"
     }
   }
   ```

3. **Capture a Frame and verify `module_scope` is populated**

   ```bash
   lexbrain remember \
     --jira TICKET-123 \
     --branch feature/TICKET-123_auth_handshake_fix \
     --summary "Auth handshake timeout; Add User button still disabled" \
     --next "Enable Add User button for can_manage_users role" \
     --context ./test-output.txt
   ```

   Recall it:

   ```bash
   lexbrain recall TICKET-123
   ```

   You should see:

   ```json
   {
     "module_scope": ["ui/user-admin-panel", "services/auth-core"],
     ...
   }
   ```

   Those module IDs should match what's in `lexmap.policy.json`.

4. **Test policy-aware reasoning**

   Ask your assistant:

   > "Why is the Add User button still disabled?"

   The assistant should:
   - Pull the Frame for `TICKET-123`
   - See `module_scope = ["ui/user-admin-panel", "services/auth-core"]`
   - Ask LexMap if `ui/user-admin-panel` is allowed to call `services/auth-core` directly
   - Answer: "It's disabled because the UI is calling a forbidden service. Policy says that path must go through `services/user-access-api`. Here's the timestamped Frame from last night."

   That's the moat.

---

## How to Roll This Out Without Starting a Civil War

### Don't Boil the Ocean

Start small:
- Define 1–2 modules in Phase 1
- Scan one language in Phase 2
- Wire CI for just those modules in Phase 3
- Add LexBrain when the team trusts LexMap

Don't try to define 50 modules on day one. You'll drown in policy debates.

### Pick Obvious Boundaries

Start with rules that everyone agrees on:
- "The admin UI shouldn't call auth-core directly"
- "Marketing code shouldn't call the payment service"

Don't start with controversial rules like "Frontend can't call backend directly." That's a religious war.

### Show, Don't Tell

Don't send a 10-page doc explaining LexMap. Show a violation:

> "LexMap found 3 instances of the admin UI calling auth-core directly. Here's the list. Should we fix these?"

If the team agrees, proceed. If they don't, pick a different module.

### Make Violations Non-Blocking at First

In Phase 3, you can make `lexmap check` report violations without failing CI:

```yaml
- run: node lexmap.scan/lexmap-check.ts php-scan.json lexmap.policy.json || true
```

Post the violations in Slack. Let the team see them. Once they trust the tool, make it blocking:

```yaml
- run: node lexmap.scan/lexmap-check.ts php-scan.json lexmap.policy.json
```

### Get Buy-In from Senior Devs

Before you wire `lexmap check` into CI, show it to the senior devs:

> "We're trying LexMap. It caught these violations. Do you agree these are real?"

If they say yes, proceed. If they say "that's not actually a violation," update the policy.

### Don't Oversell

Don't say:
> "LexMap will revolutionize our architecture!"

Say:
> "LexMap makes it easier to enforce the 'admin UI → auth-core' rule. Let's try it for one module."

Under-promise. Over-deliver.

---

## Troubleshooting

### "LexMap is flagging false positives"

Check the policy:
- Is `owns_paths` too broad? (e.g. `src/**` instead of `src/services/auth-core/**`)
- Is `forbidden_callers` too strict? (e.g. forbidding a caller that should be allowed)

Update the policy. Re-run `lexmap check`.

### "Scanners are missing calls"

Scanners are naive. They don't understand every edge case.

If a scanner is missing calls:
- Improve the scanner (e.g. move PHP scanner from regex to a proper parser)
- Add heuristics for specific patterns
- Open a PR with examples

### "The team is ignoring violations"

Make violations blocking in CI:

```yaml
- run: node lexmap.scan/lexmap-check.ts php-scan.json lexmap.policy.json
```

If a PR violates policy, it can't merge.

If the team still ignores it, the policy is wrong. Update it.

---

## Summary

| Phase | Goal | Key Action |
|-------|------|------------|
| **Phase 1** | Prove LexMap works | Define 1–2 modules in `lexmap.policy.json` |
| **Phase 2** | Find violations | Run scanners for one language |
| **Phase 3** | Enforce policy | Wire `lexmap check` into CI |
| **Phase 4** | Add policy-aware memory | Integrate LexBrain and tag `module_scope` |

By Phase 4, you should be able to:

- Ask "What was I doing on TICKET-123?" and get an instant answer
- Ask "Why is the Add User button still disabled?" and get an answer with receipts (Frame + policy violation)
- Enforce architecture policy in CI without manual PR reviews

That's the value of LexMap.

---

## Next Steps

- Read [Architecture Loop](./ARCHITECTURE_LOOP.md) to understand the closed-loop moat
- Read [FAQ](./FAQ.md) for "Is this just a linter?" questions
- Read [Contributing](../CONTRIBUTING.md) to add a new scanner
