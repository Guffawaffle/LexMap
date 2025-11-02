# LexMap FAQ

Frequently asked questions about LexMap, architecture policy, and why this isn't just another linter.

---

## Is this just ESLint / SonarQube / ArchUnit?

**No.**

**ESLint / Pylint / PHP_CodeSniffer / SonarQube:**
- They do style and bug patterns.
- They don't encode "this admin UI is never allowed to call that auth service directly" as enforceable policy.
- They don't ship a repository-owned, reviewable policy file declaring architecture.

**ArchUnit (Java), Dependency Cruiser (TS/JS):**
- They enforce boundaries within one language or one build system.
- LexMap is multi-language from day one via pluggable scanners and a shared policy model.
- LexMap treats the policy file (`lexmap.policy.json`) as a first-class artifact in git, not "tribal knowledge in a wiki."

**LexMap:**
- Defines module boundaries, allowed/forbidden edges, feature flags, permissions, and anti-patterns in `lexmap.policy.json`.
- Enforces that policy across multiple languages (PHP, TypeScript, Python, etc.).
- Makes policy **versioned, reviewable, and enforceable like code**.

In short: ESLint tells you "this variable is unused." LexMap tells you "this admin UI is calling a forbidden service."

---

## Is this a linter?

**Kind of, but not really.**

A linter checks style and bug patterns. LexMap checks **architectural policy**.

Example linter rule:
> "Unused variable detected."

Example LexMap rule:
> "The admin UI (`ui/user-admin-panel`) called `services/auth-core` directly, which is forbidden. Policy says it must go through `services/user-access-api`."

LexMap is more like a **policy enforcement engine** than a linter.

---

## Will this block my PRs?

**Only if you configure it to.**

LexMap runs in CI and reports violations. You decide what happens next:

**Option 1: Non-blocking (warnings only)**

```yaml
- run: node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json || true
```

Violations are reported but don't fail the build. Good for trial runs.

**Option 2: Blocking (violations fail CI)**

```yaml
- run: node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

Violations fail CI and block the merge. Good for enforcing policy.

You control the policy. If a rule is too strict, update `lexmap.policy.json` via PR.

---

## What if my codebase is 5 languages?

**LexMap supports multi-language codebases.**

We have scanners for:
- **PHP** (uses regex for now, will move to `nikic/php-parser`)
- **TypeScript/JavaScript** (uses TypeScript compiler API)
- **Python** (uses `ast`)

You run each scanner separately:

```bash
python3 lexmap.scan/php_scanner.py src/ > php-scan.json
node lexmap.scan/ts_scanner.ts web-ui/ > ts-scan.json
python3 lexmap.scan/python_scanner.py services/ > python-scan.json
```

Then merge the outputs:

```bash
node lexmap.scan/lexmap-merge.ts php-scan.json ts-scan.json python-scan.json > merged.json
```

Then check:

```bash
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
```

All languages are checked against the same policy. The module vocabulary is consistent across languages.

If we don't have a scanner for your language yet, you can write one. See [Contributing](../CONTRIBUTING.md).

---

## Does this phone home?

**No.**

LexMap runs locally. Scanners run locally. `lexmap check` runs locally.

No telemetry. No cloud upload. No network calls.

Everything stays on your machine (or your CI runner).

If you want to store scanner output remotely (e.g. in your own S3 bucket for auditing), you can do that yourself. But LexMap doesn't force it.

---

## What if I break the rules on purpose because production is on fire?

**That's fine. LexMap doesn't handcuff you.**

If production is on fire and you need to hotfix by calling a forbidden service, you can:

1. **Bypass the check temporarily**

   ```yaml
   # CI config
   - run: node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json || true
   ```

   Merge the fix. Ship it.

2. **Update the policy afterward**

   Open a PR to update `lexmap.policy.json`:

   ```json
   {
     "modules": {
       "services/auth-core": {
         "allowed_callers": ["services/user-access-api", "hotfix/emergency-admin"]
       }
     }
   }
   ```

   Review it. Merge it. Document why.

3. **Revert the policy change later**

   Once the emergency is over, revert the policy change:

   ```bash
   git revert <commit>
   ```

LexMap enforces policy, but you control the policy. If you need to break the rules, you can. Just document it.

---

## Why are you talking about screenshots?

**We're not. We're talking about "memory cards."**

**LexBrain** (the companion project) captures **Frames**, which include:

1. A rendered "memory card" image
   - Monospace panel with failing tests, stack trace, next action
   - Header with timestamp, branch, ticket ID
   - NOT a screenshot of your whole desktop

2. The raw text behind that card

3. Structured metadata (timestamp, branch, ticket ID, `module_scope`, flags, permissions, `next_action`)

The memory card is **deliberately distilled** for vision-capable LLMs. It's not a screen recording. It's a purpose-built snapshot of "what mattered at this moment."

We use images because modern vision-capable models can consume them at dramatically lower token cost (7–20× compression) than re-sending giant text blobs, while still recovering most of the meaning.

You still keep the raw text for exact recall when needed.

---

## What is LexBrain and do I need it?

**LexBrain is persistent working memory for engineers.**

When you hit `/remember` at the end of a debugging session, LexBrain captures a **Frame**:
- A rendered "memory card" image (failing tests, stack trace, next action)
- The raw text behind it
- Structured metadata: timestamp, branch, ticket ID, `module_scope`, feature flags, permissions, `next_action`

Later, when you ask "What was blocking TICKET-123 yesterday?", LexBrain returns that Frame.

Because LexBrain stores `module_scope` using **LexMap's module IDs** (THE CRITICAL RULE), your assistant can cross-check against policy:

> "The Add User button is still disabled because the admin UI (`ui/user-admin-panel`) is calling `services/auth-core` directly, which is forbidden by policy. Here's the timestamped Frame from last night."

### Do you need it?

**No.**

You can run LexMap standalone and get:
- Architecture policy as code
- Violations caught in CI
- Versioned, reviewable policy

You add LexBrain when you want:
- Persistent, policy-aware memory across work sessions
- Assistants that can explain "why is this button still off?" with receipts

LexBrain is optional but powerful.

---

## Can I use this with GitHub Copilot / Claude / other assistants?

**Yes, if they support MCP.**

LexBrain exposes Frames through **MCP over `stdio`**. If your assistant supports MCP, you can wire it up:

```json
{
  "mcpServers": {
    "lexbrain": {
      "command": "/srv/lex-brain/mcp-stdio.mjs",
      "env": {
        "LEXBRAIN_DB": "/srv/lex-brain/thoughts.db"
      }
    }
  }
}
```

Then your assistant can call `lexbrain recall TICKET-123` to pull Frames.

If your assistant doesn't support MCP yet, you can still use LexMap standalone for policy enforcement in CI.

---

## Can I search for violations by module?

**Yes.**

`lexmap check` outputs violations with file paths and module names. You can grep for them:

```bash
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json | grep "ui/user-admin-panel"
```

Or you can parse the JSON output (if you add `--json` flag):

```bash
node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json --json > violations.json
```

Then filter by module in your own scripts.

---

## What if I disagree with a violation?

**Update the policy.**

If `lexmap check` flags a violation and you disagree (e.g. "actually, that call is fine"), you can:

1. **Update `lexmap.policy.json`**

   ```json
   {
     "modules": {
       "services/auth-core": {
         "allowed_callers": ["services/user-access-api", "ui/user-admin-panel"]
       }
     }
   }
   ```

2. **Open a PR**

   ```bash
   git add lexmap.policy.json
   git commit -m "Allow admin UI to call auth-core in specific cases"
   git push
   ```

3. **Review it**

   The team reviews the PR. If they agree, it merges. The policy is updated.

4. **Re-run `lexmap check`**

   ```bash
   node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
   ```

   The violation should be gone.

The policy is **human-owned, PR-reviewed, and versioned in git**. If a rule is wrong, change it.

---

## Can I define custom kill patterns?

**Yes.**

Kill patterns are anti-patterns you're actively deleting. You can define them in `lexmap.policy.json`:

```json
{
  "modules": {
    "services/auth-core": {
      "kill_patterns": ["duplicate_auth_logic"]
    }
  },
  "global_kill_patterns": [
    "duplicate_auth_logic",
    "ui_calling_auth_core_directly"
  ]
}
```

Then scanners check for those patterns:

```bash
python3 lexmap.scan/php_scanner.py src/ --kill-patterns duplicate_auth_logic > php-scan.json
```

If a scanner detects the pattern, `lexmap check` flags it:

```
❌ KILL PATTERN DETECTED: duplicate_auth_logic
   File: src/services/legacy/DuplicateAuthLogic.php
   Line: 15
```

You can define as many kill patterns as you want. Just update the policy and re-run the scanners.

---

## Can I run this locally before pushing?

**Yes.**

Run `lexmap check` locally before you commit:

```bash
# Scan your code
python3 lexmap.scan/php_scanner.py src/ > php-scan.json

# Check for violations
node lexmap.scan/lexmap-check.ts php-scan.json lexmap.policy.json
```

If you get exit code 0 (clean), push. If you get exit code 1 (violations), fix them first.

You can add this as a pre-commit hook:

```bash
#!/bin/bash
# .git/hooks/pre-commit

python3 lexmap.scan/php_scanner.py src/ > php-scan.json
node lexmap.scan/lexmap-check.ts php-scan.json lexmap.policy.json

if [ $? -ne 0 ]; then
  echo "LexMap violations detected. Fix them before committing."
  exit 1
fi
```

---

## What if a scanner is too slow?

**Scanners are naive by design, but you can optimize them.**

If a scanner is slow:
- Profile it (e.g. `time python3 lexmap.scan/php_scanner.py src/`)
- Identify bottlenecks (e.g. regex backtracking, excessive file I/O)
- Optimize or rewrite (e.g. move PHP scanner from regex to `nikic/php-parser`)

If you improve a scanner, open a PR. We'll review it.

---

## Can I use this for compliance or security audits?

**Maybe, but that's not the primary goal.**

LexMap enforces **architectural policy**, not compliance policy.

If your compliance policy maps cleanly to module boundaries (e.g. "payment code must be isolated from marketing code"), then yes, LexMap can help.

But LexMap is not:
- A security scanner (use Snyk, SonarQube, etc.)
- A compliance dashboard (use your org's compliance tools)
- A PII detector

LexMap is for **architecture enforcement**. If your compliance needs align with that, great. If not, use the right tool for the job.

---

## Who built this?

LexMap was built to solve a real pain: architecture rules live in tribal knowledge, and violations slip through PR review.

If you have questions, open an issue on GitHub. If you want to contribute, read [CONTRIBUTING.md](../CONTRIBUTING.md).

We're not selling you a service. We're just making tools that make engineering less painful.
