// MCPClientManager — orchestrates all MCP client connections.
// Handles: init (parallel), shutdown, tool aggregation, dispatch.

import { MCPClient } from "./client.js";
import type { MCPServerConfig, MCPServerInfo } from "./types.js";
import { parseNamespacedToolName } from "./types.js";
import type { ToolDefWithMeta } from "../tools/definitions.js";
import { printInfo } from "../ui/index.js";

export class MCPClientManager {
  private clients = new Map<string, MCPClient>();

  /** Initialize all MCP servers from config. Connects in parallel. */
  async init(configs: Record<string, MCPServerConfig>): Promise<void> {
    const entries = Object.entries(configs);
    if (entries.length === 0) return;

    printInfo(`Connecting to ${entries.length} MCP server(s)...`);

    // Connect all in parallel — individual failures are non-fatal
    const results = await Promise.allSettled(
      entries.map(async ([name, config]) => {
        const client = new MCPClient(name, config);
        this.clients.set(name, client);
        await client.connect();
      }),
    );

    // Report results
    let connected = 0;
    let failed = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const name = entries[i][0];
      if (result.status === "fulfilled") {
        const client = this.clients.get(name)!;
        if (client.status === "connected") {
          connected++;
          printInfo(`  MCP [${name}]: connected (${client.tools.length} tools)`);
        } else {
          failed++;
          printInfo(`  MCP [${name}]: ${client.error || "connection failed"}`);
        }
      } else {
        failed++;
        printInfo(`  MCP [${name}]: ${result.reason?.message || "unknown error"}`);
      }
    }

    if (connected > 0 || failed > 0) {
      printInfo(`MCP: ${connected} connected, ${failed} failed`);
    }
  }

  /** Shutdown all clients gracefully. */
  async shutdown(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const client of this.clients.values()) {
      promises.push(client.disconnect());
    }
    await Promise.allSettled(promises);
    this.clients.clear();
  }

  /** Get aggregated tool definitions from all connected servers. */
  getAllToolDefinitions(): ToolDefWithMeta[] {
    const defs: ToolDefWithMeta[] = [];
    for (const client of this.clients.values()) {
      if (client.status === "connected") {
        defs.push(...client.getToolDefinitions());
      }
    }
    return defs;
  }

  /** Execute a namespaced MCP tool. Returns null if not an MCP tool. */
  async executeTool(namespacedName: string, args: Record<string, unknown>): Promise<string | null> {
    const parsed = parseNamespacedToolName(namespacedName);
    if (!parsed) return null;

    const client = this.clients.get(parsed.serverName);
    if (!client) {
      return `Error: Unknown MCP server "${parsed.serverName}"`;
    }
    if (client.status !== "connected") {
      return `Error: MCP server "${parsed.serverName}" is not connected (${client.status})`;
    }

    return client.callTool(parsed.toolName, args);
  }

  /** Get status info for all servers. */
  getServerInfo(): MCPServerInfo[] {
    return Array.from(this.clients.values()).map((c) => c.getInfo());
  }

  /** Reconnect a specific server. */
  async reconnect(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) {
      printInfo(`MCP server "${name}" not found`);
      return;
    }
    printInfo(`Reconnecting MCP server: ${name}...`);
    await client.reconnect();
    if (client.status === "connected") {
      printInfo(`  MCP [${name}]: reconnected (${client.tools.length} tools)`);
    } else {
      printInfo(`  MCP [${name}]: ${client.error || "reconnect failed"}`);
    }
  }

  /** Reconnect all servers. */
  async reconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.reconnect();
      } catch {
        // Individual failures handled per-client
      }
    }
    const info = this.getServerInfo();
    const connected = info.filter((s) => s.status === "connected").length;
    printInfo(`MCP reconnect: ${connected}/${info.length} servers connected`);
  }

  /** Check if a tool name belongs to an MCP tool. */
  isMCPTool(name: string): boolean {
    return parseNamespacedToolName(name) !== null;
  }

  /** Total MCP tool count across all connected servers. */
  get totalTools(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.status === "connected") {
        count += client.tools.length;
      }
    }
    return count;
  }
}
