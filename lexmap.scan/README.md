# LexMap Scanner Plugins

This directory contains **language scanner plugins** for LexMap.

## What is a scanner?

A scanner is a **dumb code observer** that:
- Reads source files in a specific language (PHP, TypeScript, Python, etc.)
- Extracts **facts** about what the code actually does
- Emits those facts in a standardized JSON format
- Does NOT make architectural judgments

**Scanners observe. LexMap enforces.**

## The Scanner Contract

All scanners MUST output JSON conforming to:
```
../docs/schemas/scanner-output.schema.json
```

### Required Output Structure

```json
{
  "language": "php",
  "files": [
    {
      "path": "app/hie/core/SurescriptsClient.php",
      "declarations": [
        {
          "type": "class",
          "name": "SurescriptsClient",
          "namespace": "App\\HIE\\Core"
        }
      ],
      "imports": [
        {
          "from": "GuzzleHttp\\Client",
          "type": "use_statement"
        }
      ],
      "feature_flags": ["enhanced_provider_lookup"],
      "permissions": ["hie_surescripts_read"],
      "warnings": []
    }
  ]
}
```

See `../docs/schemas/examples/` for complete examples.

## Philosophy: Scanners are Dumb by Design

**DO:**
- ✅ Observe declarations (classes, functions, interfaces)
- ✅ Extract imports/requires/use statements
- ✅ Detect feature flag references (e.g., `FeatureFlags::enabled('flag_name')`)
- ✅ Detect permission checks (e.g., `$user->can('permission_name')`)
- ✅ Report what you see, nothing more

**DON'T:**
- ❌ Decide which module a file belongs to (LexMap does that)
- ❌ Judge whether an import is "allowed" (LexMap policy does that)
- ❌ Filter based on architectural rules (LexMap does that)
- ❌ Try to be "smart" about boundaries (LexMap owns that)

**The scanner's job:** Turn code into facts.
**LexMap's job:** Turn facts into policy enforcement.

## Available Scanners

- **`php_scanner.py`** - Scans PHP files using nikic/php-parser
- **`ts_scanner.ts`** - Scans TypeScript/JavaScript using TypeScript Compiler API
- **`python_scanner.py`** - Scans Python using ast module

## Usage

Each scanner is invoked with:
```bash
# PHP scanner
python3 php_scanner.py <directory> > output.json

# TypeScript scanner
node ts_scanner.ts <directory> > output.json

# Python scanner
python3 python_scanner.py <directory> > output.json
```

Output is JSON on stdout conforming to `scanner-output.schema.json`.

## Integration Flow

```
1. Run scanners → scanner-output.json files
2. lexmap.merge combines all scanner outputs
3. LexMap resolves file paths → module_scope (using lexmap.policy.json)
4. LexMap checks allowed_callers vs actual imports
5. Violations reported

Scanner → LexMap → Enforcement
```

## Validation

Validate scanner output against schema:
```bash
npm install -g ajv-cli

ajv validate \
  -s ../docs/schemas/scanner-output.schema.json \
  -d php_scanner_output.json
```

## Adding a New Scanner

1. Pick a language (e.g., Rust, Go, Java)
2. Choose a parser library for that language
3. Implement scanner conforming to `scanner-output.schema.json`
4. Output facts, not opinions
5. Test with validation
6. Submit PR

**Key principle:** Scanners are plugins. LexMap doesn't care how you extract facts, as long as the output schema matches.

## The Critical Rule

Scanners emit facts about files.
LexMap maps files → modules via `owns_paths` in `lexmap.policy.json`.

**When LexBrain stores a Frame:**
- `module_scope` field MUST use module keys from LexMap
- NOT file paths, NOT arbitrary strings
- Module IDs like `hie/core`, `ui/provider-endpoints`

This is the vocabulary alignment that makes LexMap + LexBrain work together.

See: `../docs/schemas/README.md` for THE CRITICAL RULE

## Examples

See `../docs/schemas/examples/` for:
- `php-scanner-output.example.json`
- `typescript-scanner-output.example.json`
- `scanner-with-violations.example.json`

## Questions?

Read:
- `../docs/VISION.md` - Scanner plugin architecture
- `../docs/THE-FUTURE-MAP.md` - LexMap policy layer design
- `../docs/schemas/INTEGRATION.md` - Complete integration walkthrough
