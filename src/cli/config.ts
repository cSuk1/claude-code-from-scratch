import type { ParsedArgs } from "./args.js";
import { printError } from "../ui/index.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface ApiConfig {
  apiBase?: string;
  apiKey: string;
  useOpenAI: boolean;
}

interface ConfigFile {
  api?: {
    provider?: "anthropic" | "openai";
    apiKey?: string;
    baseUrl?: string;
  };
  models?: Record<string, string>;
  [key: string]: any;
}

export function loadConfigFile(): ConfigFile | null {
  const paths = [
    join(homedir(), ".ccmini", "settings.json"),
    join(process.cwd(), ".ccmini", "settings.json"),
  ];

  for (const filePath of paths) {
    if (!existsSync(filePath)) continue;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      // Ignore malformed config
    }
  }
  return null;
}

export function resolveApiConfig(args: ParsedArgs): ApiConfig {
  const { apiBase } = args;

  let resolvedApiBase = apiBase;
  let resolvedApiKey: string | undefined;
  let resolvedUseOpenAI = !!apiBase;

  const configFile = loadConfigFile();
  const configApi = configFile?.api;

  if (configApi?.provider) {
    resolvedUseOpenAI = configApi.provider === "openai";
    if (configApi.baseUrl) {
      resolvedApiBase = configApi.baseUrl;
    }
    if (configApi.apiKey) {
      resolvedApiKey = configApi.apiKey;
    }
  }

  if (apiBase && !resolvedApiKey) {
    printError(
      `API key required. Use --connect to configure your provider.`
    );
    process.exit(1);
  }

  if (!resolvedApiKey) {
    printError(
      `API not configured. Run 'claude-code-mini --connect' to set up.`
    );
    process.exit(1);
  }

  return {
    apiBase: resolvedApiBase,
    apiKey: resolvedApiKey,
    useOpenAI: resolvedUseOpenAI,
  };
}
