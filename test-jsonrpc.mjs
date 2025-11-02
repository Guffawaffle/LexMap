#!/usr/bin/env node
/**
 * Quick JSON-RPC 2.0 test for LexMap MCP server
 */

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function testJSONRPC() {
  console.log("Testing LexMap JSON-RPC 2.0 protocol...\n");

  const proc = spawn("node", [resolve(__dirname, "mcp-server.mjs")], {
    env: {
      ...process.env,
      LEXMAP_POLICY: resolve(__dirname, "lexmap.policy.json"),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  await new Promise((r) => setTimeout(r, 500));

  // Test 1: initialize
  console.log("1. Testing initialize...");
  proc.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    }) + "\n"
  );

  // Test 2: tools/list
  await new Promise((r) => setTimeout(r, 200));
  console.log("2. Testing tools/list...");
  proc.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }) + "\n"
  );

  // Test 3: tools/call
  await new Promise((r) => setTimeout(r, 200));
  console.log("3. Testing tools/call (policy_check)...");
  proc.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "lexmap.policy_check",
        arguments: {
          changes: [
            {
              file: "test.js",
              type: "add",
              content: "const x = 1;",
            },
          ],
        },
      },
    }) + "\n"
  );

  let output = "";
  proc.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });

  proc.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  await new Promise((r) => setTimeout(r, 1000));
  proc.kill();

  console.log("\nServer responses:\n");
  const lines = output.split("\n").filter((l) => l.trim());
  lines.forEach((line, i) => {
    try {
      const parsed = JSON.parse(line);
      console.log(`Response ${i + 1}:`, JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(`Response ${i + 1}: (not JSON)`, line);
    }
  });

  console.log("\n✅ Test complete");
}

testJSONRPC().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
