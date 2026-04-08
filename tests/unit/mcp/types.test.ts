import { describe, it, expect } from "vitest";
import {
  makeNamespacedToolName,
  parseNamespacedToolName,
  isStdioConfig,
  type MCPServerConfig,
  type StdioServerConfig,
  type HttpServerConfig,
} from "../../../src/mcp/types.js";

describe("makeNamespacedToolName", () => {
  it("should create namespaced name in mcp__server__tool format", () => {
    expect(makeNamespacedToolName("filesystem", "read_file")).toBe(
      "mcp__filesystem__read_file"
    );
  });

  it("should handle tool names with underscores", () => {
    expect(makeNamespacedToolName("my_server", "my_tool_name")).toBe(
      "mcp__my_server__my_tool_name"
    );
  });

  it("should handle single-char names", () => {
    expect(makeNamespacedToolName("a", "b")).toBe("mcp__a__b");
  });
});

describe("parseNamespacedToolName", () => {
  it("should parse valid namespaced tool name", () => {
    const result = parseNamespacedToolName("mcp__filesystem__read_file");
    expect(result).toEqual({
      serverName: "filesystem",
      toolName: "read_file",
    });
  });

  it("should parse tool names with multiple underscores", () => {
    const result = parseNamespacedToolName("mcp__server__my_long_tool_name");
    expect(result).toEqual({
      serverName: "server",
      toolName: "my_long_tool_name",
    });
  });

  it("should return null for non-MCP tool names", () => {
    expect(parseNamespacedToolName("read_file")).toBeNull();
  });

  it("should return null for single underscore prefix", () => {
    expect(parseNamespacedToolName("mcp_server_tool")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseNamespacedToolName("")).toBeNull();
  });

  it("should return null for only prefix", () => {
    expect(parseNamespacedToolName("mcp__")).toBeNull();
    expect(parseNamespacedToolName("mcp__server__")).toBeNull();
  });

  it("should return null for prefix without double underscore after server", () => {
    expect(parseNamespacedToolName("mcp__server_tool")).toBeNull();
  });

  it("should roundtrip with makeNamespacedToolName", () => {
    const serverName = "filesystem";
    const toolName = "read_file";
    const namespaced = makeNamespacedToolName(serverName, toolName);
    const parsed = parseNamespacedToolName(namespaced);
    expect(parsed).toEqual({ serverName, toolName });
  });
});

describe("isStdioConfig", () => {
  it("should return true for stdio config with command", () => {
    const config: MCPServerConfig = { command: "npx", args: ["-y", "@anthropic/mcp"] };
    expect(isStdioConfig(config)).toBe(true);
  });

  it("should return true for stdio config with env", () => {
    const config: StdioServerConfig = {
      command: "node",
      args: ["server.js"],
      env: { API_KEY: "test" },
    };
    expect(isStdioConfig(config)).toBe(true);
  });

  it("should return false for http config with url", () => {
    const config: HttpServerConfig = { url: "https://mcp.example.com/sse" };
    expect(isStdioConfig(config)).toBe(false);
  });

  it("should return false for http config with headers", () => {
    const config: HttpServerConfig = {
      url: "https://mcp.example.com/sse",
      headers: { Authorization: "Bearer token" },
    };
    expect(isStdioConfig(config)).toBe(false);
  });
});
