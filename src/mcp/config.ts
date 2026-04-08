// MCP configuration loading from settings.json files.
// Merges user-level + project-level configs.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { MCPServerConfig } from "./types.js";

export function loadMCPConfigs(): Record<string, MCPServerConfig> {
  const paths = [
    join(homedir(), ".ccmini", "settings.json"),
    join(process.cwd(), ".ccmini", "settings.json"),
  ];

  const merged: Record<string, MCPServerConfig> = {};

  for (const filePath of paths) {
    if (!existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf-8"));
      const servers = raw?.mcpServers;
      if (!servers || typeof servers !== "object") continue;
      for (const [name, config] of Object.entries(servers)) {
        if (config && typeof config === "object") {
          merged[name] = config as MCPServerConfig;
        }
      }
    } catch {
      // skip malformed
    }
  }

  // Filter out disabled servers
  const active: Record<string, MCPServerConfig> = {};
  for (const [name, config] of Object.entries(merged)) {
    if (!(config as any).disabled) {
      active[name] = config;
    }
  }

  return active;
}
