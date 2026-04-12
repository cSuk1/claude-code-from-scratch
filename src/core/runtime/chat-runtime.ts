// Chat runtime — the core chat loop extracted from Agent.
// Handles streaming, parallel tool execution, auto-compact, and turn budget.

import type { MessageHandler, StreamResult, ToolResultEntry } from "../../backend/index.js";
import type { CompressionPipeline } from "./compress.js";
import type { ToolExecutor } from "../execution/tool-executor.js";
import { resolveSubAgentModel } from "../models/model-tiers.js";
import { BUILTIN_AGENT_TYPES } from "../../extensions/subagent.js";
import { taskStore } from "./task-store.js";
import {
  printToolCall,
  printToolResult,
  printInfo,
  startSpinner,
  stopSpinner,
  updateSpinnerLabel,
  flushMarkdown,
  getTaskSpinnerLabel,
  printTaskSummary,
  printTokenUsage,
  printDivider,
  printAssistantText,
  C,
  gradientDivider,
} from "../../ui/index.js";

// ─── Types ──────────────────────────────────────────────────

export interface ChatRuntimeConfig {
  backend: MessageHandler;
  compression: CompressionPipeline;
  toolExecutor: ToolExecutor;
  effectiveWindow: number;
  maxTurns?: number;
  isSubAgent: boolean;
}

export interface ChatRuntimeState {
  totalInputTokens: number;
  totalOutputTokens: number;
  currentTurns: number;
}

// ─── Constants ──────────────────────────────────────────────

const AUTO_COMPACT_THRESHOLD = 0.85;

// ─── Chat Runtime ───────────────────────────────────────────

export class ChatRuntime {
  private backend: MessageHandler;
  private compression: CompressionPipeline;
  private toolExecutor: ToolExecutor;
  private effectiveWindow: number;
  private maxTurns?: number;
  private isSubAgent: boolean;

  /** Mutable state — owned by Agent façade, passed by reference */
  private state: ChatRuntimeState;

  /** Output buffer for sub-agent mode (set externally) */
  outputBuffer: string[] | null = null;

  constructor(config: ChatRuntimeConfig, state: ChatRuntimeState) {
    this.backend = config.backend;
    this.compression = config.compression;
    this.toolExecutor = config.toolExecutor;
    this.effectiveWindow = config.effectiveWindow;
    this.maxTurns = config.maxTurns;
    this.isSubAgent = config.isSubAgent;
    this.state = state;
  }

  updateEffectiveWindow(window: number): void {
    this.effectiveWindow = window;
  }

  // ─── Core chat loop ───────────────────────────────────────

  async chatLoop(abortController: AbortController): Promise<void> {
    while (true) {
      if (abortController.signal.aborted) break;
      const toolResults: ToolResultEntry[] = [];
      this.backend.runCompression(this.compression, this.state.totalInputTokens);
      this.compression.updateApiCallTime();

      if (!this.isSubAgent) this.showSpinner();
      let firstText = true;
      let content = "";
      let toolCalls: StreamResult["toolCalls"] = [];
      let inputTokens = 0;
      let outputTokens = 0;
      let rawAssistantContent: unknown[] | undefined;

      // stream parallel tool calls (only for parallel safe tools)
      const parallelPromises = new Map<string, Promise<ToolResultEntry | null>>();

      try {
        for await (const chunk of this.backend.streamChunk(abortController.signal)) {
          if (chunk.content) {
            if (firstText) {
              if (!this.isSubAgent) {
                this.hideSpinner();
                const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
                console.log("");
                console.log(C.brand("  ◇ Assistant") + C.mutedDim("  ·") + C.muted("  " + now));
                console.log(gradientDivider(Math.min(process.stdout.columns || 50, 50)));
              }
              firstText = false;
            }
            content += chunk.content;
            this.emitText(chunk.content);
          }
          if (chunk.toolCall) {
            toolCalls.push(chunk.toolCall);
            if (this.toolExecutor.canParallelExecute(chunk.toolCall.name)) {
              parallelPromises.set(
                chunk.toolCall.id,
                this.toolExecutor.execute(chunk.toolCall.name, chunk.toolCall.id, chunk.toolCall.arguments, false),
              );
            }
          }
          if (chunk.usage) {
            inputTokens = chunk.usage.inputTokens;
            outputTokens = chunk.usage.outputTokens;
          }
          if (chunk.rawAssistantContent) {
            rawAssistantContent = chunk.rawAssistantContent;
          }
        }
      } catch (e: any) {
        if (!this.isSubAgent) this.hideSpinner();
        console.error("[API Error]", e.message, e.response?.data);
        throw e;
      }
      if (!this.isSubAgent) this.hideSpinner();

      this.state.totalInputTokens += inputTokens;
      this.state.totalOutputTokens += outputTokens;

      // auto compact
      if (this.state.totalInputTokens > this.effectiveWindow * AUTO_COMPACT_THRESHOLD) {
        printInfo("Context window filling up, compacting conversation...");
        const compactModel = resolveSubAgentModel(BUILTIN_AGENT_TYPES.COMPACT).model;
        await this.backend.compactConversation(compactModel);
        printInfo("Conversation compacted.");
      }

      if (toolCalls.length === 0) {
        if (!this.isSubAgent) flushMarkdown();
        break;
      }

      this.state.currentTurns++;
      if (this.maxTurns !== undefined && this.state.currentTurns >= this.maxTurns) {
        printInfo(`Budget exceeded: Turn limit reached (${this.state.currentTurns} >= ${this.maxTurns})`);
        break;
      }

      // wait for parallel tool calls to finish
      const parallelResults = await Promise.all(parallelPromises.values());
      for (const r of parallelResults) {
        if (r) toolResults.push(r);
      }

      // execute the remaining tool calls
      for (const tc of toolCalls) {
        if (abortController.signal.aborted) break;
        if (parallelPromises.has(tc.id)) continue;
        const toolResult = await this.toolExecutor.execute(tc.name, tc.id, tc.arguments, false);
        if (toolResult) toolResults.push(toolResult);
      }

      if (!this.isSubAgent) this.printToolResultsInOrder(toolCalls, toolResults);

      this.backend.addToolRound({ content, toolCalls, usage: { inputTokens, outputTokens }, rawAssistantContent }, toolResults);
    }
  }

  // ─── UI helpers ───────────────────────────────────────────

  showSpinner(label?: string): void {
    if (this.isSubAgent) return;
    const taskLabel = getTaskSpinnerLabel(taskStore.list());
    startSpinner(taskLabel || label || "Thinking");
  }

  hideSpinner(): void {
    if (this.isSubAgent) return;
    stopSpinner();
  }

  emitText(text: string): void {
    if (this.outputBuffer) {
      this.outputBuffer.push(text);
    } else {
      printAssistantText(text);
    }
  }

  private printToolResultsInOrder(toolCalls: StreamResult["toolCalls"], toolResults: ToolResultEntry[]) {
    const resultMap = new Map(toolResults.map(r => [r.toolCallId, r]));
    for (const tc of toolCalls) {
      const result = resultMap.get(tc.id);
      if (!result) continue;
      printToolCall(tc.name, JSON.parse(tc.arguments || "{}"));
      printToolResult(tc.name, result.content);
    }
  }
}
