#!/usr/bin/env node
/**
 * Test LexMap MCP stdio protocol
 *
 * This test script verifies that the MCP server correctly implements
 * the stdio protocol for Model Context Protocol.
 *
 * Usage: node test-mcp-stdio.mjs
 */

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let testsPassed = 0;
let testsFailed = 0;

function log(msg) {
  console.error(`[TEST] ${msg}`);
}

function pass(testName) {
  testsPassed++;
  console.error(`✓ ${testName}`);
}

function fail(testName, error) {
  testsFailed++;
  console.error(`✗ ${testName}`);
  console.error(`  Error: ${error}`);
}

async function sendRequest(proc, request) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Request timeout (5s)"));
    }, 5000);

    let buffer = "";

    const onData = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");

      // Keep last incomplete line in buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const response = JSON.parse(line);
          clearTimeout(timeout);
          proc.stdout.off("data", onData);
          resolve(response);
          return;
        } catch (e) {
          // Not JSON, might be stderr output - ignore
        }
      }
    };

    proc.stdout.on("data", onData);
    proc.stdin.write(JSON.stringify(request) + "\n");
  });
}

async function runTests() {
  log("Starting LexMap MCP stdio tests...\n");

  // Test 1: Server starts and responds to tools/list
  log("Test 1: Server initialization and tools/list");
  try {
    const proc = spawn("node", [resolve(__dirname, "mcp-server.mjs")], {
      env: {
        ...process.env,
        LEXMAP_POLICY: resolve(__dirname, "lexmap.policy.json"),
        LEXMAP_CONFIG: resolve(__dirname, "lexmap.config.json"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for server to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    const listRequest = {
      method: "tools/list",
      params: {},
    };

    const listResponse = await sendRequest(proc, listRequest);

    if (!listResponse.tools || !Array.isArray(listResponse.tools)) {
      throw new Error("Response missing tools array");
    }

    if (listResponse.tools.length !== 4) {
      throw new Error(`Expected 4 tools, got ${listResponse.tools.length}`);
    }

    const expectedTools = [
      "lexmap.index",
      "lexmap.slice",
      "lexmap.query",
      "lexmap.policy_check",
    ];
    for (const toolName of expectedTools) {
      const tool = listResponse.tools.find((t) => t.name === toolName);
      if (!tool) {
        throw new Error(`Missing tool: ${toolName}`);
      }
      if (!tool.description) {
        throw new Error(`Tool ${toolName} missing description`);
      }
      if (!tool.inputSchema) {
        throw new Error(`Tool ${toolName} missing inputSchema`);
      }
    }

    pass("tools/list returns all 4 tools with schemas");

    // Test 2: Call lexmap.policy_check
    log("Test 2: tools/call - lexmap.policy_check");
    const policyCheckRequest = {
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
    };

    const policyCheckResponse = await sendRequest(proc, policyCheckRequest);

    if (
      !policyCheckResponse.content ||
      !Array.isArray(policyCheckResponse.content)
    ) {
      throw new Error("Response missing content array");
    }

    if (policyCheckResponse.content.length === 0) {
      throw new Error("Content array is empty");
    }

    if (policyCheckResponse.content[0].type !== "text") {
      throw new Error('First content item is not type "text"');
    }

    if (!policyCheckResponse.content[0].text.includes("Policy Check")) {
      throw new Error('Response text does not include "Policy Check"');
    }

    pass("lexmap.policy_check returns valid MCP response");

    // Test 3: Call lexmap.index
    log("Test 3: tools/call - lexmap.index");
    const indexRequest = {
      method: "tools/call",
      params: {
        name: "lexmap.index",
        arguments: {
          cold: true,
          determinism_target: 0.9,
        },
      },
    };

    const indexResponse = await sendRequest(proc, indexRequest);

    if (!indexResponse.content || !Array.isArray(indexResponse.content)) {
      throw new Error("Response missing content array");
    }

    if (!indexResponse.content[0].text.includes("indexing")) {
      throw new Error("Response does not mention indexing");
    }

    pass("lexmap.index returns valid MCP response");

    // Test 4: Call lexmap.slice
    log("Test 4: tools/call - lexmap.slice");
    const sliceRequest = {
      method: "tools/call",
      params: {
        name: "lexmap.slice",
        arguments: {
          symbol: "MyClass::myMethod",
          radius: 3,
        },
      },
    };

    const sliceResponse = await sendRequest(proc, sliceRequest);

    if (!sliceResponse.content || !Array.isArray(sliceResponse.content)) {
      throw new Error("Response missing content array");
    }

    if (!sliceResponse.content[0].text.includes("slice")) {
      throw new Error("Response does not mention slice");
    }

    pass("lexmap.slice returns valid MCP response");

    // Test 5: Call lexmap.query
    log("Test 5: tools/call - lexmap.query");
    const queryRequest = {
      method: "tools/call",
      params: {
        name: "lexmap.query",
        arguments: {
          type: "violations",
          args: {},
        },
      },
    };

    const queryResponse = await sendRequest(proc, queryRequest);

    if (!queryResponse.content || !Array.isArray(queryResponse.content)) {
      throw new Error("Response missing content array");
    }

    if (!queryResponse.content[0].text.includes("query")) {
      throw new Error("Response does not mention query");
    }

    pass("lexmap.query returns valid MCP response");

    // Test 6: Error handling - invalid method
    log("Test 6: Error handling - invalid method");
    const invalidMethodRequest = {
      method: "invalid/method",
      params: {},
    };

    const errorResponse = await sendRequest(proc, invalidMethodRequest);

    if (!errorResponse.error) {
      throw new Error("Expected error response for invalid method");
    }

    pass("Server handles invalid methods gracefully");

    // Test 7: Error handling - invalid tool name
    log("Test 7: Error handling - invalid tool name");
    const invalidToolRequest = {
      method: "tools/call",
      params: {
        name: "invalid.tool",
        arguments: {},
      },
    };

    const invalidToolResponse = await sendRequest(proc, invalidToolRequest);

    if (!invalidToolResponse.error) {
      throw new Error("Expected error response for invalid tool");
    }

    pass("Server handles invalid tool names gracefully");

    // Clean up
    proc.kill();
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    fail("MCP stdio protocol tests", error.message);
    process.exit(1);
  }

  // Summary
  log(`\n${"=".repeat(50)}`);
  log(`Tests passed: ${testsPassed}`);
  log(`Tests failed: ${testsFailed}`);
  log("=".repeat(50));

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    log("\n🎉 All tests passed!");
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
