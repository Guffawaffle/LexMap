#!/usr/bin/env node
/**
 * LexMap Policy Checker
 *
 * Enforces architectural policy by checking scanner output against lexmap.policy.json.
 *
 * Usage:
 *     lexmap check <merged.json> <policy.json> [--ticket WEB-23621]
 *
 * What it does:
 *     1. Loads merged scanner output (from lexmap merge)
 *     2. Loads policy file (lexmap.policy.json)
 *     3. For each file:
 *        - Resolves file path → module_scope using owns_paths
 *        - Checks imports against allowed_callers/forbidden_callers
 *        - Detects kill_patterns in code
 *     4. Reports violations
 *
 * Exit codes:
 *     0 - No violations
 *     1 - Violations found
 *     2 - Error (file not found, schema invalid, etc.)
 *
 * Example:
 *     lexmap check merged.json lexmap.policy.json --ticket WEB-23621
 *
 *     Output:
 *     ❌ VIOLATION: ui/provider-endpoints/CreateEndpointModal.tsx
 *        Module: ui/provider-endpoints
 *        Imports: App\HIE\Surescripts\SurescriptsAdapter
 *        Problem: UI modules MUST NOT import HIE adapters directly
 *        Policy: forbidden_callers includes "ui/**"
 *        Fix: Use api/provider-endpoints-service instead
 *
 * Author: LexMap
 * License: MIT
 */

import * as fs from "fs";
import * as path from "path";

interface PolicyModule {
  owns_namespaces: string[];
  owns_paths: string[];
  exposes: string[];
  allowed_callers: string[];
  forbidden_callers: string[];
  feature_flags: string[];
  requires_permissions: string[];
  kill_patterns: string[];
}

interface Policy {
  modules: Record<string, PolicyModule>;
  global_kill_patterns: Array<{
    pattern: string;
    description: string;
  }>;
}

interface FileData {
  path: string;
  declarations: Array<{ type: string; name: string; namespace?: string }>;
  imports: Array<{ from: string; type: string }>;
  feature_flags: string[];
  permissions: string[];
  warnings: string[];
}

interface MergedScannerOutput {
  sources: string[];
  files: FileData[];
}

interface Violation {
  file: string;
  module: string;
  type: "forbidden_caller" | "kill_pattern" | "missing_permission";
  message: string;
  details: string;
}

class LexMapChecker {
  private policy: Policy;
  private violations: Violation[] = [];

  constructor(policyPath: string) {
    const content = fs.readFileSync(policyPath, "utf-8");
    this.policy = JSON.parse(content);
  }

  check(scannerOutput: MergedScannerOutput): void {
    for (const file of scannerOutput.files) {
      const moduleId = this.resolveFileToModule(file.path);

      if (!moduleId) {
        // File doesn't belong to any known module - skip
        continue;
      }

      const module = this.policy.modules[moduleId];

      // Check imports against forbidden_callers
      for (const imp of file.imports) {
        const importedModuleId = this.resolveImportToModule(imp.from);

        if (importedModuleId) {
          const importedModule = this.policy.modules[importedModuleId];

          if (importedModule && importedModule.forbidden_callers) {
            // Check if current module matches any forbidden_caller pattern
            for (const forbidden of importedModule.forbidden_callers) {
              if (this.matchPattern(moduleId, forbidden)) {
                this.violations.push({
                  file: file.path,
                  module: moduleId,
                  type: "forbidden_caller",
                  message: `Module ${moduleId} imports ${importedModuleId} but is forbidden`,
                  details: `Policy forbids: ${forbidden}`,
                });
              }
            }
          }
        }
      }

      // Check for kill patterns
      for (const warning of file.warnings) {
        this.violations.push({
          file: file.path,
          module: moduleId,
          type: "kill_pattern",
          message: `Kill pattern detected: ${warning}`,
          details: "",
        });
      }
    }
  }

  private resolveFileToModule(filePath: string): string | null {
    // Find which module owns this file path
    for (const [moduleId, module] of Object.entries(this.policy.modules)) {
      for (const pathPattern of module.owns_paths) {
        if (this.matchPath(filePath, pathPattern)) {
          return moduleId;
        }
      }
    }
    return null;
  }

  private resolveImportToModule(importPath: string): string | null {
    // Try to match by namespace first (PHP style)
    for (const [moduleId, module] of Object.entries(this.policy.modules)) {
      for (const namespace of module.owns_namespaces) {
        if (importPath.startsWith(namespace)) {
          return moduleId;
        }
      }
    }

    // Try to match by file path pattern (TypeScript/JS style)
    for (const [moduleId, module] of Object.entries(this.policy.modules)) {
      for (const pathPattern of module.owns_paths) {
        if (this.matchPath(importPath, pathPattern)) {
          return moduleId;
        }
      }
    }

    return null;
  }

  private matchPath(filePath: string, pattern: string): boolean {
    // Simple glob matching (** means any nested path)
    const regexPattern = pattern
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\//g, "\\/");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  private matchPattern(value: string, pattern: string): boolean {
    // Simple pattern matching (supports ** and * wildcards)
    const regexPattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }

  report(): void {
    if (this.violations.length === 0) {
      console.log("✅ No violations found");
      return;
    }

    console.log(`❌ Found ${this.violations.length} violation(s):\n`);

    for (const violation of this.violations) {
      console.log(`File: ${violation.file}`);
      console.log(`Module: ${violation.module}`);
      console.log(`Type: ${violation.type}`);
      console.log(`Message: ${violation.message}`);
      if (violation.details) {
        console.log(`Details: ${violation.details}`);
      }
      console.log("");
    }
  }

  hasViolations(): boolean {
    return this.violations.length > 0;
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: lexmap check <merged.json> <policy.json> [--ticket WEB-23621]"
    );
    console.error("");
    console.error("Checks scanner output against architectural policy.");
    console.error("");
    console.error("Example:");
    console.error("  lexmap merge php.json ts.json > merged.json");
    console.error("  lexmap check merged.json lexmap.policy.json");
    process.exit(2);
  }

  const scannerFile = args[0];
  const policyFile = args[1];

  if (!fs.existsSync(scannerFile)) {
    console.error(`Error: Scanner output not found: ${scannerFile}`);
    process.exit(2);
  }

  if (!fs.existsSync(policyFile)) {
    console.error(`Error: Policy file not found: ${policyFile}`);
    process.exit(2);
  }

  // Load scanner output
  const scannerContent = fs.readFileSync(scannerFile, "utf-8");
  const scannerOutput: MergedScannerOutput = JSON.parse(scannerContent);

  // Create checker and run
  const checker = new LexMapChecker(policyFile);
  checker.check(scannerOutput);

  // Report results
  checker.report();

  // Exit with appropriate code
  process.exit(checker.hasViolations() ? 1 : 0);
}

main();
