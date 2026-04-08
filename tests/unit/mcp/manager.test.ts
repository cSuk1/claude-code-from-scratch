import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/ui/index.js", () => ({
  printInfo: vi.fn(),
}));

// Define the mock class inside vi.hoisted so it's available when vi.mock runs
const { MockMCPClient } = vi.hoisted(() => {
  class MockMCPClient {
    name: string;
    config: any;
    _status = "connected";
    _tools: any[] = [];
    _error: string | undefined = undefined;

    get status() { return this._status; }
    get tools() { return this._tools; }
    get error() { return this._error; }

    connect = vi.fn(async () => { this._status = "connected"; });
    disconnect = vi.fn(async () => { this._status = "disconnected"; this._tools = []; });
    callTool = vi.fn(async (_toolName: string, _args: any) => "mock result");
    getToolDefinitions = vi.fn(() =>
      this._tools.map((t: any) => ({
        name: t.namespacedName,
        description: `[${this.name}] ${t.description}`,
        metadata: { category: "agent", parallelSafe: false, idempotent: false },
        input_schema: t.inputSchema,
      }))
    );
    getInfo = vi.fn(() => ({
      name: this.name,
      status: this._status,
      toolsCount: this._tools.length,
      error: this._error,
    }));
    reconnect = vi.fn(async () => { this._status = "connected"; });

    constructor(name: string, config: any) {
      this.name = name;
      this.config = config;
    }
  }
  return { MockMCPClient };
});

vi.mock("../../../src/mcp/client.js", () => ({
  MCPClient: MockMCPClient,
}));

import { MCPClientManager } from "../../../src/mcp/manager.js";

describe("MCPClientManager", () => {
  describe("isMCPTool", () => {
    it("should return true for MCP tool names", () => {
      const manager = new MCPClientManager();
      expect(manager.isMCPTool("mcp__server__tool")).toBe(true);
    });

    it("should return false for non-MCP tool names", () => {
      const manager = new MCPClientManager();
      expect(manager.isMCPTool("read_file")).toBe(false);
      expect(manager.isMCPTool("run_shell")).toBe(false);
    });

    it("should return false for empty string", () => {
      const manager = new MCPClientManager();
      expect(manager.isMCPTool("")).toBe(false);
    });

    it("should return false for partial MCP prefix", () => {
      const manager = new MCPClientManager();
      expect(manager.isMCPTool("mcp_server_tool")).toBe(false);
    });
  });

  describe("executeTool - routing logic (no init)", () => {
    it("should return null for non-MCP tool names", async () => {
      const manager = new MCPClientManager();
      const result = await manager.executeTool("read_file", {});
      expect(result).toBeNull();
    });

    it("should return error for unknown MCP server", async () => {
      const manager = new MCPClientManager();
      const result = await manager.executeTool("mcp__unknown__tool", {});
      expect(result).toContain("Unknown MCP server");
    });
  });

  describe("empty manager", () => {
    it("should return empty server info", () => {
      const manager = new MCPClientManager();
      expect(manager.getServerInfo()).toEqual([]);
    });

    it("should return empty tool definitions", () => {
      const manager = new MCPClientManager();
      expect(manager.getAllToolDefinitions()).toEqual([]);
    });

    it("should have zero total tools", () => {
      const manager = new MCPClientManager();
      expect(manager.totalTools).toBe(0);
    });

    it("should shutdown without error", async () => {
      const manager = new MCPClientManager();
      await manager.shutdown();
    });

    it("should reconnect non-existent server without error", async () => {
      const manager = new MCPClientManager();
      await manager.reconnect("nonexistent");
    });

    it("should reconnectAll without error", async () => {
      const manager = new MCPClientManager();
      await manager.reconnectAll();
    });
  });

  describe("lifecycle", () => {
    it("should init with servers and report status", async () => {
      const manager = new MCPClientManager();

      await manager.init({
        filesystem: { command: "npx", args: ["-y", "@mcp/filesystem"] },
        remote: { url: "https://mcp.example.com/sse" },
      });

      const info = manager.getServerInfo();
      expect(info).toHaveLength(2);
      expect(info.map((i) => i.name)).toContain("filesystem");
      expect(info.map((i) => i.name)).toContain("remote");
      expect(info.every((i) => i.status === "connected")).toBe(true);
    });

    it("should aggregate tool definitions from connected clients", async () => {
      const manager = new MCPClientManager();

      await manager.init({ fs: { command: "npx" } });

      const clientsMap = (manager as any).clients as Map<string, InstanceType<typeof MockMCPClient>>;
      const fsClient = clientsMap.get("fs")!;
      fsClient._tools = [
        { serverName: "fs", originalName: "read", namespacedName: "mcp__fs__read", description: "Read", inputSchema: {} },
      ];

      const defs = manager.getAllToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0].name).toBe("mcp__fs__read");
    });

    it("should execute tool via correct client", async () => {
      const manager = new MCPClientManager();

      await manager.init({ myserver: { command: "npx" } });

      const result = await manager.executeTool("mcp__myserver__mytool", { arg: "value" });
      expect(result).toBe("mock result");
    });

    it("should return error for disconnected server on executeTool", async () => {
      const manager = new MCPClientManager();

      await manager.init({ myserver: { command: "npx" } });

      const clientsMap = (manager as any).clients as Map<string, InstanceType<typeof MockMCPClient>>;
      clientsMap.get("myserver")!._status = "disconnected";

      const result = await manager.executeTool("mcp__myserver__tool", {});
      expect(result).toContain("not connected");
    });

    it("should skip disconnected clients in getAllToolDefinitions", async () => {
      const manager = new MCPClientManager();

      await manager.init({
        s1: { command: "npx" },
        s2: { command: "npx" },
      });

      const clientsMap = (manager as any).clients as Map<string, InstanceType<typeof MockMCPClient>>;
      clientsMap.get("s1")!._status = "error";
      clientsMap.get("s2")!._tools = [
        { serverName: "s2", originalName: "tool", namespacedName: "mcp__s2__tool", description: "Tool", inputSchema: {} },
      ];

      const defs = manager.getAllToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0].name).toBe("mcp__s2__tool");
    });

    it("should not count tools from disconnected clients in totalTools", async () => {
      const manager = new MCPClientManager();

      await manager.init({
        s1: { command: "npx" },
        s2: { command: "npx" },
      });

      const clientsMap = (manager as any).clients as Map<string, InstanceType<typeof MockMCPClient>>;
      clientsMap.get("s1")!._tools = [{ name: "tool1" }];
      clientsMap.get("s1")!._status = "connected";
      clientsMap.get("s2")!._tools = [{ name: "tool2" }];
      clientsMap.get("s2")!._status = "error";

      expect(manager.totalTools).toBe(1);
    });

    it("should shutdown and clear all clients", async () => {
      const manager = new MCPClientManager();

      await manager.init({ s1: { command: "npx" } });
      expect(manager.getServerInfo()).toHaveLength(1);

      await manager.shutdown();
      expect(manager.getServerInfo()).toEqual([]);
    });

    it("should reconnect specific server", async () => {
      const manager = new MCPClientManager();

      await manager.init({ myserver: { command: "npx" } });
      await manager.reconnect("myserver");

      const info = manager.getServerInfo().find((s) => s.name === "myserver");
      expect(info?.status).toBe("connected");
    });

    it("should reconnect all servers", async () => {
      const manager = new MCPClientManager();

      await manager.init({
        s1: { command: "npx" },
        s2: { command: "npx" },
      });

      await manager.reconnectAll();

      const info = manager.getServerInfo();
      expect(info.every((s) => s.status === "connected")).toBe(true);
    });

    it("should handle init with empty config", async () => {
      const manager = new MCPClientManager();
      await manager.init({});
      expect(manager.getServerInfo()).toEqual([]);
    });
  });
});
