#!/usr/bin/env node
/**
 * LexMap TypeScript/JavaScript Scanner Plugin
 *
 * Scans TypeScript and JavaScript files and extracts architectural facts.
 *
 * Contract: Outputs JSON conforming to ../docs/schemas/scanner-output.schema.json
 *
 * Usage:
 *     node ts_scanner.ts <directory> > output.json
 *
 * Philosophy:
 *     This scanner is DUMB BY DESIGN.
 *     It observes code and reports facts.
 *     It does NOT make architectural decisions.
 *
 *     - Extracts: classes, functions, interfaces, imports
 *     - Detects: feature flags, permission checks
 *     - Reports: what it sees, nothing more
 *
 *     LexMap (not the scanner) decides:
 *     - Which module a file belongs to
 *     - Whether an import is allowed
 *     - Whether a boundary is violated
 *
 * Output Schema:
 *     {
 *       "language": "typescript",
 *       "files": [
 *         {
 *           "path": "relative/path/to/File.ts",
 *           "declarations": [...],
 *           "imports": [...],
 *           "feature_flags": [...],
 *           "permissions": [...],
 *           "warnings": []
 *         }
 *       ]
 *     }
 *
 * Dependencies:
 *     npm install typescript glob
 *
 * Author: LexMap Scanner Plugin
 * License: MIT
 */

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

interface Declaration {
  type: string;
  name: string;
  namespace?: string;
}

interface Import {
  from: string;
  type: string;
  imported?: string[];
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

class TypeScriptScanner {
  private rootDir: string;
  private output: ScannerOutput;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this.output = {
      language: "typescript",
      files: [],
    };
  }

  async scan(): Promise<ScannerOutput> {
    // Find all .ts and .tsx files (excluding node_modules, .d.ts)
    const pattern = `${this.rootDir}/**/*.{ts,tsx}`;
    const files = await glob(pattern, {
      ignore: ["**/node_modules/**", "**/*.d.ts"],
    });

    for (const filePath of files) {
      const fileData = this.scanFile(filePath);
      if (fileData) {
        this.output.files.push(fileData);
      }
    }

    return this.output;
  }

  private scanFile(filePath: string): FileData | null {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const relativePath = path.relative(this.rootDir, filePath);

      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const fileData: FileData = {
        path: relativePath,
        declarations: this.extractDeclarations(sourceFile),
        imports: this.extractImports(sourceFile),
        feature_flags: this.extractFeatureFlags(content),
        permissions: this.extractPermissions(content),
        warnings: [],
      };

      return fileData;
    } catch (error) {
      return null;
    }
  }

  private extractDeclarations(sourceFile: ts.SourceFile): Declaration[] {
    const declarations: Declaration[] = [];

    const visit = (node: ts.Node) => {
      // Extract classes
      if (ts.isClassDeclaration(node) && node.name) {
        declarations.push({
          type: "class",
          name: node.name.text,
        });
      }

      // Extract interfaces
      if (ts.isInterfaceDeclaration(node)) {
        declarations.push({
          type: "interface",
          name: node.name.text,
        });
      }

      // Extract type aliases
      if (ts.isTypeAliasDeclaration(node)) {
        declarations.push({
          type: "type",
          name: node.name.text,
        });
      }

      // Extract function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        declarations.push({
          type: "function",
          name: node.name.text,
        });
      }

      // Extract const/let/var declarations (top-level exports)
      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((decl) => {
          if (ts.isIdentifier(decl.name)) {
            // Check if it's exported
            const modifiers = node.modifiers;
            if (
              modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
            ) {
              declarations.push({
                type: "variable",
                name: decl.name.text,
              });
            }
          }
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return declarations;
  }

  private extractImports(sourceFile: ts.SourceFile): Import[] {
    const imports: Import[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const from = moduleSpecifier.text;
          const imported: string[] = [];

          if (node.importClause) {
            const { namedBindings } = node.importClause;

            // import { A, B } from 'module'
            if (namedBindings && ts.isNamedImports(namedBindings)) {
              namedBindings.elements.forEach((element) => {
                imported.push(element.name.text);
              });
            }

            // import * as name from 'module'
            if (namedBindings && ts.isNamespaceImport(namedBindings)) {
              imported.push(namedBindings.name.text);
            }

            // import defaultName from 'module'
            if (node.importClause.name) {
              imported.push(node.importClause.name.text);
            }
          }

          imports.push({
            from,
            type: "import_statement",
            imported: imported.length > 0 ? imported : undefined,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return imports;
  }

  private extractFeatureFlags(content: string): string[] {
    const flags = new Set<string>();

    // Pattern: featureFlags.isEnabled('flag_name')
    const pattern1 = /featureFlags\.isEnabled\(['"](\w+)['"]\)/g;
    let match;
    while ((match = pattern1.exec(content)) !== null) {
      flags.add(match[1]);
    }

    // Pattern: FeatureFlags.enabled('flag_name')
    const pattern2 = /FeatureFlags\.enabled\(['"](\w+)['"]\)/g;
    while ((match = pattern2.exec(content)) !== null) {
      flags.add(match[1]);
    }

    // Pattern: useFeatureFlag('flag_name')
    const pattern3 = /useFeatureFlag\(['"](\w+)['"]\)/g;
    while ((match = pattern3.exec(content)) !== null) {
      flags.add(match[1]);
    }

    return Array.from(flags).sort();
  }

  private extractPermissions(content: string): string[] {
    const permissions = new Set<string>();

    // Pattern: user.can('permission_name')
    const pattern1 = /user\.can\(['"](\w+)['"]\)/g;
    let match;
    while ((match = pattern1.exec(content)) !== null) {
      permissions.add(match[1]);
    }

    // Pattern: hasPermission('permission_name')
    const pattern2 = /hasPermission\(['"](\w+)['"]\)/g;
    while ((match = pattern2.exec(content)) !== null) {
      permissions.add(match[1]);
    }

    // Pattern: usePermission('permission_name')
    const pattern3 = /usePermission\(['"](\w+)['"]\)/g;
    while ((match = pattern3.exec(content)) !== null) {
      permissions.add(match[1]);
    }

    return Array.from(permissions).sort();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("Usage: node ts_scanner.ts <directory>");
    console.error("");
    console.error(
      "Outputs JSON conforming to ../docs/schemas/scanner-output.schema.json"
    );
    process.exit(1);
  }

  const directory = args[0];

  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    console.error(`Error: ${directory} is not a directory`);
    process.exit(1);
  }

  const scanner = new TypeScriptScanner(directory);
  const output = await scanner.scan();

  // Output JSON to stdout
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
