#!/usr/bin/env node

import { Command } from 'commander';
import kleur from 'kleur';
import { indexCommand } from './commands/index.js';
import { sliceCommand } from './commands/slice.js';
import { queryCommand } from './commands/query.js';
import { atlasFrameCommand } from './commands/atlas-frame.js';

const program = new Command();

program
  .name('codemap')
  .description('LexMap AI-first code indexer')
  .version('0.1.0');

program
  .command('index')
  .description('Index codebase and store in LexBrain')
  .option('--cold', 'Full rebuild (default: incremental)', false)
  .option('--plan-ai', 'Use AI planner for sharding/budgets', false)
  .option('--determinism-target <n>', 'Min static edge ratio', '0.95')
  .option('--heuristics <mode>', 'Heuristics mode: off|hard|auto', 'auto')
  .option('--lexbrain <url>', 'LexBrain endpoint', process.env.LEXBRAIN_URL || 'http://localhost:8123')
  .option('--mode <mode>', 'Storage mode: local|zk', process.env.LEXBRAIN_MODE || 'local')
  .option('--key-hex <hex>', 'AES key for zk mode', process.env.LEXBRAIN_KEY_HEX)
  .option('--php-workers <n>', 'PHP parser concurrency', '4')
  .option('--ts-workers <n>', 'TS parser concurrency', '4')
  .option('--policy <path>', 'Policy JSON file', 'lexmap.policy.json')
  .option('--serve', 'Start HTTP server for MCP', false)
  .action(indexCommand);

program
  .command('slice')
  .description('Return compact slice for a symbol/path')
  .requiredOption('--symbol <fqn>', 'Symbol FQN or ID')
  .option('--radius <n>', 'Hop distance', '2')
  .option('--lexbrain <url>', 'LexBrain endpoint', process.env.LEXBRAIN_URL || 'http://localhost:8123')
  .option('--mode <mode>', 'Storage mode: local|zk', process.env.LEXBRAIN_MODE || 'local')
  .option('--key-hex <hex>', 'AES key for zk mode', process.env.LEXBRAIN_KEY_HEX)
  .action(sliceCommand);

program
  .command('query')
  .description('Run codemap queries')
  .requiredOption('--type <type>', 'Query type: callers|callees|module_deps|recent_patterns|violations')
  .option('--args <json>', 'Query-specific arguments as JSON', '{}')
  .option('--lexbrain <url>', 'LexBrain endpoint', process.env.LEXBRAIN_URL || 'http://localhost:8123')
  .option('--mode <mode>', 'Storage mode: local|zk', process.env.LEXBRAIN_MODE || 'local')
  .option('--key-hex <hex>', 'AES key for zk mode', process.env.LEXBRAIN_KEY_HEX)
  .action(queryCommand);

program
  .command('atlas-frame')
  .description('Get structural neighborhood data for modules')
  .requiredOption('--module-scope <modules>', 'Comma-separated seed module IDs')
  .option('--fold-radius <n>', 'How many hops to expand', '1')
  .option('--policy <path>', 'Policy JSON file', 'lexmap.policy.json')
  .option('--lexbrain <url>', 'LexBrain endpoint', process.env.LEXBRAIN_URL || 'http://localhost:8123')
  .option('--mode <mode>', 'Storage mode: local|zk', process.env.LEXBRAIN_MODE || 'local')
  .option('--key-hex <hex>', 'AES key for zk mode', process.env.LEXBRAIN_KEY_HEX)
  .action(atlasFrameCommand);

program.parse();
