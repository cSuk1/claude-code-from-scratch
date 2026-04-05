import { describe, it, expect } from "vitest";
import type { StreamChunk, StreamResult, BackendConfig, MessageHandler, StreamEvent, ToolResultEntry } from "../../../src/backend/backend-types.js";

describe("Backend Types", () => {
  describe("StreamChunk", () => {
    it("should have correct type for text chunk", () => {
      const chunk: StreamChunk = {
        content: "Hello",
      };
      expect(chunk.content).toBe("Hello");
    });

    it("should have correct type for tool_call chunk", () => {
      const chunk: StreamChunk = {
        toolCall: {
          id: "tool_123",
          name: "read_file",
          arguments: '{}',
        },
      };
      expect(chunk.toolCall?.name).toBe("read_file");
    });

    it("should have correct type for done chunk", () => {
      const chunk: StreamChunk = {
        usage: { inputTokens: 100, outputTokens: 50 },
        done: true,
      };
      expect(chunk.done).toBe(true);
      expect(chunk.usage?.inputTokens).toBe(100);
    });

    it("should support rawAssistantContent", () => {
      const chunk: StreamChunk = {
        content: "Hello",
        rawAssistantContent: [{ type: "text", text: "Hello" }],
      };
      expect(chunk.rawAssistantContent).toBeDefined();
    });
  });

  describe("StreamResult", () => {
    it("should have correct shape", () => {
      const result: StreamResult = {
        content: "Hi there!",
        toolCalls: [
          { id: "tool_1", name: "read_file", arguments: '{"file_path": "/test.ts"}' },
        ],
        usage: { inputTokens: 10, outputTokens: 20 },
      };
      expect(result.content).toBe("Hi there!");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.usage?.inputTokens).toBe(10);
    });

    it("should allow optional rawAssistantContent", () => {
      const result: StreamResult = {
        content: "Hello",
        toolCalls: [],
        usage: { inputTokens: 5, outputTokens: 10 },
        rawAssistantContent: [{ type: "text", text: "Hello" }],
      };
      expect(result.rawAssistantContent).toBeDefined();
    });
  });

  describe("BackendConfig", () => {
    it("should have correct shape for Anthropic", () => {
      const config: BackendConfig = {
        model: "claude-sonnet-4-20250514",
        systemPrompt: "You are helpful.",
        tools: [],
        thinking: true,
      };
      expect(config.model).toBe("claude-sonnet-4-20250514");
      expect(config.thinking).toBe(true);
    });

    it("should have correct shape for OpenAI", () => {
      const config: BackendConfig = {
        model: "gpt-4o",
        systemPrompt: "You are helpful.",
        tools: [],
        baseURL: "https://api.openai.com/v1",
        apiKey: "sk-test",
      };
      expect(config.baseURL).toBe("https://api.openai.com/v1");
      expect(config.apiKey).toBe("sk-test");
    });

    it("should allow optional fields", () => {
      const config: BackendConfig = {
        model: "gpt-4o",
        systemPrompt: "You are helpful.",
        tools: [],
      };
      expect(config).toBeDefined();
    });
  });

  describe("ToolResultEntry", () => {
    it("should have correct shape", () => {
      const entry: ToolResultEntry = {
        toolCallId: "tool_123",
        content: "File content here",
      };
      expect(entry.toolCallId).toBe("tool_123");
      expect(entry.content).toBe("File content here");
    });
  });

  describe("StreamEvent", () => {
    it("should support text type", () => {
      const event: StreamEvent = { type: "text", content: "Hello" };
      expect(event.type).toBe("text");
    });

    it("should support thinking type", () => {
      const event: StreamEvent = { type: "thinking", content: "Thinking..." };
      expect(event.type).toBe("thinking");
    });

    it("should support tool_use type", () => {
      const event: StreamEvent = { type: "tool_use", id: "tool_1", name: "read_file", input: {} };
      expect(event.type).toBe("tool_use");
      expect(event.name).toBe("read_file");
    });

    it("should support done type", () => {
      const event: StreamEvent = { type: "done" };
      expect(event.type).toBe("done");
    });
  });
});

describe("MessageHandler interface", () => {
  it("should define required methods", () => {
    const handler: MessageHandler = {
      getMessages: () => [],
      setMessages: () => { },
      clearMessages: () => { },
      stream: async () => ({ content: "", toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 } }),
      streamChunk: async function* () { },
      compactConversation: async () => false,
      updateModel: () => { },
      addUserMessage: () => { },
      addToolRound: () => { },
      runCompression: () => { },
      findToolUseById: () => null,
      getBackendType: function (): "anthropic" | "openai" {
        throw new Error("Function not implemented.");
      }
    };
    expect(handler).toBeDefined();
  });
});
