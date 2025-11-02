import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { CodeGraph, Policy } from '../types.js';

export async function extractPHPGraph(
  files: string[],
  workers: number,
  policy: Policy
): Promise<CodeGraph> {
  // Write file list to temp file
  const fileListPath = join(process.cwd(), '.lexmap-php-files.tmp');
  await writeFile(fileListPath, files.join('\n'), 'utf8');

  const phpBin = join(process.cwd(), 'packages/codemap-php/bin/index.php');

  return new Promise((resolve, reject) => {
    const chunks: string[] = [];

    const child = spawn('php', [
      phpBin,
      '--files', `@${fileListPath}`,
      '--base', process.cwd(),
      '--jsonl'
    ]);

    child.stdout.on('data', (data) => {
      chunks.push(data.toString());
    });

    child.stderr.on('data', (data) => {
      console.error('PHP indexer error:', data.toString());
    });

    child.on('close', async (code) => {
      // Clean up temp file
      try {
        await unlink(fileListPath);
      } catch {}

      if (code !== 0) {
        reject(new Error(`PHP indexer exited with code ${code}`));
        return;
      }

      // Parse JSONL
      const lines = chunks.join('').trim().split('\n').filter(Boolean);
      const graph: CodeGraph = {
        symbols: [],
        calls: [],
        modules: []
      };

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.symbols) graph.symbols.push(...data.symbols);
          if (data.calls) graph.calls.push(...data.calls);
          if (data.modules) graph.modules.push(...data.modules);
        } catch (err) {
          console.error('Failed to parse JSONL:', line);
        }
      }

      resolve(graph);
    });
  });
}
