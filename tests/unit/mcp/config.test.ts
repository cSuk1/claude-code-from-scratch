import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadMCPConfigs } from "../../../src/mcp/config.js";

// Mock fs and os at the module level
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("os", () => ({
  homedir: vi.fn().mockReturnValue("/mock/home"),
}));

import { existsSync, readFileSync } from "fs";

describe("loadMCPConfigs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty object when no settings files exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = loadMCPConfigs();
    expect(result).toEqual({});
  });

  it("should load mcpServers from user settings", () => {
    vi.mocked(existsSync).mockImplementation((path: any) => {
      return String(path).includes("mock/home");
    });

    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (String(path).includes("mock/home")) {
        return JSON.stringify({
          mcpServers: {
            filesystem: { command: "npx", args: ["-y", "@anthropic/mcp-filesystem"] },
          },
        });
      }
      return "{}";
    });

    const result = loadMCPConfigs();
    expect(result).toEqual({
      filesystem: { command: "npx", args: ["-y", "@anthropic/mcp-filesystem"] },
    });
  });

  it("should load mcpServers from project settings", () => {
    vi.mocked(existsSync).mockImplementation((path: any) => {
      return String(path).includes(process.cwd());
    });

    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (String(path).includes(process.cwd())) {
        return JSON.stringify({
          mcpServers: {
            fetch: { command: "npx", args: ["-y", "@anthropic/mcp-fetch"] },
          },
        });
      }
      return "{}";
    });

    const result = loadMCPConfigs();
    expect(result).toEqual({
      fetch: { command: "npx", args: ["-y", "@anthropic/mcp-fetch"] },
    });
  });

  it("should merge user and project settings (project overrides user)", () => {
    vi.mocked(existsSync).mockReturnValue(true);

    vi.mocked(readFileSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.includes("mock/home")) {
        return JSON.stringify({
          mcpServers: {
            fs: { command: "npx", args: ["user-fs"] },
            shared: { command: "npx", args: ["user-shared"] },
          },
        });
      }
      return JSON.stringify({
        mcpServers: {
          fetch: { command: "npx", args: ["project-fetch"] },
          shared: { command: "npx", args: ["project-shared"] },
        },
      });
    });

    const result = loadMCPConfigs();
    // Project config is applied after user config, so it overrides "shared"
    expect(result.fs).toEqual({ command: "npx", args: ["user-fs"] });
    expect(result.fetch).toEqual({ command: "npx", args: ["project-fetch"] });
    expect(result.shared).toEqual({ command: "npx", args: ["project-shared"] });
  });

  it("should filter out disabled servers", () => {
    vi.mocked(existsSync).mockReturnValue(true);

    vi.mocked(readFileSync).mockImplementation(() => {
      return JSON.stringify({
        mcpServers: {
          active: { command: "npx", args: ["active"] },
          disabled_one: { command: "npx", args: ["disabled"], disabled: true },
          disabled_two: { url: "https://example.com", disabled: true },
        },
      });
    });

    const result = loadMCPConfigs();
    expect(result).toEqual({
      active: { command: "npx", args: ["active"] },
    });
  });

  it("should skip malformed JSON", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("not valid json{{{");

    const result = loadMCPConfigs();
    expect(result).toEqual({});
  });

  it("should skip settings without mcpServers", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ other: "data" }));

    const result = loadMCPConfigs();
    expect(result).toEqual({});
  });

  it("should skip null mcpServers", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mcpServers: null }));

    const result = loadMCPConfigs();
    expect(result).toEqual({});
  });

  it("should skip non-object mcpServers", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ mcpServers: "invalid" })
    );

    const result = loadMCPConfigs();
    expect(result).toEqual({});
  });

  it("should skip non-object server entries", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        mcpServers: {
          valid: { command: "npx" },
          invalid_str: "not an object",
          invalid_num: 42,
        },
      })
    );

    const result = loadMCPConfigs();
    expect(result).toEqual({ valid: { command: "npx" } });
  });

  it("should load http server configs", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        mcpServers: {
          remote: {
            url: "https://mcp.cloudflare.com/sse",
            headers: { Authorization: "Bearer token" },
          },
        },
      })
    );

    const result = loadMCPConfigs();
    expect(result).toEqual({
      remote: {
        url: "https://mcp.cloudflare.com/sse",
        headers: { Authorization: "Bearer token" },
      },
    });
  });
}
)
