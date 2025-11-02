import kleur from 'kleur';
import { initLexBrain, getFacts } from '../lexbrain.js';
import { fromB64 } from '../compress.js';
import { initCompress } from '../compress.js';

interface SliceOptions {
  symbol: string;
  radius: string;
  lexbrain: string;
  mode: string;
  keyHex?: string;
}

export async function sliceCommand(options: SliceOptions): Promise<void> {
  console.log(kleur.cyan('🔍 LexMap Slice'));

  try {
    await initCompress();

    initLexBrain({
      url: options.lexbrain,
      mode: options.mode as 'local' | 'zk',
      keyHex: options.keyHex
    });

    const radius = parseInt(options.radius);

    // Fetch symbols and calls
    const symbolFacts = await getFacts({ kind: 'codemap.symbols', limit: 1000 });
    const callFacts = await getFacts({ kind: 'codemap.calls', limit: 1000 });

    // Decompress
    let allSymbols: any[] = [];
    let allCalls: any[] = [];

    for (const fact of symbolFacts) {
      const data = await fromB64(fact.payload_b64);
      if (data.items) {
        allSymbols.push(...data.items);
      } else if (Array.isArray(data)) {
        allSymbols.push(...data);
      }
    }

    for (const fact of callFacts) {
      const data = await fromB64(fact.payload_b64);
      if (data.items) {
        allCalls.push(...data.items);
      } else if (Array.isArray(data)) {
        allCalls.push(...data);
      }
    }

    // Find target symbol
    const target = allSymbols.find(s =>
      s.fqname === options.symbol || s.id === options.symbol
    );

    if (!target) {
      console.error(kleur.red(`Symbol not found: ${options.symbol}`));
      process.exit(1);
    }

    // Build slice
    const slice = buildSlice(target, allSymbols, allCalls, radius);

    console.log(JSON.stringify(slice, null, 2));

  } catch (error) {
    console.error(kleur.red('Error:'), error);
    process.exit(1);
  }
}

function buildSlice(
  target: any,
  symbols: any[],
  calls: any[],
  radius: number
): any {
  const symbolMap = new Map(symbols.map(s => [s.id, s]));
  const visited = new Set<string>();
  const result: any = {
    target,
    symbols: [],
    calls: []
  };

  // BFS from target
  const queue: Array<{ id: string; dist: number }> = [{ id: target.id, dist: 0 }];

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;

    if (visited.has(id) || dist > radius) continue;
    visited.add(id);

    const sym = symbolMap.get(id);
    if (sym) {
      result.symbols.push(sym);
    }

    // Find calls to/from this symbol
    const relatedCalls = calls.filter(c => c.from === id || c.to === id);

    for (const call of relatedCalls) {
      if (!result.calls.some((c: any) => c.from === call.from && c.to === call.to)) {
        result.calls.push(call);
      }

      // Add neighbors to queue
      if (call.from === id && !visited.has(call.to)) {
        queue.push({ id: call.to, dist: dist + 1 });
      }
      if (call.to === id && !visited.has(call.from)) {
        queue.push({ id: call.from, dist: dist + 1 });
      }
    }
  }

  return result;
}
