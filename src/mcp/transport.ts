// Transport factory — creates the right MCP transport based on server config.

import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { MCPServerConfig, StdioServerConfig, HttpServerConfig } from "./types.js";
import { isStdioConfig } from "./types.js";

export function createTransport(name: string, config: MCPServerConfig): Transport {
  if (isStdioConfig(config)) {
    return createStdioTransport(config);
  }
  return createHttpTransport(name, config as HttpServerConfig);
}

function createStdioTransport(config: StdioServerConfig): Transport {
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env ? { ...process.env as Record<string, string>, ...config.env } : undefined,
    stderr: "pipe",
  });
}

function createHttpTransport(name: string, config: HttpServerConfig): Transport {
  return new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: {
      headers: config.headers,
    },
  });
}
