// Execution strategies — sub-agent and skill execution via forked Agent instances.
// Moved from core/agent-strategies.ts to core/execution/ for cohesion with tool-executor.

import { Agent } from "../agent.js";
import { getSubAgentConfig, BUILTIN_AGENT_TYPES, type SubAgentType } from "../../extensions/subagent.js";
import { resolveSubAgentModel } from "../models/model-tiers.js";
import type { ToolDef } from "../../tools/tools.js";
import { printSubAgentStart, printSubAgentEnd } from "../../ui/index.js";

/**
 * Base interface for execution strategies
 */
export interface ExecutionStrategy {
  execute(agent: Agent, input: Record<string, any>): Promise<string>;
}

/**
 * Sub-agent execution strategy
 */
export class AgentStrategy implements ExecutionStrategy {
  async execute(agent: Agent, input: Record<string, any>): Promise<string> {
    const type = (input.type || "general") as SubAgentType;
    const description = input.description || "sub-agent task";
    const prompt = input.prompt || "";
    const explicitModel = input.model as string | undefined;

    const config = getSubAgentConfig(type);
    const routing = resolveSubAgentModel(type, explicitModel || config.model);

    printSubAgentStart(type, `${description} [${routing.tier}:${routing.model}]`);

    const subAgent = new Agent({
      model: routing.model,
      apiBase: agent.apiBaseConfig,
      apiKey: agent.apiKeyConfig,
      anthropicBaseURL: agent.anthropicBaseURLConfig,
      customSystemPrompt: config.systemPrompt,
      customTools: config.tools,
      isSubAgent: true,
      permissionMode: "bypassPermissions",
    });

    try {
      const result = await subAgent.runOnce(prompt);
      agent.addTokenUsage(result.tokens.input, result.tokens.output);
      printSubAgentEnd(type, description);
      return result.text || "(Sub-agent produced no output)";
    } catch (e: any) {
      printSubAgentEnd(type, description);
      return `Sub-agent error: ${e.message}`;
    }
  }
}

/**
 * Skill execution strategy
 */
export class SkillStrategy implements ExecutionStrategy {
  async execute(agent: Agent, input: Record<string, any>): Promise<string> {
    const { executeSkill } = await import("../../extensions/skills.js");
    const skillName = input.skill_name;
    const result = executeSkill(skillName, input.args || "");

    if (!result) return `Unknown skill: ${skillName}`;

    if (result.context === "fork") {
      const tools = result.allowedTools
        ? agent.toolDefs.filter(t => result.allowedTools!.includes(t.name))
        : agent.toolDefs.filter(t => t.name !== "agent");

      const routing = resolveSubAgentModel(BUILTIN_AGENT_TYPES.EXPLORE, result.model);

      printSubAgentStart("skill-fork", `${skillName} [${routing.tier}:${routing.model}]`);
      const subAgent = new Agent({
        model: routing.model,
        apiBase: agent.apiBaseConfig,
        apiKey: agent.apiKeyConfig,
        anthropicBaseURL: agent.anthropicBaseURLConfig,
        customSystemPrompt: result.prompt,
        customTools: tools,
        isSubAgent: true,
        permissionMode: "bypassPermissions",
      });

      try {
        const subResult = await subAgent.runOnce(input.args || "Execute this skill task.");
        agent.addTokenUsage(subResult.tokens.input, subResult.tokens.output);
        printSubAgentEnd("skill-fork", skillName);
        return subResult.text || "(Skill produced no output)";
      } catch (e: any) {
        printSubAgentEnd("skill-fork", skillName);
        return `Skill fork error: ${e.message}`;
      }
    }

    return `[Skill "${skillName}" activated]\n\n${result.prompt}`;
  }
}

/**
 * Registry for tool execution strategies
 */
export class ToolStrategyRegistry {
  private strategies = new Map<string, ExecutionStrategy>();

  constructor() {
    this.register("agent", new AgentStrategy());
    this.register("skill", new SkillStrategy());
  }

  register(name: string, strategy: ExecutionStrategy): void {
    this.strategies.set(name, strategy);
  }

  get(name: string): ExecutionStrategy | undefined {
    return this.strategies.get(name);
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }
}

// Global registry instance
export const toolStrategies = new ToolStrategyRegistry();
