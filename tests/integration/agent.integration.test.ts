import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Agent 集成测试 - 工具模块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应能导入工具模块", async () => {
    const tools = await import("../../src/tools/tools.js");
    expect(tools).toBeDefined();
    expect(tools.toolDefinitions).toBeDefined();
  });

  it("toolDefinitions 应包含必要的工具", async () => {
    const { toolDefinitions } = await import("../../src/tools/tools.js");
    const toolNames = toolDefinitions.map((t: any) => t.name);

    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("write_file");
    expect(toolNames).toContain("run_shell");
  });

  it("每个工具应有有效的 input_schema", async () => {
    const { toolDefinitions } = await import("../../src/tools/tools.js");

    for (const tool of toolDefinitions) {
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.properties).toBeDefined();
    }
  });
});

describe("Agent 集成测试 - AgentModel 模块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应能导入 agent-model 模块", async () => {
    const agentModel = await import("../../src/core/agent-model.js");
    expect(agentModel).toBeDefined();
  });

  it("getContextWindow 应返回有效的上下文窗口大小", async () => {
    const { getContextWindow } = await import("../../src/core/agent-model.js");

    const window = getContextWindow("glm-5");
    expect(window).toBeGreaterThan(0);
  });

  it("isInternalModel 应正确识别内部模型", async () => {
    const { isInternalModel } = await import("../../src/core/agent-model.js");

    expect(typeof isInternalModel("glm-5")).toBe("boolean");
  });
});

describe("Agent 集成测试 - ModelTiers 模块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应能导入 model-tiers 模块", async () => {
    const modelTiers = await import("../../src/core/model-tiers.js");
    expect(modelTiers).toBeDefined();
  });

  it("getModelForTier 应返回各层级的默认模型", async () => {
    const { getModelForTier } = await import("../../src/core/model-tiers.js");

    const proModel = getModelForTier("pro");
    const liteModel = getModelForTier("lite");
    const miniModel = getModelForTier("mini");

    expect(proModel).toBeDefined();
    expect(liteModel).toBeDefined();
    expect(miniModel).toBeDefined();
  });

  it("resolveSubAgentModel 应正确解析子代理模型", async () => {
    const { resolveSubAgentModel } = await import("../../src/core/model-tiers.js");

    const result = resolveSubAgentModel("explore");
    expect(result).toHaveProperty("tier");
    expect(result).toHaveProperty("model");
  });
});

describe("Agent 集成测试 - Prompt 模块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应能导入 prompt 模块", async () => {
    const prompt = await import("../../src/core/prompt.js");
    expect(prompt).toBeDefined();
  });

  it("buildSystemPrompt 应返回有效的系统提示词", async () => {
    const { buildSystemPrompt } = await import("../../src/core/prompt.js");

    const prompt = buildSystemPrompt();
    expect(prompt).toBeDefined();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("loadPlanModePrompt 应返回有效的计划模式提示词", async () => {
    const { loadPlanModePrompt } = await import("../../src/core/prompt.js");

    const prompt = loadPlanModePrompt();
    expect(prompt).toBeDefined();
    expect(typeof prompt).toBe("string");
  });
});

describe("Agent 集成测试 - Backend 模块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应能导入 backend 模块", async () => {
    const backend = await import("../../src/backend/index.js");
    expect(backend).toBeDefined();
  });

  it("应导出 AnthropicBackend", async () => {
    const { AnthropicBackend } = await import("../../src/backend/index.js");
    expect(AnthropicBackend).toBeDefined();
  });

  it("应导出 OpenAIBackend", async () => {
    const { OpenAIBackend } = await import("../../src/backend/index.js");
    expect(OpenAIBackend).toBeDefined();
  });
});

describe("Agent 集成测试 - 工具执行", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isParallelSafe 应正确判断工具是否可并行执行", async () => {
    const { isParallelSafe } = await import("../../src/tools/tools.js");

    expect(isParallelSafe("read_file")).toBe(true);
    expect(isParallelSafe("list_files")).toBe(true);
  });

  it("isIdempotent 应正确判断工具是否是幂等的", async () => {
    const { isIdempotent } = await import("../../src/tools/tools.js");

    expect(isIdempotent("read_file")).toBe(true);
  });
});

describe("Agent 集成测试 - 子代理模块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应能导入 subagent 模块", async () => {
    const subagent = await import("../../src/extensions/subagent.js");
    expect(subagent).toBeDefined();
  });

  it("应包含内置代理类型定义", async () => {
    const { BUILTIN_AGENT_TYPES } = await import("../../src/extensions/subagent.js");

    expect(BUILTIN_AGENT_TYPES).toBeDefined();
    expect(BUILTIN_AGENT_TYPES.EXPLORE).toBe("explore");
    expect(BUILTIN_AGENT_TYPES.PLAN).toBe("plan");
    expect(BUILTIN_AGENT_TYPES.GENERAL).toBe("general");
    expect(BUILTIN_AGENT_TYPES.COMPACT).toBe("compact");
  });
});

describe("Agent 集成测试 - 压缩模块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应能导入压缩模块", async () => {
    const compress = await import("../../src/core/compress.js");
    expect(compress).toBeDefined();
  });

  it("CompressionPipeline 应可实例化", async () => {
    const { CompressionPipeline } = await import("../../src/core/compress.js");

    const pipeline = new CompressionPipeline(100000, () => null);
    expect(pipeline).toBeDefined();
  });
});
