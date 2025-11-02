import { Project, SyntaxKind } from 'ts-morph';
import { CodeGraph, Symbol, Call, Module } from '../types.js';

export async function extractTSGraph(files: string[], workers: number): Promise<CodeGraph> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      target: 99, // ES2022
      module: 99, // ES2022
    }
  });

  // Add files
  for (const file of files) {
    try {
      project.addSourceFileAtPath(file);
    } catch {
      // Skip files that can't be parsed
    }
  }

  const symbols: Symbol[] = [];
  const calls: Call[] = [];
  const modules: Module[] = [];
  const moduleMap = new Map<string, Set<string>>();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const moduleId = getModuleId(filePath);

    // Extract symbols
    for (const cls of sourceFile.getClasses()) {
      const id = `${filePath}:${cls.getName()}`;
      symbols.push({
        id,
        fqname: cls.getName() || 'anonymous',
        kind: 'class',
        file: filePath,
        span: {
          start: cls.getStart(),
          end: cls.getEnd()
        },
        visibility: cls.getModifiers().some(m => m.getText() === 'export') ? 'public' : 'private',
        modifiers: cls.getModifiers().map(m => m.getText())
      });

      // Extract methods
      for (const method of cls.getMethods()) {
        const methodId = `${id}.${method.getName()}`;
        symbols.push({
          id: methodId,
          fqname: `${cls.getName()}.${method.getName()}`,
          kind: 'method',
          file: filePath,
          span: {
            start: method.getStart(),
            end: method.getEnd()
          },
          visibility: method.hasModifier(SyntaxKind.PublicKeyword) ? 'public' : 'private',
          modifiers: method.getModifiers().map(m => m.getText())
        });
      }
    }

    // Extract functions
    for (const fn of sourceFile.getFunctions()) {
      const id = `${filePath}:${fn.getName()}`;
      symbols.push({
        id,
        fqname: fn.getName() || 'anonymous',
        kind: 'function',
        file: filePath,
        span: {
          start: fn.getStart(),
          end: fn.getEnd()
        },
        visibility: fn.isExported() ? 'public' : 'private',
        modifiers: fn.getModifiers().map(m => m.getText())
      });
    }

    // Extract calls
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      const caller = findContainingSymbol(call.getStart(), symbols, filePath);

      if (!caller) continue;

      let calleeName: string | undefined;

      if (expr.getKind() === SyntaxKind.Identifier) {
        calleeName = expr.getText();
      } else if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
        const propAccess = expr.asKind(SyntaxKind.PropertyAccessExpression);
        calleeName = propAccess?.getName();
      }

      if (calleeName) {
        const callee = symbols.find(s => s.fqname.endsWith(calleeName!));

        if (callee) {
          calls.push({
            from: caller.id,
            to: callee.id,
            site: {
              file: filePath,
              line: sourceFile.getLineAndColumnAtPos(call.getStart()).line,
              col: sourceFile.getLineAndColumnAtPos(call.getStart()).column
            },
            kind: 'direct'
          });
        }
      }
    }

    // Track imports for module graph
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpec = importDecl.getModuleSpecifierValue();
      const targetModule = resolveModuleId(moduleSpec, filePath);

      if (!moduleMap.has(moduleId)) {
        moduleMap.set(moduleId, new Set());
      }
      moduleMap.get(moduleId)!.add(targetModule);
    }
  }

  // Build module graph
  for (const [from, toSet] of moduleMap.entries()) {
    for (const to of toSet) {
      modules.push({
        from,
        to,
        weight: 1
      });
    }
  }

  return { symbols, calls, modules };
}

function getModuleId(filePath: string): string {
  // Extract top-level directory or package name
  const parts = filePath.split('/');
  const srcIndex = parts.indexOf('src');
  if (srcIndex >= 0 && parts.length > srcIndex + 1) {
    return parts[srcIndex + 1];
  }
  return parts[0] || 'unknown';
}

function resolveModuleId(spec: string, fromFile: string): string {
  if (spec.startsWith('.')) {
    // Relative import
    return getModuleId(fromFile);
  }
  // External or absolute
  return spec.split('/')[0];
}

function findContainingSymbol(pos: number, symbols: Symbol[], file: string): Symbol | undefined {
  return symbols
    .filter(s => s.file === file)
    .find(s => pos >= s.span.start && pos <= s.span.end);
}
