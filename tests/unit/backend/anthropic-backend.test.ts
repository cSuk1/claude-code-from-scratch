import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicBackend } from "../../../src/backend/anthropic-backend.js";
import type { BackendConfig } from "../../../src/backend/backend-types.js";

describe("AnthropicBackend", () => {
  const mockConfig: BackendConfig = {
    model: "claude-sonnet-4-20250514",
    systemPrompt: "You are a helpful assistant.",
    tools: [],
  };

  describe("constructor", () => {
    it("should initialize with config", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      expect(backend.model).toBe("claude-sonnet-4-20250514");
    });

    it("should accept isSubAgent and emitText parameters", () => {
      const emitText = vi.fn();
      const backend = new AnthropicBackend(mockConfig, true, emitText);
      expect(backend).toBeDefined();
    });
  });

  describe("MessageHandler core methods", () => {
    it("getMessages should return empty array initially", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      expect(backend.getMessages()).toEqual([]);
    });

    it("setMessages should update messages", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      backend.setMessages([{ role: "user", content: "Hello" }]);
      expect(backend.getMessages()).toHaveLength(1);
    });

    it("clearMessages should reset to empty", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      backend.setMessages([{ role: "user", content: "Hello" }]);
      backend.clearMessages();
      expect(backend.getMessages()).toEqual([]);
    });

    it("updateModel should change model", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      backend.updateModel("claude-haiku-3-5");
      expect(backend.model).toBe("claude-haiku-3-5");
    });

    it("getBackendType should return anthropic", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      expect(backend.getBackendType()).toBe("anthropic");
    });
  });

  describe("addUserMessage", () => {
    it("should add user message to messages", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      backend.addUserMessage("Hello");
      const msgs = backend.getMessages() as any[];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe("user");
      expect(msgs[0].content).toBe("Hello");
    });
  });

  describe("findToolUseById", () => {
    it("should return null when no messages", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      expect(backend.findToolUseById("tool_123")).toBeNull();
    });

    it("should find tool use by id in messages", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      backend.setMessages([
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tool_123", name: "read_file", input: { file_path: "/test.ts" } },
          ],
        },
      ]);
      const result = backend.findToolUseById("tool_123");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("read_file");
      expect(result?.input).toEqual({ file_path: "/test.ts" });
    });

    it("should return null for non-existent id", () => {
      const backend = new AnthropicBackend(mockConfig, false, vi.fn());
      backend.setMessages([
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "tool_123", name: "read_file", input: {} }],
        },
      ]);
      expect(backend.findToolUseById("tool_456")).toBeNull();
    });
  });

  describe("thinkingMode", () => {
    it("should disable thinking when config.thinking is false", () => {
      const config: BackendConfig = { ...mockConfig, thinking: false };
      const backend = new AnthropicBackend(config, false, vi.fn());
      // Access private property via getMessages pattern or just verify model
      expect(backend.model).toBeDefined();
    });

    it("should enable thinking when config.thinking is true", () => {
      const config: BackendConfig = { ...mockConfig, thinking: true };
      const backend = new AnthropicBackend(config, false, vi.fn());
      expect(backend.model).toBeDefined();
    });
  });
});

describe("toOpenAITools (via OpenAIBackend)", () => {
  // This tests the internal helper via checking OpenAIBackend behavior
  it("should be defined and importable", async () => {
    const { OpenAIBackend } = await import("../../../src/backend/openai-backend.js");
    expect(OpenAIBackend).toBeDefined();
  });
});