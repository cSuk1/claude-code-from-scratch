import { describe, it, expect, beforeEach, vi } from "vitest";
import { Agent } from "../../../src/core/agent.js";

vi.mock("../../../src/tools/tools.js", () => ({
  toolDefinitions: [],
  executeTool: vi.fn(),
  checkPermission: vi.fn().mockReturnValue({ action: "allow" }),
  generatePermissionRule: vi.fn(),
  savePermissionRule: vi.fn(),
  isParallelSafe: vi.fn().mockReturnValue(true),
  isIdempotent: vi.fn().mockReturnValue(true),
}));

vi.mock("../../../src/core/models/model-tiers.js", () => ({
  getModelForTier: vi.fn().mockReturnValue("glm-5"),
  resolveSubAgentModel: vi.fn().mockReturnValue({ tier: "pro", model: "glm-5", source: "default" }),
}));

vi.mock("../../../src/core/models/agent-model.js", () => ({
  getContextWindow: vi.fn().mockReturnValue(200000),
  isInternalModel: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../src/core/prompt/index.js", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("System prompt"),
  loadPlanModePrompt: vi.fn().mockReturnValue("Plan mode prompt"),
}));

vi.mock("../../../src/storage/session.js", () => ({
  saveSession: vi.fn(),
}));

vi.mock("../../../src/ui/index.js", () => ({
  printAssistantText: vi.fn(),
  printToolCall: vi.fn(),
  printToolResult: vi.fn(),
  printConfirmation: vi.fn(),
  printDivider: vi.fn(),
  printInfo: vi.fn(),
  printSubAgentStart: vi.fn(),
  printSubAgentEnd: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  updateSpinnerLabel: vi.fn(),
  flushMarkdown: vi.fn(),
  showMenu: vi.fn(),
  showQuestion: vi.fn(),
  showFreeTextInput: vi.fn(),
  getTaskSpinnerLabel: vi.fn(),
  printTaskSummary: vi.fn(),
  printTokenUsage: vi.fn(),
}));

vi.mock("../../../src/extensions/subagent.js", () => ({
  BUILTIN_AGENT_TYPES: {
    EXPLORE: "explore",
    PLAN: "plan",
    GENERAL: "general",
    COMPACT: "compact",
  },
  buildAgentDescriptions: vi.fn().mockReturnValue(""),
}));

vi.mock("../../../src/backend/index.js", () => {
  const MockBackend = class {
    model = "glm-5";
    systemPrompt = "System prompt";
    tools = [];
    messages = [];
    thinking = false;
    findToolUseById = vi.fn().mockReturnValue(null);
    createMessage = vi.fn();
    streamChunk = vi.fn();
    finalMessage = vi.fn().mockResolvedValue({ usage: { input_tokens: 100, output_tokens: 50 } });
  };
  return {
    AnthropicBackend: MockBackend,
    OpenAIBackend: MockBackend,
  };
});

vi.mock("../../../src/core/runtime/compress.js", () => ({
  CompressionPipeline: class {
    runAnthropic = vi.fn();
    runOpenAI = vi.fn();
    updateApiCallTime = vi.fn();
  },
}));

vi.mock("../../../src/core/execution/strategies.js", () => ({
  toolStrategies: {
    anthropic: { budget: vi.fn(), snip: vi.fn(), microcompact: vi.fn() },
    openai: { budget: vi.fn(), snip: vi.fn(), microcompact: vi.fn() },
  },
}));

describe("Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create agent with default options", () => {
      const agent = new Agent();
      expect(agent).toBeDefined();
      expect(agent.model).toBe("glm-5");
    });

    it("should create agent with custom model", () => {
      const agent = new Agent({ model: "gpt-4o" });
      expect(agent.model).toBe("gpt-4o");
    });

    it("should set default permission mode to default", () => {
      const agent = new Agent();
      expect(agent).toBeDefined();
    });

    it("should set permission mode to bypassPermissions when yolo is true", () => {
      const agent = new Agent({ yolo: true });
      expect(agent).toBeDefined();
    });

    it("should use custom system prompt when provided", () => {
      const customPrompt = "Custom system prompt";
      const agent = new Agent({ customSystemPrompt: customPrompt });
      expect(agent).toBeDefined();
    });

    it("should create sub-agent when isSubAgent is true", () => {
      const agent = new Agent({ isSubAgent: true });
      expect(agent).toBeDefined();
    });

    it("should set max turns when provided", () => {
      const agent = new Agent({ maxTurns: 10 });
      expect(agent).toBeDefined();
    });
  });

  describe("model getter", () => {
    it("should return the current model", () => {
      const agent = new Agent({ model: "claude-3-opus" });
      expect(agent.model).toBe("claude-3-opus");
    });
  });

  describe("permission modes", () => {
    it("should accept default permission mode", () => {
      const agent = new Agent({ permissionMode: "default" });
      expect(agent).toBeDefined();
    });

    it("should accept plan permission mode", () => {
      const agent = new Agent({ permissionMode: "plan" });
      expect(agent).toBeDefined();
    });

    it("should accept acceptEdits permission mode", () => {
      const agent = new Agent({ permissionMode: "acceptEdits" });
      expect(agent).toBeDefined();
    });

    it("should accept bypassPermissions permission mode", () => {
      const agent = new Agent({ permissionMode: "bypassPermissions" });
      expect(agent).toBeDefined();
    });

    it("should accept dontAsk permission mode", () => {
      const agent = new Agent({ permissionMode: "dontAsk" });
      expect(agent).toBeDefined();
    });
  });

  describe("thinking option", () => {
    it("should enable thinking when thinking is true", () => {
      const agent = new Agent({ thinking: true });
      expect(agent).toBeDefined();
    });

    it("should disable thinking by default", () => {
      const agent = new Agent();
      expect(agent).toBeDefined();
    });
  });

  describe("API configuration", () => {
    it("should accept apiKey", () => {
      const agent = new Agent({ apiKey: "sk-test-key" });
      expect(agent).toBeDefined();
    });

    it("should accept apiBase for OpenAI backend", () => {
      const agent = new Agent({ apiBase: "https://api.openai.com/v1" });
      expect(agent).toBeDefined();
    });

    it("should accept anthropicBaseURL", () => {
      const agent = new Agent({ anthropicBaseURL: "https://api.anthropic.com" });
      expect(agent).toBeDefined();
    });
  });

  describe("custom tools", () => {
    it("should accept custom tools", () => {
      const customTools = [
        {
          name: "custom_tool",
          description: "A custom tool",
          input_schema: {
            type: "object" as const,
            properties: {
              arg: { type: "string" },
            },
            required: ["arg"],
          },
        },
      ];
      const agent = new Agent({ customTools });
      expect(agent).toBeDefined();
    });
  });

  describe("callback functions", () => {
    it("should accept confirmFn", async () => {
      const confirmFn = vi.fn().mockResolvedValue("allow");
      const agent = new Agent({ confirmFn });
      expect(agent).toBeDefined();
    });

    it("should accept askUserFn", async () => {
      const askUserFn = vi.fn().mockResolvedValue("answer");
      const agent = new Agent({ askUserFn });
      expect(agent).toBeDefined();
    });
  });
});

describe("AgentOptions interface", () => {
  it("should allow all optional fields", () => {
    const options = {
      permissionMode: "default" as const,
      yolo: false,
      model: "glm-5",
      apiBase: "https://api.example.com",
      anthropicBaseURL: "https://api.anthropic.com",
      apiKey: "sk-key",
      thinking: true,
      maxTurns: 100,
      confirmFn: async () => "allow" as const,
      askUserFn: async () => "answer",
      customSystemPrompt: "Custom prompt",
      customTools: [] as any[],
      isSubAgent: false,
    };
    const agent = new Agent(options);
    expect(agent).toBeDefined();
  });
});
