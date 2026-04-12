import { describe, it, expect, beforeEach, vi } from "vitest";
import { Agent } from "../../../src/core/agent.js";

vi.mock("../../../src/tools/tools.js", async () => {
  const actual = await vi.importActual("../../../src/tools/tools.js");
  return {
    ...actual,
    toolDefinitions: [
      {
        name: "write_file",
        description: "Write file",
        input_schema: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            content: { type: "string" },
          },
          required: ["file_path", "content"],
        },
      },
      {
        name: "edit_file",
        description: "Edit file",
        input_schema: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            old_string: { type: "string" },
            new_string: { type: "string" },
          },
          required: ["file_path", "old_string", "new_string"],
        },
      },
    ],
    executeTool: vi.fn(),
    checkPermission: vi.fn().mockReturnValue({ action: "allow" }),
    generatePermissionRule: vi.fn(),
    savePermissionRule: vi.fn(),
    isParallelSafe: vi.fn().mockReturnValue(true),
    isIdempotent: vi.fn().mockReturnValue(true),
  };
});

vi.mock("../../../src/core/model-tiers.js", () => ({
  getModelForTier: vi.fn().mockReturnValue("glm-5"),
  resolveSubAgentModel: vi.fn().mockReturnValue({ tier: "pro", model: "glm-5", source: "default" }),
}));

vi.mock("../../../src/core/agent-model.js", () => ({
  getContextWindow: vi.fn().mockReturnValue(200000),
  isInternalModel: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../src/core/prompt.js", () => ({
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
    runCompression = vi.fn();
    addToolRound = vi.fn();
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

describe("Agent - File Tracking Atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have destroy method", async () => {
    const { Agent } = await import("../../../src/core/agent.js");
    expect(typeof Agent.prototype.destroy).toBe("function");
  });

  it("destroy should be callable", async () => {
    const { Agent } = await import("../../../src/core/agent.js");
    const agent = new Agent();
    expect(() => agent.destroy()).not.toThrow();
  });
});
