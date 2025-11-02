# Policy Examples

This directory contains example policy configurations for common project types.

## Available Examples

### [laravel.policy.json](./laravel.policy.json)

Policy for Laravel PHP applications:
- Enforces MVC + Service/Repository pattern
- Detects Laravel DI patterns (app(), resolve(), facades)
- Excludes generated IDE helpers and vendor code
- Target: 95% determinism

**Usage:**
```bash
cp examples/laravel.policy.json lexmap.policy.json
```

### [typescript-monorepo.policy.json](./typescript-monorepo.policy.json)

Policy for TypeScript monorepos (Nx, Turborepo, etc.):
- Package dependency boundaries
- Prevents circular dependencies
- Excludes generated code and tests
- Target: 99% determinism (static types only)

**Usage:**
```bash
cp examples/typescript-monorepo.policy.json lexmap.policy.json
```

## Creating Your Own Policy

1. Start with the closest example
2. Adjust module patterns to match your structure
3. Define allowed dependencies based on your architecture
4. Add heuristics for your DI/IoC patterns (PHP mainly)
5. Test with `codemap query --type violations`

See [POLICY.md](../POLICY.md) for full documentation.
