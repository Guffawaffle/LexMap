import { GitInfo, PlanJSON } from '../types.js';

/**
 * AI-powered planner that generates execution plan for indexing
 * This is a simplified version - would typically call an LLM API
 */
export async function generatePlan(
  repo: string,
  gitInfo: GitInfo,
  files: string[]
): Promise<PlanJSON> {
  // Analyze file sizes and types
  const tsFiles = files.filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
  const phpFiles = files.filter(f => /\.php$/.test(f));

  // Simple heuristic-based planning
  const totalFiles = files.length;
  const shardSize = Math.ceil(totalFiles / 4);

  const shards = [];
  for (let i = 0; i < files.length; i += shardSize) {
    shards.push({
      name: `shard-${shards.length}`,
      files: files.slice(i, i + shardSize),
      worker_count: 2
    });
  }

  // Determine budgets based on size
  const budgets = {
    max_wall_ms: totalFiles > 1000 ? 900000 : 120000,
    max_mem_mb: totalFiles > 1000 ? 4096 : 2048
  };

  // Heuristics ladder
  const heuristics_ladder = ['static', 'hard', 'soft'];

  return {
    shards,
    budgets,
    heuristics_ladder,
    ts: new Date().toISOString()
  };
}
