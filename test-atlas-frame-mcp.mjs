#!/usr/bin/env node
/**
 * Integration test for atlas-frame MCP tool
 * Tests that the tool is properly registered and returns expected output format
 */

import { spawn } from 'child_process';

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

async function testMCPServer() {
  console.log(`${BLUE}🧪 Testing Atlas Frame MCP Tool${RESET}\n`);

  const tests = [
    {
      name: 'MCP Server Initialization',
      input: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.1.0' }
        }
      }),
      validate: (output) => {
        try {
          const result = JSON.parse(output);
          return result.result?.serverInfo?.name === 'lexmap';
        } catch {
          return false;
        }
      }
    },
    {
      name: 'Atlas Frame Tool Registration',
      input: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      }),
      validate: (output) => {
        try {
          const result = JSON.parse(output);
          const tools = result.result?.tools || [];
          return tools.some(t => t.name === 'lexmap_get_atlas_frame');
        } catch {
          return false;
        }
      }
    },
    {
      name: 'Atlas Frame Tool Call with Single Module',
      input: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'lexmap_get_atlas_frame',
          arguments: {
            module_scope: ['ui/user-admin-panel'],
            fold_radius: 1
          }
        }
      }),
      validate: (output) => {
        try {
          const result = JSON.parse(output);
          const text = result.result?.content?.[0]?.text || '';
          return text.includes('ui/user-admin-panel') && 
                 text.includes('Fold Radius: 1') &&
                 text.includes('atlas-frame');
        } catch {
          return false;
        }
      }
    },
    {
      name: 'Atlas Frame Tool Call with Multiple Modules',
      input: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'lexmap_get_atlas_frame',
          arguments: {
            module_scope: ['ui/user-admin-panel', 'services/user-access-api'],
            fold_radius: 2
          }
        }
      }),
      validate: (output) => {
        try {
          const result = JSON.parse(output);
          const text = result.result?.content?.[0]?.text || '';
          return text.includes('ui/user-admin-panel,services/user-access-api') && 
                 text.includes('Fold Radius: 2');
        } catch {
          return false;
        }
      }
    },
    {
      name: 'Atlas Frame Tool with Default Fold Radius',
      input: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'lexmap_get_atlas_frame',
          arguments: {
            module_scope: ['services/auth-core']
          }
        }
      }),
      validate: (output) => {
        try {
          const result = JSON.parse(output);
          const text = result.result?.content?.[0]?.text || '';
          // Default fold_radius is 1
          return text.includes('services/auth-core') && 
                 text.includes('Fold Radius: 1');
        } catch {
          return false;
        }
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  // Initialize server first
  const initInput = tests[0].input + '\n';

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const input = i === 0 ? test.input : initInput + test.input;
    
    const result = await runMCPCommand(input);
    const lines = result.stdout.split('\n').filter(line => 
      line.trim() && !line.startsWith('[LexMap]')
    );
    
    // Get the relevant response (last valid JSON line for multi-input tests)
    const responseLine = lines[lines.length - 1];
    
    if (test.validate(responseLine)) {
      console.log(`${GREEN}✓${RESET} ${test.name}`);
      passed++;
    } else {
      console.log(`${RED}✗${RESET} ${test.name}`);
      console.log(`  Output: ${responseLine}`);
      failed++;
    }
  }

  console.log(`\n${BLUE}Results:${RESET} ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

function runMCPCommand(input) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['mcp-server.mjs'], {
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      reject(err);
    });

    // Send input and close stdin
    proc.stdin.write(input + '\n');
    proc.stdin.end();
  });
}

testMCPServer().catch(err => {
  console.error(`${RED}Test suite failed:${RESET}`, err);
  process.exit(1);
});
