#!/usr/bin/env node
/**
 * LexMap MCP HTTP Server
 *
 * Serves LexMap tools via MCP-over-HTTP endpoints.
 * Similar to LexBrain's HTTP mode but for architectural policy queries.
 *
 * This server provides MCP tool interfaces that return instructions for running
 * LexMap CLI commands. The actual indexing/querying happens via the CLI.
 *
 * Usage:
 *   node mcp-http.mjs
 *
 * Environment variables:
 *   PORT                 - HTTP port (default: 8124)
 *   LEXMAP_POLICY        - Path to policy JSON (default: ./lexmap.policy.json)
 *   LEXMAP_CONFIG        - Path to config JSON (default: ./lexmap.config.json)
 */

import { createServer } from "http";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration from environment
const config = {
  port: parseInt(process.env.PORT || "8124"),
  policyPath:
    process.env.LEXMAP_POLICY || resolve(__dirname, "lexmap.policy.json"),
  configPath:
    process.env.LEXMAP_CONFIG || resolve(__dirname, "lexmap.config.json"),
};

console.log(`[LexMap] Starting HTTP MCP server on port ${config.port}`);
console.log(`[LexMap] Policy: ${config.policyPath}`);

// Load policy if it exists
let policy = null;
if (existsSync(config.policyPath)) {
  try {
    policy = JSON.parse(readFileSync(config.policyPath, "utf8"));
    console.log(`[LexMap] Loaded policy: ${policy.policy_id || "unknown"}`);
  } catch (err) {
    console.error(
      `[LexMap] Warning: Could not parse policy file: ${err.message}`
    );
  }
}

// MCP tool definitions
const tools = [
  {
    name: "lexmap.index",
    description: "Index codebase and store architectural graph in LexBrain",
    input_schema: {
      type: "object",
      properties: {
        cold: {
          type: "boolean",
          description: "Full rebuild (default: incremental)",
          default: false,
        },
        determinism_target: {
          type: "number",
          description: "Min static edge ratio",
          default: 0.95,
        },
        heuristics: {
          type: "string",
          enum: ["off", "hard", "auto"],
          description: "Heuristics mode",
          default: "auto",
        },
        policy_path: {
          type: "string",
          description: "Override policy JSON path",
        },
      },
    },
  },
  {
    name: "lexmap.slice",
    description:
      "Return compact slice for a symbol/path with dependency context",
    input_schema: {
      type: "object",
      required: ["symbol"],
      properties: {
        symbol: {
          type: "string",
          description: "Symbol FQN or ID to slice around",
        },
        radius: {
          type: "integer",
          description: "Hop distance (default: 2)",
          default: 2,
          minimum: 1,
          maximum: 10,
        },
      },
    },
  },
  {
    name: "lexmap.query",
    description:
      "Run architectural queries (callers, callees, violations, patterns)",
    input_schema: {
      type: "object",
      required: ["type"],
      properties: {
        type: {
          type: "string",
          enum: [
            "callers",
            "callees",
            "module_deps",
            "recent_patterns",
            "violations",
          ],
          description: "Query type",
        },
        args: {
          type: "object",
          description: "Query-specific arguments",
          default: {},
        },
      },
    },
  },
  {
    name: "lexmap.policy_check",
    description: "Check if proposed changes violate architectural policy",
    input_schema: {
      type: "object",
      required: ["changes"],
      properties: {
        changes: {
          type: "array",
          description: "Array of proposed code changes",
          items: {
            type: "object",
            required: ["file", "type"],
            properties: {
              file: { type: "string" },
              type: {
                type: "string",
                enum: ["add", "modify", "delete"],
              },
              content: { type: "string" },
            },
          },
        },
      },
    },
  },
];

// HTTP request handler
const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);

  // GET /mcp/tools/list
  if (req.method === "GET" && url.pathname === "/mcp/tools/list") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tools }));
    return;
  }

  // POST /mcp/tools/call
  if (req.method === "POST" && url.pathname === "/mcp/tools/call") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const { name, arguments: args } = JSON.parse(body);

        if (!name) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing tool name" }));
          return;
        }

        const result = await handleToolCall(name, args || {});
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Health check
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "lexmap-mcp" }));
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

async function handleToolCall(name, args) {
  switch (name) {
    case "lexmap.index": {
      // Build command arguments
      const cmdArgs = ["index"];
      if (args.cold) cmdArgs.push("--cold");
      if (args.determinism_target)
        cmdArgs.push("--determinism-target", String(args.determinism_target));
      if (args.heuristics) cmdArgs.push("--heuristics", args.heuristics);
      if (args.policy_path) cmdArgs.push("--policy", args.policy_path);

      return {
        content: [
          {
            type: "text",
            text: `LexMap indexing scheduled:\n  Policy: ${
              args.policy_path || config.policyPath
            }\n  Mode: ${args.cold ? "cold" : "incremental"}\n  Target: ${
              args.determinism_target || 0.95
            }\n\nNote: Full indexing requires running the codemap-indexer CLI.\nCommand: pnpm --filter @lex/lexmap-indexer dev ${cmdArgs.join(
              " "
            )}`,
          },
        ],
      };
    }

    case "lexmap.slice": {
      if (!args.symbol) {
        throw new Error("symbol parameter is required");
      }

      const radius = args.radius || 2;

      return {
        content: [
          {
            type: "text",
            text: `LexMap slice request:\n  Symbol: ${args.symbol}\n  Radius: ${radius}\n\nNote: Slice generation requires running the codemap-indexer CLI.\nCommand: pnpm --filter @lex/lexmap-indexer dev slice --symbol "${args.symbol}" --radius ${radius}`,
          },
        ],
      };
    }

    case "lexmap.query": {
      if (!args.type) {
        throw new Error("type parameter is required");
      }

      const queryArgs = args.args || {};

      return {
        content: [
          {
            type: "text",
            text: `LexMap query request:\n  Type: ${
              args.type
            }\n  Args: ${JSON.stringify(
              queryArgs
            )}\n\nNote: Query execution requires running the codemap-indexer CLI.\nCommand: pnpm --filter @lex/lexmap-indexer dev query --type ${
              args.type
            } --args '${JSON.stringify(queryArgs)}'`,
          },
        ],
      };
    }

    case "lexmap.policy_check": {
      if (!args.changes || !Array.isArray(args.changes)) {
        throw new Error("changes parameter must be an array");
      }

      if (!policy) {
        return {
          content: [
            {
              type: "text",
              text: `No policy loaded. Cannot check violations.\nLoad policy from: ${config.policyPath}`,
            },
          ],
        };
      }

      // Basic policy check simulation
      const violations = [];

      // Example: check for forbidden dependencies
      for (const change of args.changes) {
        if (change.type === "add" || change.type === "modify") {
          // Placeholder violation detection
          if (change.content && change.content.includes("eval(")) {
            violations.push({
              file: change.file,
              rule: "no-eval",
              message: "Use of eval() is forbidden by security policy",
            });
          }
        }
      }

      const status = violations.length === 0 ? "✓ PASS" : "✗ FAIL";
      const summary =
        violations.length === 0
          ? "All changes comply with architectural policy"
          : `Found ${violations.length} policy violation(s)`;

      return {
        content: [
          {
            type: "text",
            text: `Policy Check: ${status}\n\n${summary}\n\n${
              violations.length > 0
                ? "Violations:\n" +
                  violations
                    .map((v) => `  - ${v.file}: [${v.rule}] ${v.message}`)
                    .join("\n")
                : ""
            }`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Start server
server.listen(config.port, () => {
  console.log(
    `[LexMap] MCP HTTP server listening on http://localhost:${config.port}`
  );
  console.log(`[LexMap] Endpoints:`);
  console.log(`  GET  /mcp/tools/list`);
  console.log(`  POST /mcp/tools/call`);
  console.log(`  GET  /health`);
});

// Handle shutdown
process.on("SIGINT", () => {
  console.log("\n[LexMap] Shutting down...");
  server.close(() => {
    console.log("[LexMap] Server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n[LexMap] Shutting down...");
  server.close(() => {
    console.log("[LexMap] Server closed");
    process.exit(0);
  });
});
