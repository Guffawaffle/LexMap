# LexMap Policy Configuration

The optional `lexmap.policy.json` file allows you to configure module boundaries, dependency rules, pattern detection, and heuristics for your codebase.

## Structure

### Module Patterns

Define logical module boundaries using glob patterns:

```json
{
  "modules": {
    "patterns": [
      {"name": "core", "match": "src/core/**"},
      {"name": "adapters", "match": "src/adapters/**"},
      {"name": "controllers", "match": "src/controllers/**"}
    ]
  }
}
```

### Allowed Dependencies

Enforce architectural constraints:

```json
{
  "modules": {
    "allowed_deps": [
      {"from": "controllers", "to": "services"},
      {"from": "services", "to": "repositories"},
      {"from": "core", "to": "adapters"}
    ]
  }
}
```

Any violation will be reported in `codemap.query --type violations`.

### Kill Patterns

Exclude specific patterns from analysis:

```json
{
  "kill_patterns": [
    {"kind": "pass_through_wrapper", "match": "*/SurescriptsPayloadParser.php"},
    {"kind": "generated_code", "match": "**/*.generated.ts"}
  ]
}
```

### Heuristics Configuration

Control dynamic resolution strategies:

```json
{
  "heuristics": {
    "enable": true,
    "di_patterns": [
      {
        "kind": "container_get",
        "match": "$container->get('%s')"
      },
      {
        "kind": "global_app",
        "match": "app('%s')"
      },
      {
        "kind": "factory_make",
        "class": "ServiceFactory",
        "method": "make"
      }
    ],
    "confidence": {
      "hard": 0.95,
      "soft": 0.6
    }
  }
}
```

**Heuristic Modes:**
- `hard`: Only high-confidence resolutions (≥0.95)
- `soft`: Include lower-confidence edges (≥0.6) when determinism target not met
- `off`: No heuristics, only static analysis

### Determinism Target

Set the minimum ratio of deterministic edges:

```json
{
  "determinism_target": 0.95
}
```

If the static analysis pass produces fewer edges than this ratio, heuristics will be enabled according to the `--heuristics` CLI flag.

## Example: Full Policy

```json
{
  "modules": {
    "patterns": [
      {"name": "hie", "match": "barebones/integrations/hie/**"},
      {"name": "patients", "match": "awa/resources/apps/js/patients/**"},
      {"name": "core", "match": "src/core/**"},
      {"name": "services", "match": "src/services/**"}
    ],
    "allowed_deps": [
      {"from": "core", "to": "adapters"},
      {"from": "controllers", "to": "services"},
      {"from": "services", "to": "repositories"}
    ]
  },
  "kill_patterns": [
    {"kind": "pass_through_wrapper", "match": "*/SurescriptsPayloadParser.php"},
    {"kind": "generated", "match": "**/*.generated.ts"}
  ],
  "heuristics": {
    "enable": true,
    "di_patterns": [
      {"kind": "container_get", "match": "$container->get('%s')"},
      {"kind": "global_app", "match": "app('%s')"},
      {"kind": "factory_make", "class": "ServiceFactory", "method": "make"}
    ],
    "confidence": {"hard": 0.95, "soft": 0.6}
  },
  "determinism_target": 0.95
}
```

## Defaults

If no policy file is provided, LexMap uses these defaults:
- **Modules**: Learned from directory structure
- **Dependencies**: All allowed
- **Heuristics**: Auto mode (enabled if determinism < target)
- **Determinism target**: 0.95
