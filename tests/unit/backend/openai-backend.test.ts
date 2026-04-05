import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAIBackend } from "../../../src/backend/openai-backend.js";
import type { BackendConfig } from "../../../src/backend/backend-types.js";

describe("OpenAIBackend", () => {
  const mockConfig: BackendConfig = {
    model: "gpt-4o",
    systemPrompt: "You are a helpful assistant.",
    tools: [],
    baseURL: "https://api.openai.com/v1",
    apiKey: "test-key",
  };

  describe("constructor", () => {
    it("should initialize with config", () => {
      const backend = new OpenAIBackend(mockConfig, false, vi.fn());
      expect(backend.model).toBe("gpt-4o");
    });

    it("should add system message to messages", () => {
      const backend = new OpenAIBackend(mockConfig, false, vi.fn());
      const msgs = backend.getMessages() as any[];
      expect(msgs[0].role).toBe("system");
      expect(msgs[0].content).toBe("You are a helpful assistant.");
    });

    it("should accept isSubAgent and emitText parameters", () => {
      const emitText = vi.fn();
      const backend = new OpenAIBackend(mockConfig, true, emitText);
      expect(backend).toBeDefined();
    });
  });

  describe("MessageHandler core methods", () => {
    it("getMessages should return messages including system", () => {
      const backend = new OpenAIBackend(mockConfig, false, vi.fn());
      const msgs = backend.getMessages() as any[];
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      expect(msgs[0].role).toBe("system");
    });

    it("setMessages should update messages", () => {
      const backend = new OpenAIBackend(mockConfig, false, vi.fn());
      backend.setMessages([{ role: "user", content: "Hello" }]);
      expect(backend.getMessages()).toHaveLength(1);
    });

    it("clearMessages should reset to only system message", () => {
      const backend = new OpenAIBackend(mockConfig, false, vi.fn());
      backend.addUserMessage("Hello");
      backend.clearMessages();
      const msgs = backend.getMessages() as any[];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe("system");
    });

    it("updateModel should change model", () => {
      const backend = new OpenAIBackend(mockConfig, false, vi.fn());
      backend.updateModel("gpt-4o-mini");
      expect(backend.model).toBe("gpt-4o-mini");
    });

    it("getBackendType should return openai", () => {
      const backend = new OpenAIBackend(mockConfig, false, vi.fn());
      expect(backend.getBackendType()).toBe("openai");
    });
  });

  describe("addUserMessage", () => {
    it("should add user message to messages", () => {
      const backend = new OpenAIBackend(mockConfig, false, vi.fn());
      backend.addUserMessage("Hello");
      const msgs = backend.getMessages() as any[];
      expect(msgs.length).toBe(2); // system + user
      expect(msgs[1].role).toBe("user");
      expect(msgs[1].content).toBe("Hello");
    });
  });

  describe("findToolUseById", () => {
    it("should always return null for OpenAI backend", () => {
      const backend = new OpenAIBackend(mockConfig, false, vi.fn());
      expect(backend.findToolUseById("tool_123")).toBeNull();
    });
  });
});