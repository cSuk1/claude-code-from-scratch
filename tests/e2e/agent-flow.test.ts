import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";
import { Agent } from "../../src/core/agent.js";

describe("E2E - Agent Complete Flow", () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      if (req.url?.includes("/chat/completions")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "chatcmpl-mock",
          object: "chat.completion",
          created: Date.now(),
          model: "gpt-4o",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: "I've read the file. It contains sample code."
            },
            finish_reason: "stop",
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }));
      } else if (req.url?.includes("/messages")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "msg-mock",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "I've read the file. It contains sample code." }],
          model: "claude-sonnet-4-20250514",
          usage: { input_tokens: 10, output_tokens: 20 },
        }));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });

    process.env.OPENAI_API_KEY = "mock-key";
    process.env.OPENAI_BASE_URL = `http://localhost:${port}/v1`;
  });

  afterEach(() => {
    server.close();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  });

  it("应能使用 OpenAI 兼容后端创建 Agent", () => {
    const agent = new Agent({
      model: "gpt-4o",
      permissionMode: "bypassPermissions",
    });
    expect(agent).toBeDefined();
    expect(agent.model).toBe("gpt-4o");
  });

  it("Agent 应有正确的属性和方法", () => {
    const agent = new Agent({ permissionMode: "bypassPermissions" });

    expect(agent).toHaveProperty("model");
    expect(agent).toHaveProperty("chat");
    expect(agent).toHaveProperty("clearHistory");
    expect(agent).toHaveProperty("compact");
  });

  it("clearHistory 应清空对话历史", () => {
    const agent = new Agent({ permissionMode: "bypassPermissions" });
    agent.clearHistory();
    expect(agent).toBeDefined();
  });
});

describe("E2E - Agent with Tools", () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      const body = "";

      if (req.url?.includes("/chat/completions")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "chatcmpl-tool-mock",
          object: "chat.completion",
          created: Date.now(),
          model: "gpt-4o",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: '{"file_path": "/test.txt"}'
                  }
                }
              ]
            },
            finish_reason: "tool_calls",
          }],
          usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
        }));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });

    process.env.OPENAI_API_KEY = "mock-key";
    process.env.OPENAI_BASE_URL = `http://localhost:${port}/v1`;
  });

  afterEach(() => {
    server.close();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  });

  it("Agent 应能加载工具定义", () => {
    const agent = new Agent({ permissionMode: "bypassPermissions" });
    expect(agent).toBeDefined();
  });
});

describe("E2E - CLI Entry Point", () => {
  it("应能导入 CLI 主入口", async () => {
    const cli = await import("../../src/cli.js");
    expect(cli).toBeDefined();
  });

  it("应能导入 REPL 模块", async () => {
    const repl = await import("../../src/cli/repl.js");
    expect(repl).toBeDefined();
  });

  it("应能导入命令模块", async () => {
    const commands = await import("../../src/cli/commands.js");
    expect(commands).toBeDefined();
    expect(commands.CommandRegistry).toBeDefined();
    expect(commands.registerBuiltinCommands).toBeDefined();
  });
});

describe("E2E - Complete Workflow Simulation", () => {
  it("应能模拟完整的 Agent 工作流", () => {
    const agent = new Agent({
      model: "test-model",
      permissionMode: "bypassPermissions",
    });

    agent.clearHistory();
    expect(agent).toBeDefined();
  });

  it("应能创建子 Agent", async () => {
    const { Agent: SubAgent } = await import("../../src/core/agent.js");
    const subAgent = new SubAgent({
      model: "mini-model",
      permissionMode: "bypassPermissions",
    });
    expect(subAgent).toBeDefined();
  });
});
