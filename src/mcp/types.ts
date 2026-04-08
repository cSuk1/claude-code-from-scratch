// MCP type definitions for server configuration and runtime info.

export interface StdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

export interface HttpServerConfig {
  url: string;
  headers?: Record<string, string>;
  disabled?: boolean;
}

export type MCPServerConfig = StdioServerConfig | HttpServerConfig;

export type MCPServerStatus = "connecting" | "connected" | "disconnected" | "error";

export interface MCPServerInfo {
  name: string;
  status: MCPServerStatus;
  toolsCount: number;
  error?: string;
}

/** Namespaced tool name format: mcp__{serverName}__{toolName} */
export function makeNamespacedToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

/** Parse a namespaced tool name into [serverName, toolName], or null if not an MCP tool. */
export function parseNamespacedToolName(namespaced: string): { serverName: string; toolName: string } | null {
  const match = /^mcp__([^_]+)__(.+)$/.exec(namespaced);
  if (!match) return null;
  return { serverName: match[1], toolName: match[2] };
}

/** Type guard: is this a stdio config? */
export function isStdioConfig(config: MCPServerConfig): config is StdioServerConfig {
  return "command" in config;
}
