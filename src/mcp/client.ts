// MCPClient — wraps the SDK Client for a single MCP server connection.
// Handles: connect, disconnect, tool discovery, tool execution.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { MCPServerConfig, MCPServerStatus, MCPServerInfo } from "./types.js";
import { makeNamespacedToolName } from "./types.js";
import { createTransport } from "./transport.js";
import type { ToolDefWithMeta } from "../tools/definitions.js";
import { VERSION, APP_NAME } from "../version.js";

export interface MCPToolDef {
  serverName: string;
  originalName: string;
  namespacedName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class MCPClient {
  readonly name: string;
  readonly config: MCPServerConfig;

  private client: Client | null = null;
  private transport: Transport | null = null;
  private _tools: MCPToolDef[] = [];
  private _status: MCPServerStatus = "disconnected";
  private _error: string | undefined;

  get status(): MCPServerStatus { return this._status; }
  get tools(): MCPToolDef[] { return this._tools; }
  get error(): string | undefined { return this._error; }

  constructor(name: string, config: MCPServerConfig) {
    this.name = name;
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this._status === "connected") return;

    this._status = "connecting";
    this._error = undefined;

    try {
      this.transport = createTransport(this.name, this.config);
      this.client = new Client(
        { name: APP_NAME, version: VERSION },
        { capabilities: {} },
      );

      await this.client.connect(this.transport);

      // Discover tools
      await this.discoverTools();

      this._status = "connected";
    } catch (e: any) {
      this._status = "error";
      this._error = e.message || String(e);
      this.cleanup();
    }
  }

  async disconnect(): Promise<void> {
    if (this._status === "disconnected") return;

    try {
      await this.client?.close();
    } catch {
      // Best-effort close
    }
    this.cleanup();
    this._status = "disconnected";
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    if (!this.client || this._status !== "connected") {
      return `Error: MCP server "${this.name}" is not connected`;
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      // Extract text content from result
      const content = (result as any).content;
      if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const item of content) {
          if (item.type === "text" && typeof item.text === "string") {
            texts.push(item.text);
          } else if (item.type === "image" || item.type === "audio") {
            texts.push(`[${item.type}: ${item.mimeType}]`);
          } else if (item.type === "resource") {
            texts.push(`[resource: ${item.resource?.uri}]`);
          }
        }
        const isError = (result as any).isError === true;
        return isError ? `Error: ${texts.join("\n")}` : texts.join("\n");
      }

      return JSON.stringify(result);
    } catch (e: any) {
      return `MCP tool error (${this.name}/${toolName}): ${e.message || String(e)}`;
    }
  }

  getInfo(): MCPServerInfo {
    return {
      name: this.name,
      status: this._status,
      toolsCount: this._tools.length,
      error: this._error,
    };
  }

  /** Convert discovered tools to the internal ToolDefWithMeta format. */
  getToolDefinitions(): ToolDefWithMeta[] {
    return this._tools.map((t) => ({
      name: t.namespacedName,
      description: `[${this.name}] ${t.description}`,
      metadata: { category: "agent" as const, parallelSafe: false, idempotent: false },
      input_schema: t.inputSchema as any,
    }));
  }

  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  // ─── Internal ──────────────────────────────────────────────

  private async discoverTools(): Promise<void> {
    if (!this.client) return;

    this._tools = [];
    let cursor: string | undefined;

    do {
      try {
        const result = await this.client.listTools(cursor ? { cursor } : undefined);
        const tools = (result as any).tools;
        if (Array.isArray(tools)) {
          for (const tool of tools) {
            this._tools.push({
              serverName: this.name,
              originalName: tool.name,
              namespacedName: makeNamespacedToolName(this.name, tool.name),
              description: tool.description || "",
              inputSchema: tool.inputSchema || { type: "object", properties: {} },
            });
          }
        }
        cursor = (result as any).nextCursor;
      } catch (e: any) {
        // If tool discovery fails, log but don't block
        this._error = `Tool discovery failed: ${e.message || String(e)}`;
        break;
      }
    } while (cursor);
  }

  private cleanup(): void {
    this.client = null;
    this.transport = null;
    this._tools = [];
  }
}
