import kleur from 'kleur';
import { initLexBrain, getFacts } from '../lexbrain.js';
import { fromB64 } from '../compress.js';
import { initCompress } from '../compress.js';

interface QueryOptions {
  type: string;
  args: string;
  lexbrain: string;
  mode: string;
  keyHex?: string;
}

export async function queryCommand(options: QueryOptions): Promise<void> {
  console.log(kleur.cyan('🔎 LexMap Query'));

  try {
    await initCompress();

    initLexBrain({
      url: options.lexbrain,
      mode: options.mode as 'local' | 'zk',
      keyHex: options.keyHex
    });

    const args = JSON.parse(options.args);

    let result: any;

    switch (options.type) {
      case 'callers':
        result = await queryCallers(args.symbol);
        break;
      case 'callees':
        result = await queryCallees(args.symbol);
        break;
      case 'module_deps':
        result = await queryModuleDeps(args.module);
        break;
      case 'recent_patterns':
        result = await queryPatterns();
        break;
      case 'violations':
        result = await queryViolations();
        break;
      default:
        throw new Error(`Unknown query type: ${options.type}`);
    }

    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error(kleur.red('Error:'), error);
    process.exit(1);
  }
}

async function queryCallers(symbolId: string): Promise<any> {
  const callFacts = await getFacts({ kind: 'codemap.calls', limit: 1000 });
  const calls = await decompressFacts(callFacts);

  return calls.filter((c: any) => c.to === symbolId);
}

async function queryCallees(symbolId: string): Promise<any> {
  const callFacts = await getFacts({ kind: 'codemap.calls', limit: 1000 });
  const calls = await decompressFacts(callFacts);

  return calls.filter((c: any) => c.from === symbolId);
}

async function queryModuleDeps(moduleId: string): Promise<any> {
  const moduleFacts = await getFacts({ kind: 'codemap.modules', limit: 1000 });
  const modules = await decompressFacts(moduleFacts);

  return modules.filter((m: any) => m.from === moduleId || m.to === moduleId);
}

async function queryPatterns(): Promise<any> {
  const patternFacts = await getFacts({ kind: 'codemap.patterns', limit: 100 });
  return await decompressFacts(patternFacts);
}

async function queryViolations(): Promise<any> {
  // This would check policy violations - simplified for now
  return { violations: [] };
}

async function decompressFacts(facts: any[]): Promise<any[]> {
  const result: any[] = [];

  for (const fact of facts) {
    const data = await fromB64(fact.payload_b64);
    if (data.items) {
      result.push(...data.items);
    } else if (Array.isArray(data)) {
      result.push(...data);
    } else {
      result.push(data);
    }
  }

  return result;
}
