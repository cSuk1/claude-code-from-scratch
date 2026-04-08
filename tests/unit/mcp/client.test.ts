import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the transport factory to avoid needing real SDK transports
vi.mock("../../../src/mcp/transport.js", () => ({
  createTransport: vi.fn().mockReturnValue({}),
}));

// Create stable mock functions via vi.hoisted and a class that uses them
const mockFns = vi.hoisted(() => {
  const connect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const listTools = vi.fn().mockResolvedValue({ tools: [] });
  const callTool = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "default result" }],
  });

  class MockClient {
    connect = connect;
    close = close;
    listTools = listTools;
    callTool = callTool;
  }

  return { MockClient, connect, close, listTools, callTool };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: mockFns.MockClient,
}));

vi.mock("../../../src/version.js", () => ({
  VERSION: "1.0.0-test",
  APP_NAME: "test-app",
}));

import { MCPClient } from "../../../src/mcp/client.js";

describe("MCPClient", () => {
  beforeEach(() => {
    mockFns.connect.mockReset().mockResolvedValue(undefined);
    mockFns.close.mockReset().mockResolvedValue(undefined);
    mockFns.listTools.mockReset().mockResolvedValue({ tools: [] });
    mockFns.callTool.mockReset().mockResolvedValue({
      content: [{ type: "text", text: "default result" }],
    });
  });

  describe("constructor", () => {
    it("should create client with stdio config", () => {
      const client = new MCPClient("filesystem", {
        command: "npx",
        args: ["-y", "@anthropic/mcp-filesystem"],
      });
      expect(client.name).toBe("filesystem");
      expect(client.status).toBe("disconnected");
      expect(client.tools).toEqual([]);
      expect(client.error).toBeUndefined();
    });

    it("should create client with http config", () => {
      const client = new MCPClient("remote", {
        url: "https://mcp.example.com/sse",
      });
      expect(client.name).toBe("remote");
      expect(client.status).toBe("disconnected");
    });
  });

  describe("connect", () => {
    it("should connect and discover tools", async () => {
      mockFns.listTools.mockResolvedValue({
        tools: [
          {
            name: "read_file",
            description: "Read a file",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          },
          {
            name: "write_file",
            description: "Write a file",
            inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } } },
          },
        ],
      });

      const client = new MCPClient("filesystem", { command: "npx" });
      await client.connect();

      expect(client.status).toBe("connected");
      expect(client.tools).toHaveLength(2);
      expect(client.tools[0]).toEqual({
        serverName: "filesystem",
        originalName: "read_file",
        namespacedName: "mcp__filesystem__read_file",
        description: "Read a file",
        inputSchema: { type: "object", properties: { path: { type: "string" } } },
      });
      expect(client.tools[1].namespacedName).toBe("mcp__filesystem__write_file");
    });

    it("should not reconnect if already connected", async () => {
      const client = new MCPClient("test", { command: "npx" });
      await client.connect();
      expect(mockFns.connect).toHaveBeenCalledTimes(1);

      await client.connect();
      expect(mockFns.connect).toHaveBeenCalledTimes(1);
    });

    it("should handle connection failure", async () => {
      mockFns.connect.mockRejectedValue(new Error("Connection refused"));

      const client = new MCPClient("bad-server", { command: "nonexistent" });
      await client.connect();

      expect(client.status).toBe("error");
      expect(client.error).toBe("Connection refused");
    });

    it("should handle tool discovery failure gracefully", async () => {
      mockFns.listTools.mockRejectedValue(new Error("Discovery failed"));

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      // Discovery failure is caught internally, so status remains connected
      // but the error is recorded
      expect(client.status).toBe("connected");
      expect(client.error).toContain("Discovery failed");
      expect(client.tools).toEqual([]);
    });

    it("should paginate tools with cursor", async () => {
      mockFns.listTools
        .mockResolvedValueOnce({
          tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
          nextCursor: "cursor-page2",
        })
        .mockResolvedValueOnce({
          tools: [{ name: "tool2", description: "Tool 2", inputSchema: {} }],
        });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      expect(client.tools).toHaveLength(2);
      expect(mockFns.listTools).toHaveBeenCalledTimes(2);
    });

    it("should handle empty tool description", async () => {
      mockFns.listTools.mockResolvedValue({
        tools: [{ name: "no_desc", inputSchema: {} }],
      });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      expect(client.tools[0].description).toBe("");
    });

    it("should handle missing inputSchema", async () => {
      mockFns.listTools.mockResolvedValue({
        tools: [{ name: "no_schema", description: "No schema" }],
      });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      expect(client.tools[0].inputSchema).toEqual({ type: "object", properties: {} });
    });
  });

  describe("disconnect", () => {
    it("should disconnect cleanly", async () => {
      const client = new MCPClient("test", { command: "npx" });
      await client.connect();
      expect(client.status).toBe("connected");

      await client.disconnect();
      expect(client.status).toBe("disconnected");
      expect(client.tools).toEqual([]);
    });

    it("should handle disconnect when already disconnected", async () => {
      const client = new MCPClient("test", { command: "npx" });
      await client.disconnect();
      expect(client.status).toBe("disconnected");
    });

    it("should handle close error gracefully", async () => {
      mockFns.close.mockRejectedValue(new Error("Close error"));

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      await client.disconnect();
      expect(client.status).toBe("disconnected");
    });
  });

  describe("callTool", () => {
    it("should call tool and return text content", async () => {
      mockFns.callTool.mockResolvedValue({
        content: [{ type: "text", text: "File contents here" }],
      });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      const result = await client.callTool("read_file", { path: "/test.txt" });
      expect(result).toBe("File contents here");
      expect(mockFns.callTool).toHaveBeenCalledWith({
        name: "read_file",
        arguments: { path: "/test.txt" },
      });
    });

    it("should join multiple text content items", async () => {
      mockFns.callTool.mockResolvedValue({
        content: [
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
        ],
      });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      const result = await client.callTool("tool", {});
      expect(result).toBe("Line 1\nLine 2");
    });

    it("should handle image content", async () => {
      mockFns.callTool.mockResolvedValue({
        content: [{ type: "image", mimeType: "image/png" }],
      });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      const result = await client.callTool("tool", {});
      expect(result).toBe("[image: image/png]");
    });

    it("should handle audio content", async () => {
      mockFns.callTool.mockResolvedValue({
        content: [{ type: "audio", mimeType: "audio/mp3" }],
      });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      const result = await client.callTool("tool", {});
      expect(result).toBe("[audio: audio/mp3]");
    });

    it("should handle resource content", async () => {
      mockFns.callTool.mockResolvedValue({
        content: [{ type: "resource", resource: { uri: "file:///test.txt" } }],
      });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      const result = await client.callTool("tool", {});
      expect(result).toBe("[resource: file:///test.txt]");
    });

    it("should prefix error for isError results", async () => {
      mockFns.callTool.mockResolvedValue({
        content: [{ type: "text", text: "Something went wrong" }],
        isError: true,
      });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      const result = await client.callTool("tool", {});
      expect(result).toBe("Error: Something went wrong");
    });

    it("should fallback to JSON.stringify for non-array content", async () => {
      mockFns.callTool.mockResolvedValue({ data: "unexpected format" });

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      const result = await client.callTool("tool", {});
      expect(result).toContain("unexpected format");
    });

    it("should return error when not connected", async () => {
      const client = new MCPClient("test", { command: "npx" });
      const result = await client.callTool("tool", {});
      expect(result).toContain("not connected");
    });

    it("should handle tool call exception", async () => {
      mockFns.callTool.mockRejectedValue(new Error("Tool crashed"));

      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      const result = await client.callTool("bad_tool", {});
      expect(result).toContain("MCP tool error");
      expect(result).toContain("Tool crashed");
    });
  });

  describe("getInfo", () => {
    it("should return server info when connected", async () => {
      mockFns.listTools.mockResolvedValue({
        tools: [
          { name: "tool1", description: "T1", inputSchema: {} },
          { name: "tool2", description: "T2", inputSchema: {} },
        ],
      });

      const client = new MCPClient("my-server", { command: "npx" });
      await client.connect();

      const info = client.getInfo();
      expect(info).toEqual({
        name: "my-server",
        status: "connected",
        toolsCount: 2,
        error: undefined,
      });
    });

    it("should return error info when connection failed", async () => {
      mockFns.connect.mockRejectedValue(new Error("Timeout"));

      const client = new MCPClient("bad", { command: "npx" });
      await client.connect();

      const info = client.getInfo();
      expect(info.status).toBe("error");
      expect(info.error).toBe("Timeout");
      expect(info.toolsCount).toBe(0);
    });
  });

  describe("getToolDefinitions", () => {
    it("should convert MCP tools to ToolDefWithMeta format", async () => {
      mockFns.listTools.mockResolvedValue({
        tools: [
          {
            name: "read_file",
            description: "Read a file",
            inputSchema: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        ],
      });

      const client = new MCPClient("fs", { command: "npx" });
      await client.connect();

      const defs = client.getToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]).toEqual({
        name: "mcp__fs__read_file",
        description: "[fs] Read a file",
        metadata: { category: "agent", parallelSafe: false, idempotent: false },
        input_schema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      });
    });

    it("should return empty array when no tools discovered", async () => {
      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      expect(client.getToolDefinitions()).toEqual([]);
    });
  });

  describe("reconnect", () => {
    it("should disconnect and connect again", async () => {
      const client = new MCPClient("test", { command: "npx" });
      await client.connect();

      mockFns.connect.mockClear();
      mockFns.close.mockClear();

      await client.reconnect();

      expect(mockFns.close).toHaveBeenCalled();
      expect(mockFns.connect).toHaveBeenCalledTimes(1);
      expect(client.status).toBe("connected");
    });
  });
});
