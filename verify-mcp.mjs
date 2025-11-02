#!/usr/bin/env node
/**
 * Final verification that LexMap MCP is ready for VS Code
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║         LexMap MCP Integration Verification Report        ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

const checks = [];

// Check 1: Files exist
console.log("📁 File Checks:");
const files = [
  "/srv/lex-mcp/lex-map/lexmap-launcher.sh",
  "/srv/lex-mcp/lex-map/mcp-server.mjs",
  "/srv/lex-mcp/lex-map/mcp-http.mjs",
  "/srv/lex-mcp/lex-map/package.json",
  "/srv/lex-mcp/lex-map/lexmap.policy.json",
];

for (const file of files) {
  const exists = existsSync(file);
  const status = exists ? "✅" : "❌";
  console.log(`  ${status} ${file.split("/").pop()}`);
  checks.push(exists);
}

// Check 2: Server responds to initialize
console.log("\n🔌 JSON-RPC 2.0 Protocol:");
try {
  const output = execSync(
    'cd /srv/lex-mcp/lex-map && echo \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\' | timeout 2 node mcp-server.mjs 2>/dev/null',
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(output.trim());

  if (
    parsed.jsonrpc === "2.0" &&
    parsed.result?.protocolVersion === "2024-11-05"
  ) {
    console.log("  ✅ Initialize handshake works");
    console.log("  ✅ Protocol version: 2024-11-05");
    checks.push(true);
  } else {
    console.log("  ❌ Initialize response malformed");
    checks.push(false);
  }
} catch (e) {
  console.log("  ❌ Initialize failed:", e.message.split("\n")[0]);
  checks.push(false);
}

// Check 3: All 4 tools available
console.log("\n🛠️  Available Tools:");
try {
  const output = execSync(
    'cd /srv/lex-mcp/lex-map && echo \'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\' | timeout 2 node mcp-server.mjs 2>/dev/null',
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(output.trim());
  const tools = parsed.result?.tools || [];

  const expectedTools = [
    "lexmap.index",
    "lexmap.slice",
    "lexmap.query",
    "lexmap.policy_check",
  ];

  for (const tool of expectedTools) {
    const found = tools.find((t) => t.name === tool);
    const status = found ? "✅" : "❌";
    console.log(`  ${status} ${tool}`);
    checks.push(!!found);
  }
} catch (e) {
  console.log("  ❌ Tools list failed:", e.message.split("\n")[0]);
  for (let i = 0; i < 4; i++) checks.push(false);
}

// Check 4: Policy check tool works
console.log("\n✔️  Tool Execution:");
try {
  const output = execSync(
    'cd /srv/lex-mcp/lex-map && echo \'{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lexmap.policy_check","arguments":{"changes":[{"file":"test.js","type":"add","content":"const x = 1;"}]}}}\' | timeout 2 node mcp-server.mjs 2>/dev/null',
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(output.trim());

  if (parsed.result?.content?.[0]?.text?.includes("Policy Check")) {
    console.log("  ✅ policy_check executes correctly");
    checks.push(true);
  } else {
    console.log("  ❌ policy_check response malformed");
    checks.push(false);
  }
} catch (e) {
  console.log("  ❌ policy_check failed:", e.message.split("\n")[0]);
  checks.push(false);
}

// Summary
console.log("\n" + "═".repeat(60));
const passed = checks.filter((c) => c).length;
const total = checks.length;
const percentage = Math.round((passed / total) * 100);

console.log(
  `\n📊 Results: ${passed}/${total} checks passed (${percentage}%)\n`
);

if (passed === total) {
  console.log("🎉 LexMap MCP is ready for VS Code!\n");
  console.log("Next steps:");
  console.log("1. Reload your VS Code window (Cmd+R or Ctrl+Shift+R)");
  console.log(
    '2. Check the MCP servers panel - you should see "lexmap" connected'
  );
  console.log("3. Try using one of the LexMap tools in Copilot Chat:\n");
  console.log("   @lexmap index");
  console.log("   @lexmap query --type violations");
  console.log("   @lexmap slice --symbol MyClass::myMethod");
  console.log("   @lexmap policy_check\n");
  console.log("VS Code configuration:");
  console.log("  ~/.config/Code/User/mcp.json (Linux)");
  console.log("  ~/AppData/Roaming/Code/User/mcp.json (Windows)\n");
  process.exit(0);
} else {
  console.log("⚠️  Some checks failed. Please review the output above.\n");
  process.exit(1);
}
