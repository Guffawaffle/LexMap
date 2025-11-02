# TypeScript/JavaScript Indexer

Extracts symbols, calls, and module dependencies from TypeScript and JavaScript files using `ts-morph`.

## Usage

```typescript
import { extractTSGraph } from '@lex/lexmap-ts';

const files = ['src/index.ts', 'src/util.ts'];
const graph = await extractTSGraph(files);

console.log(graph.symbols); // All symbol definitions
console.log(graph.calls);   // All call edges
console.log(graph.modules); // Module dependency graph
```

## Output Schema

### Symbols
```typescript
{
  id: string;          // Unique identifier
  fqname: string;      // Fully qualified name
  kind: string;        // class | function | method | variable
  file: string;        // Source file path
  span: { start: number; end: number };
  visibility?: string; // public | private
  modifiers?: string[];
}
```

### Calls
```typescript
{
  from: string;        // Caller symbol ID
  to: string;          // Callee symbol ID
  site: { file: string; line: number; col: number };
  kind: 'direct';      // Only deterministic calls
}
```

### Modules
```typescript
{
  from: string;        // Source module ID
  to: string;          // Target module ID
  weight: number;      // Import count
}
```
