import kleur from 'kleur';
import { readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { globby } from 'globby';
import { initGit, getGitInfo, getChangedFilesSince } from '../git.js';
import { sha256 } from '../hash.js';
import { initCompress } from '../compress.js';
import { initLexBrain, putFact } from '../lexbrain.js';
import { buildFrames } from '../frames.js';
import { extractTSGraph } from '../indexers/ts.js';
import { extractPHPGraph } from '../indexers/php.js';
import { loadPolicy } from '../policy.js';
import { generatePlan } from '../planner/ai.js';
import { CodeGraph, IndexConfig, MetricsData, PlanJSON } from '../types.js';

interface IndexOptions {
  cold: boolean;
  planAi: boolean;
  determinismTarget: string;
  heuristics: string;
  lexbrain: string;
  mode: string;
  keyHex?: string;
  phpWorkers: string;
  tsWorkers: string;
  policy: string;
  serve: boolean;
}

export async function indexCommand(options: IndexOptions): Promise<void> {
  const startTime = Date.now();

  console.log(kleur.cyan('🗺️  LexMap Indexer'));
  console.log(kleur.dim(`Mode: ${options.cold ? 'cold' : 'incremental'}`));

  try {
    // Initialize
    await initCompress();
    await initGit(process.cwd());

    initLexBrain({
      url: options.lexbrain,
      mode: options.mode as 'local' | 'zk',
      keyHex: options.keyHex
    });

    // Load policy
    const policy = await loadPolicy(options.policy);

    // Get git info
    const gitInfo = await getGitInfo();
    const repo = await getRepoName();

    console.log(kleur.dim(`Repo: ${repo}`));
    console.log(kleur.dim(`Commit: ${gitInfo.head}`));

    // Determine files to process
    let filesToProcess: string[];
    if (options.cold) {
      filesToProcess = gitInfo.files.map(f => f.path);
    } else {
      filesToProcess = await getChangedFilesSince();
    }

    // Filter by extension
    const tsFiles = filesToProcess.filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
    const phpFiles = filesToProcess.filter(f => /\.php$/.test(f));

    console.log(kleur.dim(`Files: ${tsFiles.length} TS/JS, ${phpFiles.length} PHP`));

    // Build deterministic inputs
    const langVersions = {
      node: process.version,
      typescript: '5.6.3'
    };

    let plan: PlanJSON | undefined;
    if (options.planAi) {
      console.log(kleur.yellow('🤖 Generating AI plan...'));
      plan = await generatePlan(repo, gitInfo, filesToProcess);

      // Store plan as fact
      const planFrames = await buildFrames(
        'codemap.plan',
        { repo, commit: gitInfo.head },
        sha256({ langVersions, plan }),
        plan
      );

      for (const frame of planFrames) {
        await putFact(frame);
      }

      console.log(kleur.green('✓ Plan frozen'));
    }

    const deterministicInputs = {
      langVersions,
      config: {
        determinism_target: parseFloat(options.determinismTarget),
        heuristics: options.heuristics,
        php_workers: parseInt(options.phpWorkers),
        ts_workers: parseInt(options.tsWorkers)
      },
      git: {
        head: gitInfo.head,
        files: gitInfo.files
      },
      policy,
      plan
    };

    const inputsHash = sha256(deterministicInputs);
    console.log(kleur.dim(`Inputs hash: ${inputsHash.substring(0, 12)}...`));

    // Extract graphs
    console.log(kleur.yellow('📊 Extracting code graph...'));

    const tsGraph = tsFiles.length > 0
      ? await extractTSGraph(tsFiles, parseInt(options.tsWorkers))
      : { symbols: [], calls: [], modules: [] };

    const phpGraph = phpFiles.length > 0
      ? await extractPHPGraph(phpFiles, parseInt(options.phpWorkers), policy)
      : { symbols: [], calls: [], modules: [] };

    // Merge graphs
    const fullGraph: CodeGraph = {
      symbols: [...tsGraph.symbols, ...phpGraph.symbols],
      calls: [...tsGraph.calls, ...phpGraph.calls],
      modules: [...tsGraph.modules, ...phpGraph.modules]
    };

    // Compute determinism ratio
    const staticCalls = fullGraph.calls.filter(c => c.kind === 'direct').length;
    const totalCalls = fullGraph.calls.length;
    const detRatio = totalCalls > 0 ? staticCalls / totalCalls : 1.0;

    console.log(kleur.dim(`Determinism: ${(detRatio * 100).toFixed(1)}% (${staticCalls}/${totalCalls} edges)`));

    const targetRatio = parseFloat(options.determinismTarget);
    if (detRatio < targetRatio && options.heuristics !== 'off') {
      console.log(kleur.yellow(`⚠️  Below target (${targetRatio}), heuristics would be applied`));
      // Note: heuristics are already applied in PHP indexer based on policy
    }

    // Build and store frames
    console.log(kleur.yellow('💾 Storing frames...'));

    const scope = { repo, commit: gitInfo.head };
    let framesWritten = 0;
    let putTimes: number[] = [];

    // Symbols
    if (fullGraph.symbols.length > 0) {
      const frames = await buildFrames('codemap.symbols', scope, inputsHash, fullGraph.symbols);
      for (const frame of frames) {
        const putStart = Date.now();
        const result = await putFact(frame);
        putTimes.push(Date.now() - putStart);
        if (result.inserted) framesWritten++;
      }
    }

    // Calls
    if (fullGraph.calls.length > 0) {
      const frames = await buildFrames('codemap.calls', scope, inputsHash, fullGraph.calls);
      for (const frame of frames) {
        const putStart = Date.now();
        const result = await putFact(frame);
        putTimes.push(Date.now() - putStart);
        if (result.inserted) framesWritten++;
      }
    }

    // Modules
    if (fullGraph.modules.length > 0) {
      const frames = await buildFrames('codemap.modules', scope, inputsHash, fullGraph.modules);
      for (const frame of frames) {
        const putStart = Date.now();
        const result = await putFact(frame);
        putTimes.push(Date.now() - putStart);
        if (result.inserted) framesWritten++;
      }
    }

    // Compute metrics
    const wallMs = Date.now() - startTime;
    const putP95 = computeP95(putTimes);

    const metrics: MetricsData = {
      det_ratio: detRatio,
      edges_static: staticCalls,
      edges_total: totalCalls,
      frames_written: framesWritten,
      wall_ms: wallMs,
      peak_ram_mb: process.memoryUsage().heapUsed / 1024 / 1024,
      put_p95_ms: putP95
    };

    // Store metrics
    const metricsFrames = await buildFrames('codemap.metrics', scope, inputsHash, metrics);
    for (const frame of metricsFrames) {
      await putFact(frame);
    }

    console.log(kleur.green(`✓ Complete in ${wallMs}ms`));
    console.log(kleur.dim(`  Frames: ${framesWritten} new`));
    console.log(kleur.dim(`  Symbols: ${fullGraph.symbols.length}`));
    console.log(kleur.dim(`  Calls: ${fullGraph.calls.length}`));
    console.log(kleur.dim(`  Modules: ${fullGraph.modules.length}`));

    if (options.serve) {
      console.log(kleur.yellow('🚀 Starting MCP server...'));
      const { startServer } = await import('../server.js');
      await startServer(options.lexbrain, options.mode, options.keyHex);
    }

  } catch (error) {
    console.error(kleur.red('Error:'), error);
    process.exit(1);
  }
}

async function getRepoName(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    return pkg.name || 'unknown';
  } catch {
    return 'unknown';
  }
}

function computeP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[idx] || 0;
}
