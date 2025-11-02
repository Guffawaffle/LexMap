#!/usr/bin/env node
/**
 * LexMap Merge Tool
 *
 * Combines scanner outputs from multiple language scanners into a single unified view.
 *
 * Usage:
 *     lexmap merge scanner1.json scanner2.json ... > merged.json
 *
 * Philosophy:
 *     This tool MERGES scanner outputs, it does NOT enforce policy.
 *     Policy enforcement happens AFTER merge, using lexmap.policy.json.
 *
 * Flow:
 *     1. Read all scanner output JSON files
 *     2. Validate each against scanner-output.schema.json
 *     3. Merge file lists (deduplicating by path)
 *     4. Output unified scanner-output.json
 *
 * Next Step:
 *     Feed merged output to policy checker which:
 *     - Resolves file paths → module_scope (using lexmap.policy.json)
 *     - Checks allowed_callers vs actual imports
 *     - Reports violations
 *
 * Author: LexMap
 * License: MIT
 */

import * as fs from "fs";
import * as path from "path";

interface Declaration {
  type: string;
  name: string;
  namespace?: string;
}

interface Import {
  from: string;
  type: string;
  imported?: string[];
  alias?: string | null;
}

interface FileData {
  path: string;
  declarations: Declaration[];
  imports: Import[];
  feature_flags: string[];
  permissions: string[];
  warnings: string[];
}

interface ScannerOutput {
  language: string;
  files: FileData[];
}

interface MergedOutput {
  sources: string[];
  files: FileData[];
}

class LexMapMerge {
  private scannerOutputs: ScannerOutput[] = [];
  private fileMap: Map<string, FileData> = new Map();

  loadScanner(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data: ScannerOutput = JSON.parse(content);

      // Basic validation
      if (!data.language || !Array.isArray(data.files)) {
        console.error(
          `Error: ${filePath} does not conform to scanner-output.schema.json`
        );
        process.exit(1);
      }

      this.scannerOutputs.push(data);
      console.error(
        `Loaded scanner output: ${filePath} (${data.language}, ${data.files.length} files)`
      );
    } catch (error) {
      console.error(`Error loading ${filePath}:`, error);
      process.exit(1);
    }
  }

  merge(): MergedOutput {
    const sources: string[] = [];

    // Collect all files, deduplicating by path
    for (const scanner of this.scannerOutputs) {
      sources.push(scanner.language);

      for (const file of scanner.files) {
        const existingFile = this.fileMap.get(file.path);

        if (existingFile) {
          // File already seen - merge metadata
          // This shouldn't happen often (different scanners for different languages)
          // but handle it gracefully
          console.error(
            `Warning: File ${file.path} appears in multiple scanner outputs`
          );

          // Merge arrays (deduplicate)
          existingFile.feature_flags = [
            ...new Set([...existingFile.feature_flags, ...file.feature_flags]),
          ].sort();
          existingFile.permissions = [
            ...new Set([...existingFile.permissions, ...file.permissions]),
          ].sort();
          existingFile.warnings = [
            ...new Set([...existingFile.warnings, ...file.warnings]),
          ];
        } else {
          // New file - add to map
          this.fileMap.set(file.path, file);
        }
      }
    }

    return {
      sources,
      files: Array.from(this.fileMap.values()).sort((a, b) =>
        a.path.localeCompare(b.path)
      ),
    };
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(
      "Usage: lexmap merge <scanner1.json> <scanner2.json> ... > merged.json"
    );
    console.error("");
    console.error("Combines scanner outputs from multiple language scanners.");
    console.error("Output conforms to scanner-output.schema.json structure.");
    console.error("");
    console.error("Example:");
    console.error("  python3 php_scanner.py app/ > php.json");
    console.error("  node ts_scanner.ts ui/ > ts.json");
    console.error("  lexmap merge php.json ts.json > merged.json");
    process.exit(1);
  }

  const merger = new LexMapMerge();

  // Load all scanner outputs
  for (const scannerFile of args) {
    if (!fs.existsSync(scannerFile)) {
      console.error(`Error: File not found: ${scannerFile}`);
      process.exit(1);
    }
    merger.loadScanner(scannerFile);
  }

  // Merge and output
  const merged = merger.merge();

  console.log(JSON.stringify(merged, null, 2));
  console.error(
    `\nMerged ${merged.files.length} files from ${merged.sources.length} scanners`
  );
}

main();
