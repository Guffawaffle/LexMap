# Contributing to LexMap

LexMap is open source. We welcome contributions that make it more useful, more accurate, or easier to adopt—but we won't accept changes that violate the core principles:

1. **Policy is sacred** — `lexmap.policy.json` is a first-class artifact, reviewed like code
2. **Scanners are dumb by design** — they observe facts, they don't make architecture decisions
3. **THE CRITICAL RULE** — module names must match everywhere (LexMap, LexBrain, violation reports)
4. **Local-first** — no forced cloud upload, no telemetry

---

## How to Contribute

### No Corporate Fluff

We don't want "activity for the sake of activity." We want actual improvements:

- Better scanner accuracy (e.g. moving PHP scanner from regex to a proper parser)
- New language support (Go, Rust, Java, C#, etc.)
- Better violation reporting (clearer messages, better exit codes)
- Tighter LexBrain integration
- Bug fixes

If you have something like that, open a PR. Explain the problem. Show before/after. We'll review it.

### Before You Start

1. Check existing issues to see if someone is already working on it
2. If you're proposing a major change (especially to the policy schema), open an issue first
3. Make sure your changes don't break THE CRITICAL RULE or the local-first design

---

## How to Add a New Language Scanner

Scanners are the heart of LexMap. They're **dumb by design**—they observe code and emit facts, but they don't make architecture decisions.

A scanner takes a directory path and outputs JSON with:

- Files analyzed
- Symbols declared (classes, functions, etc.)
- Imports/calls made
- Feature flags referenced
- Permissions enforced
- Kill patterns detected

### Example Scanner Output

```json
{
  "files": [
    {
      "path": "src/UserController.php",
      "symbols_declared": ["UserController"],
      "imports": ["App\\Services\\AuthCore\\AuthTokenValidator"],
      "calls": ["AuthTokenValidator::validate"],
      "feature_flags": ["beta_user_admin"],
      "permissions": ["can_manage_users"],
      "kill_patterns": ["direct_auth_core_call"]
    }
  ]
}
```

### Steps to Add a New Scanner

1. **Pick a language** (e.g. Go, Rust, Java)

2. **Create a new directory** under `lexmap.scan/`:

   ```bash
   mkdir lexmap.scan/go_scanner
   ```

3. **Write the scanner**

   Use the language's standard AST/parser library:
   - Go: `go/parser`, `go/ast`
   - Rust: `syn`
   - Java: `JavaParser` or similar

   Your scanner should:
   - Walk the AST
   - Extract symbols, imports, calls, feature flags, permissions
   - Detect kill patterns (if configured)
   - Output JSON

4. **Follow the schema**

   See `docs/schemas/scanner-output.schema.json` for the exact format.

5. **Test it**

   ```bash
   # Run your scanner
   go run lexmap.scan/go_scanner/main.go src/ > go-scan.json

   # Merge it with other outputs
   node lexmap.scan/lexmap-merge.ts go-scan.json ts-scan.json > merged.json

   # Check for violations
   node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
   ```

6. **Document it**

   Update `README.md` and `docs/ADOPTION_GUIDE.md` with scanner usage examples.

7. **Open a PR**

   Explain what language you're adding, what parser you're using, and show example output.

### Scanners Are Dumb by Design

This is intentional. Scanners should **not**:

- Decide whether a call is "allowed" or "forbidden"
- Interpret policy
- Make guesses about module boundaries

Scanners should **only**:

- Observe what code actually does
- Emit facts
- Let `lexmap check` make the policy decisions

If your scanner starts implementing policy logic, it's doing too much.

---

## How to Update `lexmap.policy.json`

`lexmap.policy.json` is the source of truth for architecture policy. It defines:

- Which modules exist
- What code each module owns
- Who's allowed to call it
- Who's forbidden from calling it
- What flags/permissions gate it
- Which anti-patterns we're deleting

### Updating Policy

If you want to change policy (add a module, change `allowed_callers`, etc.):

1. **Open a PR** — policy changes are reviewed like code
2. **Explain why** — what problem does this solve? What's broken without it?
3. **Update docs** — if you're adding a new module, update examples in `README.md` and `docs/OVERVIEW.md`
4. **Test it** — run `lexmap check` with the new policy and show that violations are caught correctly

### Policy Schema

See `docs/schemas/policy.schema.json` for the exact format.

Example:

```json
{
  "modules": {
    "services/auth-core": {
      "owns_namespaces": ["App\\Services\\AuthCore\\"],
      "owns_paths": ["src/services/auth-core/**"],
      "exposes": ["AuthTokenValidator", "UserIdentityResolver"],
      "allowed_callers": ["services/user-access-api"],
      "forbidden_callers": ["ui/user-admin-panel"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": ["duplicate_auth_logic"],
      "notes": "Central auth. Must not be called directly by UI."
    }
  },
  "global_kill_patterns": [
    "duplicate_auth_logic",
    "ui_calling_auth_core_directly"
  ]
}
```

---

## How to Run Tests / Validate Schemas

Before you open a PR, make sure:

1. **Scanner output matches the schema**

   ```bash
   # Validate scanner output
   ajv validate -s docs/schemas/scanner-output.schema.json -d php-scan.json
   ```

2. **Policy file matches the schema**

   ```bash
   # Validate policy
   ajv validate -s docs/schemas/policy.schema.json -d lexmap.policy.json
   ```

3. **`lexmap check` runs without errors**

   ```bash
   node lexmap.scan/lexmap-check.ts merged.json lexmap.policy.json
   # Should exit 0 (clean) or 1 (violations), never 2 (tool error)
   ```

If you get a tool error (exit 2), that's a bug. Fix it before opening a PR.

---

## Coding Style Expectations

We care about **simple, explainable, deterministic** code.

### Simple

- No clever one-liners if a loop is clearer
- No premature abstraction
- Prefer explicit over implicit

### Explainable

- Comment complex logic
- Use descriptive variable names
- Write commit messages that explain **why**, not just **what**

### Deterministic

- Scanners should produce the same output given the same input
- No randomness, no network calls, no system state dependencies
- If you need randomness (e.g. for AI planning), make it opt-in and seed it explicitly

### Code Style

- **TypeScript/JavaScript**: Use `prettier` and `eslint`
- **PHP**: Follow PSR-12
- **Python**: Follow PEP 8

If your PR has style violations, we'll ask you to fix them.

---

## LexBrain Integration

If you're improving LexBrain integration (e.g. better `module_scope` resolution, better Frame metadata):

1. **Respect THE CRITICAL RULE** — `module_scope` must use the exact module IDs from `lexmap.policy.json`
2. **Don't invent module names** — if LexMap doesn't recognize a file, leave it out of `module_scope`
3. **Document the change** — update `docs/ARCHITECTURE_LOOP.md` to explain how the integration works

---

## License Expectations

LexMap is **MIT** unless otherwise noted.

By contributing, you agree that your contributions will be licensed under MIT.

If you're adding third-party code or dependencies, make sure:

- The license is compatible with MIT
- You include proper attribution
- You update `package.json` or `composer.json` with the dependency

---

## What We Won't Merge

- Changes that break THE CRITICAL RULE
- Changes that make scanners "smart" (they're dumb by design)
- Changes that require cloud services or telemetry by default
- Changes that make the policy schema unstable
- Changes that introduce randomness or non-determinism without explicit opt-in

---

## Questions?

Open an issue. Explain what you're trying to do and why. We'll help you figure out if it fits LexMap's design principles.

We're not gatekeepers. We're just making sure LexMap stays useful, deterministic, and local-first.
