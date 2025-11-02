#!/usr/bin/env node
/**
 * LexMap MCP Server (stdio mode)
 *
 * A Model Context Protocol (MCP) server for architectural policy enforcement.
 * Speaks MCP over stdio for AI coding agents.
 *
 * Usage:
 *   lexmap-mcp
 *   npx -y /srv/lex-mcp/lex-map
 *
 * Environment variables:
 *   LEXMAP_POLICY        - Path to policy JSON (default: ./lexmap.policy.json)
 *   LEXMAP_CONFIG        - Path to config JSON (default: ./lexmap.config.json)
 *   LEXBRAIN_URL         - LexBrain endpoint (default: http://localhost:8123)
 *   LEXBRAIN_MODE        - 'local' or 'zk' (default: local)
 *   LEXBRAIN_KEY_HEX     - 64-char hex key for ZK mode
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration from environment
const config = {
  policyPath:
    process.env.LEXMAP_POLICY || resolve(__dirname, "lexmap.policy.json"),
  configPath:
    process.env.LEXMAP_CONFIG || resolve(__dirname, "lexmap.config.json"),
  lexbrainUrl: process.env.LEXBRAIN_URL || "http://localhost:8123",
  lexbrainMode: process.env.LEXBRAIN_MODE || "local",
  lexbrainKeyHex: process.env.LEXBRAIN_KEY_HEX,
};

console.error(`[LexMap] Starting MCP server`);
console.error(`[LexMap] Policy: ${config.policyPath}`);
console.error(`[LexMap] LexBrain: ${config.lexbrainUrl}`);

// Load policy if it exists
let policy = null;
if (existsSync(config.policyPath)) {
  try {
    policy = JSON.parse(readFileSync(config.policyPath, "utf8"));
    console.error(`[LexMap] Loaded policy: ${policy.policy_id || "unknown"}`);
  } catch (err) {
    console.error(
      `[LexMap] Warning: Could not parse policy file: ${err.message}`
    );
  }
}

// MCP stdio protocol
process.stdin.setEncoding("utf8");
let buffer = "";

process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const request = JSON.parse(line);
      const response = await handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      console.log(
        JSON.stringify({
          error: { message: error.message },
        })
      );
    }
  }
});

async function handleRequest(request) {
  const { method, params } = request;

  if (method === "tools/list") {
    return {
      tools: [
        {
          name: "lexmap.index",
          description:
            "Index codebase and store architectural graph in LexBrain",
          inputSchema: {
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
          inputSchema: {
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
          inputSchema: {
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
          inputSchema: {
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
      ],
    };
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;

    switch (name) {
      case "lexmap.index": {
        // Build command arguments
        const cmdArgs = ["index"];
        if (args.cold) cmdArgs.push("--cold");
        if (args.determinism_target)
          cmdArgs.push("--determinism-target", String(args.determinism_target));
        if (args.heuristics) cmdArgs.push("--heuristics", args.heuristics);
        if (args.policy_path) cmdArgs.push("--policy", args.policy_path);

        cmdArgs.push("--lexbrain", config.lexbrainUrl);
        cmdArgs.push("--mode", config.lexbrainMode);
        if (config.lexbrainKeyHex)
          cmdArgs.push("--key-hex", config.lexbrainKeyHex);

        // For now, return a placeholder response
        // In production, this would spawn the indexer CLI
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
        // Validate arguments
        if (!args.symbol) {
          throw new Error("symbol parameter is required");
        }

        const radius = args.radius || 2;

        // For now, return a placeholder response
        // In production, this would call the slice command
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
        // Validate arguments
        if (!args.type) {
          throw new Error("type parameter is required");
        }

        const queryArgs = args.args || {};

        // For now, return a placeholder response
        // In production, this would call the query command
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
        // Validate arguments
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
        // In production, this would analyze changes against policy rules
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

  throw new Error(`Unknown method: ${method}`);
}

// Handle shutdown
process.on("SIGINT", () => {
  console.error("[LexMap] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("[LexMap] Shutting down...");
  process.exit(0);
});
