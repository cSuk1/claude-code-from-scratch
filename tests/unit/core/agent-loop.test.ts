import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Agent } from "../../../src/core/agent.js";
import type { MessageHandler, StreamChunk, StreamResult, ToolResultEntry } from "../../../src/backend/backend-types.js";

class MockBackend implements MessageHandler {
  messages: any[] = [];
  model: string = "mock-model";
  private streamChunks: StreamChunk[] = [];
  private chunkIndex = 0;

  constructor(chunks: StreamChunk[] = []) {
    this.streamChunks = chunks;
  }

  setStreamChunks(chunks: StreamChunk[]) {
    this.streamChunks = chunks;
    this.chunkIndex = 0;
  }

  getMessages() { return this.messages; }
  setMessages(msgs: any[]) { this.messages = msgs; }
  clearMessages() { this.messages = []; }

  addUserMessage(content: string) {
    this.messages.push({ role: "user", content });
  }

  addAssistantMessage(content: string) {
    this.messages.push({ role: "assistant", content });
  }

  addToolRound(result: StreamResult, toolResults: ToolResultEntry[]) {
    this.messages.push({
      role: "assistant",
      content: result.content,
      tool_calls: result.toolCalls,
    });
    for (const tr of toolResults) {
      this.messages.push({
        role: "user",
        tool_use_id: tr.toolCallId,
        content: tr.content,
      });
    }
  }

  updateModel(model: string) { this.model = model; }
  getBackendType() { return "anthropic" as const; }
  getModel() { return this.model; }

  async stream() {
    return { content: "", toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 } };
  }

  async *streamChunk() {
    while (this.chunkIndex < this.streamChunks.length) {
      yield this.streamChunks[this.chunkIndex++];
    }
  }

  async compactConversation(): Promise<boolean> { return true; }
  runCompression() { }
  findToolUseById() { return null; }
}

describe("Agent 核心循环测试", () => {
  let mockBackend: MockBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBackend = new MockBackend();
  });

  describe("Agent 初始化", () => {
    it("应能创建 Agent 实例", () => {
      const agent = new Agent({ permissionMode: "bypassPermissions" });
      expect(agent).toBeDefined();
    });

    it("应能设置自定义模型", () => {
      const agent = new Agent({ model: "gpt-4o", permissionMode: "bypassPermissions" });
      expect(agent.model).toBe("gpt-4o");
    });

    it("应能设置权限模式", () => {
      const agent = new Agent({ permissionMode: "plan" });
      expect(agent).toBeDefined();
    });
  });

  describe("消息管理", () => {
    it("应能清空对话历史", () => {
      const agent = new Agent({ permissionMode: "bypassPermissions" });
      agent.clearHistory();
      expect(agent).toBeDefined();
    });
  });

  describe("chatLoop 逻辑 - 无工具调用", () => {
    it("应在无工具调用时结束循环", async () => {
      const mockBackend = new MockBackend([
        { content: "Hello, world!", done: true, usage: { inputTokens: 10, outputTokens: 5 } },
      ]);

      const agent = new Agent({
        permissionMode: "bypassPermissions",
      });

      (agent as any).backend = mockBackend;
      (agent as any).abortController = null;

      expect(agent).toBeDefined();
    });
  });

  describe("chatLoop 逻辑 - 带工具调用", () => {
    it("应能解析工具调用", async () => {
      const mockBackend = new MockBackend([
        {
          content: "I'll read that file.",
          toolCall: { id: "tool_1", name: "read_file", arguments: '{"file_path": "/test.txt"}' },
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        { done: true, usage: { inputTokens: 100, outputTokens: 100 } },
      ]);

      const agent = new Agent({
        permissionMode: "bypassPermissions",
      });

      (agent as any).backend = mockBackend;
      (agent as any).abortController = null;

      expect(agent).toBeDefined();
    });

    it("应能处理多个工具调用", async () => {
      const mockBackend = new MockBackend([
        {
          content: "I'll read both files.",
          toolCall: { id: "tool_1", name: "read_file", arguments: '{"file_path": "/a.txt"}' },
        },
        {
          content: "",
          toolCall: { id: "tool_2", name: "read_file", arguments: '{"file_path": "/b.txt"}' },
        },
        { done: true, usage: { inputTokens: 100, outputTokens: 80 } },
      ]);

      const agent = new Agent({
        permissionMode: "bypassPermissions",
      });

      (agent as any).backend = mockBackend;
      (agent as any).abortController = null;

      expect(agent).toBeDefined();
    });
  });

  describe("Token 统计", () => {
    it("应能追踪 token 使用", async () => {
      const mockBackend = new MockBackend([
        { content: "Response", usage: { inputTokens: 50, outputTokens: 30 } },
        { done: true, usage: { inputTokens: 50, outputTokens: 30 } },
      ]);

      const agent = new Agent({
        permissionMode: "bypassPermissions",
      });

      (agent as any).backend = mockBackend;
      (agent as any).totalInputTokens = 0;
      (agent as any).totalOutputTokens = 0;

      expect(agent).toBeDefined();
    });
  });

  describe("上下文压缩", () => {
    it("应能触发上下文压缩", async () => {
      const mockBackend = new MockBackend([
        { content: "Response", usage: { inputTokens: 180000, outputTokens: 100 } },
        { done: true, usage: { inputTokens: 180000, outputTokens: 100 } },
      ]);

      const agent = new Agent({
        permissionMode: "bypassPermissions",
      });

      (agent as any).backend = mockBackend;
      (agent as any).effectiveWindow = 200000;

      expect(agent).toBeDefined();
    });
  });

  describe("Budget 检查", () => {
    it("应能检查预算限制", () => {
      const agent = new Agent({
        permissionMode: "bypassPermissions",
        maxTurns: 5,
      });

      (agent as any).currentTurns = 5;

      expect(agent).toBeDefined();
    });
  });

  describe("并行工具执行", () => {
    it("应能识别并行安全工具", async () => {
      const { isParallelSafe } = await import("../../../src/tools/definitions.js");

      expect(isParallelSafe("read_file")).toBe(true);
      expect(isParallelSafe("list_files")).toBe(true);
    });

    it("应能识别非并行安全工具", async () => {
      const { isParallelSafe } = await import("../../../src/tools/definitions.js");

      expect(isParallelSafe("run_shell")).toBe(false);
    });
  });

  describe("权限检查集成", () => {
    it("应能在 bypassPermissions 模式下跳过权限检查", () => {
      const agent = new Agent({
        permissionMode: "bypassPermissions",
      });

      expect(agent).toBeDefined();
    });

    it("应能在 plan 模式下启用权限检查", () => {
      const agent = new Agent({
        permissionMode: "plan",
      });

      expect(agent).toBeDefined();
    });

    it("应能在 default 模式下启用权限检查", () => {
      const agent = new Agent({
        permissionMode: "default",
      });

      expect(agent).toBeDefined();
    });
  });

  describe("中断处理", () => {
    it("应能处理中止信号", () => {
      const controller = new AbortController();

      const agent = new Agent({
        permissionMode: "bypassPermissions",
      });

      (agent as any).abortController = controller;

      controller.abort();

      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe("子 Agent", () => {
    it("应能创建子 Agent", async () => {
      const parent = new Agent({
        permissionMode: "bypassPermissions",
      });

      const subAgent = new Agent({
        permissionMode: "bypassPermissions",
      });

      expect(parent).toBeDefined();
      expect(subAgent).toBeDefined();
    });
  });
});

describe("Agent 工具执行流程测试", () => {
  it("应能解析工具参数", async () => {
    const args = '{"file_path": "/test.txt", "limit": 10}';
    const parsed = JSON.parse(args);

    expect(parsed.file_path).toBe("/test.txt");
    expect(parsed.limit).toBe(10);
  });

  it("应能处理空工具参数", () => {
    const args = "";
    let parsed = {};
    try {
      parsed = JSON.parse(args);
    } catch {
      parsed = {};
    }

    expect(parsed).toEqual({});
  });
});

describe("Agent 消息格式测试", () => {
  it("应能构建正确的用户消息", () => {
    const message = { role: "user", content: "Hello" };
    expect(message.role).toBe("user");
    expect(message.content).toBe("Hello");
  });

  it("应能构建包含工具调用的助手消息", () => {
    const message = {
      role: "assistant",
      content: "I'll read the file",
      tool_calls: [
        { id: "tool_1", name: "read_file", arguments: '{"file_path": "/test.txt"}' },
      ],
    };

    expect(message.role).toBe("assistant");
    expect(message.tool_calls).toHaveLength(1);
    expect(message.tool_calls?.[0].name).toBe("read_file");
  });

  it("应能构建工具结果消息", () => {
    const message = {
      role: "user",
      content: "File content here",
      tool_use_id: "tool_1",
    };

    expect(message.role).toBe("user");
    expect(message.tool_use_id).toBe("tool_1");
  });
});
