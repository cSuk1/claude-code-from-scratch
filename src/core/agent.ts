// Agent — thin façade that delegates to runtime, execution, and persistence modules.
// Preserves the original public API so CLI/REPL code needs zero changes.

import { toolDefinitions, type ToolDef, type PermissionMode } from "../tools/tools.js";
import { getContextWindow, isInternalModel } from "./models/agent-model.js";
import { getModelForTier, resolveSubAgentModel } from "./models/model-tiers.js";
import { buildSystemPrompt, loadPlanModePrompt } from "./prompt/index.js";
import { taskStore } from "./runtime/task-store.js";
import { randomUUID } from "crypto";
import { setMaxListeners } from "events";
import {
  AnthropicBackend,
  OpenAIBackend,
  type BackendConfig,
  type MessageHandler,
} from "../backend/index.js";
import { CompressionPipeline } from "./runtime/compress.js";
import { BUILTIN_AGENT_TYPES } from "../extensions/subagent.js";
import { initFileTracker, getTracker, clearTracker } from "../storage/file-tracker.js";
import type { MCPClientManager } from "../mcp/index.js";
import {
  printInfo,
  printTaskSummary,
  printTokenUsage,
  printDivider,
  getTaskSpinnerLabel,
  updateSpinnerLabel,
} from "../ui/index.js";

// Internal modules
import { ChatRuntime, SessionPersistence, type ChatRuntimeState } from "./runtime/index.js";
import { ToolExecutor, PermissionGate, type ToolExecutorHost } from "./execution/index.js";

// ─── Constants ──────────────────────────────────────────────

const CONTEXT_WINDOW_RESERVED_TOKENS = 20000;
const DEFAULT_MAX_TURNS = 50;

// ─── Options ────────────────────────────────────────────────

interface AgentOptions {
  permissionMode?: PermissionMode;
  yolo?: boolean;
  model?: string;
  apiBase?: string;
  anthropicBaseURL?: string;
  apiKey?: string;
  thinking?: boolean;
  maxTurns?: number;
  confirmFn?: (toolName: string, input: Record<string, any>) => Promise<"allow" | "deny">;
  askUserFn?: (question: string, options?: string[], allowFreeText?: boolean) => Promise<string>;
  customSystemPrompt?: string;
  customTools?: ToolDef[];
  isSubAgent?: boolean;
  mcpManager?: MCPClientManager;
}

// ─── Agent (façade) ─────────────────────────────────────────

export class Agent implements ToolExecutorHost {
  // ── Internal modules ────────────────────────────────────
  private backend: MessageHandler;
  private compression: CompressionPipeline;
  private chatRuntime: ChatRuntime;
  private sessionPersistence: SessionPersistence;
  private permissionGate: PermissionGate;
  private toolExecutor: ToolExecutor;

  // ── State ───────────────────────────────────────────────
  private _permissionMode: PermissionMode;
  private _model: string;
  private _isSubAgent: boolean;
  private _mcpManager?: MCPClientManager;
  private _tools: ToolDef[];
  private _askUserFn?: (question: string, options?: string[], allowFreeText?: boolean) => Promise<string>;
  private _apiBase?: string;
  private _apiKey?: string;
  private _anthropicBaseURL?: string;
  private _effectiveWindow: number;
  private _sessionId: string;

  private abortController: AbortController | null = null;
  private unsubscribeTaskStore?: () => void;

  /** Shared mutable state between agent and runtime */
  private runtimeState: ChatRuntimeState;

  // ── ToolExecutorHost interface ──────────────────────────
  get isSubAgent(): boolean { return this._isSubAgent; }
  get permissionMode(): PermissionMode { return this._permissionMode; }
  get mcpManager(): MCPClientManager | undefined { return this._mcpManager; }
  get toolDefs(): ToolDef[] { return this._tools; }
  get apiBaseConfig(): string | undefined { return this._apiBase; }
  get apiKeyConfig(): string | undefined { return this._apiKey; }
  get anthropicBaseURLConfig(): string | undefined { return this._anthropicBaseURL; }
  get askUserFn() { return this._askUserFn; }
  get model(): string { return this._model; }
  get mcp(): MCPClientManager | undefined { return this._mcpManager; }

  get isProcessing(): boolean {
    return this.abortController !== null;
  }

  addTokenUsage(input: number, output: number): void {
    this.runtimeState.totalInputTokens += input;
    this.runtimeState.totalOutputTokens += output;
  }

  hideSpinner(): void {
    this.chatRuntime.hideSpinner();
  }

  // ── Constructor ─────────────────────────────────────────

  constructor(options: AgentOptions = {}) {
    this._permissionMode = options.permissionMode || (options.yolo ? "bypassPermissions" : "default");
    this._model = options.model || getModelForTier("pro");
    this._isSubAgent = options.isSubAgent || false;
    this._mcpManager = options.mcpManager;
    this._askUserFn = options.askUserFn;
    this._apiBase = options.apiBase;
    this._apiKey = options.apiKey;
    this._anthropicBaseURL = options.anthropicBaseURL;
    this._effectiveWindow = getContextWindow(this._model) - CONTEXT_WINDOW_RESERVED_TOKENS;
    this._sessionId = randomUUID().slice(0, 8);
    const sessionStartTime = new Date().toISOString();

    const maxTurns = options.maxTurns ?? (options.isSubAgent ? undefined : DEFAULT_MAX_TURNS);

    // Initialize file change tracker for non-sub-agents
    if (!this._isSubAgent) {
      initFileTracker(this._sessionId);
    }

    // Build tool list
    if (options.customTools) {
      this._tools = options.customTools;
    } else {
      const mcpTools = this._mcpManager?.getAllToolDefinitions() || [];
      this._tools = [...toolDefinitions, ...mcpTools];
    }

    // Build system prompt
    let sysPrompt = options.customSystemPrompt || buildSystemPrompt();
    if (this._permissionMode === "plan") {
      sysPrompt += "\n\n" + loadPlanModePrompt();
    }

    // Backend
    const backendConfig: BackendConfig = {
      model: this._model,
      systemPrompt: sysPrompt,
      tools: this._tools,
      thinking: options.thinking || false,
      apiKey: options.apiKey,
      baseURL: options.apiBase,
    };

    const emitText = (text: string) => this.chatRuntime.emitText(text);
    const useOpenAI = !!options.apiBase;
    if (useOpenAI) {
      this.backend = new OpenAIBackend(backendConfig, this._isSubAgent, emitText);
    } else {
      this.backend = new AnthropicBackend(
        { ...backendConfig, baseURL: options.anthropicBaseURL },
        this._isSubAgent,
        emitText,
      );
    }

    // Compression
    this.compression = new CompressionPipeline(
      this._effectiveWindow,
      (id) => this.backend.findToolUseById(id),
    );

    // Shared state
    this.runtimeState = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      currentTurns: 0,
    };

    // Permission gate
    this.permissionGate = new PermissionGate();
    if (options.confirmFn) {
      this.permissionGate.setConfirmFn(options.confirmFn);
    }

    // Tool executor
    this.toolExecutor = new ToolExecutor(this, this.permissionGate);

    // Chat runtime
    this.chatRuntime = new ChatRuntime(
      {
        backend: this.backend,
        compression: this.compression,
        toolExecutor: this.toolExecutor,
        effectiveWindow: this._effectiveWindow,
        maxTurns,
        isSubAgent: this._isSubAgent,
      },
      this.runtimeState,
    );

    // Session persistence
    this.sessionPersistence = new SessionPersistence(
      this._sessionId,
      sessionStartTime,
      () => this._model,
      this.backend,
    );

    // Task store subscription (spinner updates)
    if (!this._isSubAgent) {
      this.unsubscribeTaskStore = taskStore.onChange(() => {
        const label = getTaskSpinnerLabel(taskStore.list());
        if (label) updateSpinnerLabel(label);
      });
    }
  }

  // ─── Public API (unchanged from original) ─────────────────

  abort() {
    this.abortController?.abort();
  }

  switchModel(newModel: string): { model: string; known: boolean } {
    if (newModel === this._model) return { model: this._model, known: true };
    const known = isInternalModel(newModel);
    this._model = newModel;
    this._effectiveWindow = getContextWindow(newModel) - CONTEXT_WINDOW_RESERVED_TOKENS;
    this.backend.updateModel(newModel);
    this.chatRuntime.updateEffectiveWindow(this._effectiveWindow);
    return { model: this._model, known };
  }

  /**
   * Rebuild the backend with new API configuration.
   * Used by /connect to switch provider, baseURL, apiKey and model at runtime
   * without restarting the process.
   */
  reconnect(config: {
    provider: "anthropic" | "openai";
    baseUrl?: string;
    apiKey?: string;
    model: string;
  }): void {
    this._model = config.model;
    this._effectiveWindow = getContextWindow(config.model) - CONTEXT_WINDOW_RESERVED_TOKENS;

    // Update stored API config
    if (config.provider === "openai") {
      this._apiBase = config.baseUrl;
      this._anthropicBaseURL = undefined;
    } else {
      this._apiBase = undefined;
      this._anthropicBaseURL = config.baseUrl;
    }
    this._apiKey = config.apiKey;

    // Rebuild system prompt (fresh context)
    let sysPrompt = buildSystemPrompt();
    if (this._permissionMode === "plan") {
      sysPrompt += "\n\n" + loadPlanModePrompt();
    }

    const backendConfig: BackendConfig = {
      model: this._model,
      systemPrompt: sysPrompt,
      tools: this._tools,
      thinking: false,
      apiKey: config.apiKey,
      baseURL: config.provider === "openai" ? config.baseUrl : undefined,
    };

    const emitText = (text: string) => this.chatRuntime.emitText(text);

    if (config.provider === "openai") {
      this.backend = new OpenAIBackend(backendConfig, this._isSubAgent, emitText);
    } else {
      this.backend = new AnthropicBackend(
        { ...backendConfig, baseURL: config.baseUrl },
        this._isSubAgent,
        emitText,
      );
    }

    // Rebuild compression with new backend
    this.compression = new CompressionPipeline(
      this._effectiveWindow,
      (id) => this.backend.findToolUseById(id),
    );

    // Rebuild runtime with new backend + compression
    this.chatRuntime = new ChatRuntime(
      {
        backend: this.backend,
        compression: this.compression,
        toolExecutor: this.toolExecutor,
        effectiveWindow: this._effectiveWindow,
        maxTurns: undefined,
        isSubAgent: this._isSubAgent,
      },
      this.runtimeState,
    );

    // Rebuild session persistence with new backend
    this.sessionPersistence = new SessionPersistence(
      this._sessionId,
      new Date().toISOString(),
      () => this._model,
      this.backend,
    );

    // Reset token counts for new session
    this.runtimeState.totalInputTokens = 0;
    this.runtimeState.totalOutputTokens = 0;
    this.runtimeState.currentTurns = 0;
  }

  setConfirmFn(fn: (toolName: string, input: Record<string, any>) => Promise<"allow" | "deny">) {
    this.permissionGate.setConfirmFn(fn);
  }

  setAskUserFn(fn: (question: string, options?: string[], allowFreeText?: boolean) => Promise<string>) {
    this._askUserFn = fn;
  }

  getTokenUsage() {
    return { input: this.runtimeState.totalInputTokens, output: this.runtimeState.totalOutputTokens };
  }

  // ─── Chat entry point ─────────────────────────────────────

  async chat(userMessage: string): Promise<void> {
    this.abortController = new AbortController();
    setMaxListeners(100, this.abortController.signal);

    this.backend.addUserMessage(userMessage);

    // Start a new turn for file tracking
    if (!this._isSubAgent) {
      const tracker = getTracker();
      if (tracker) tracker.startTurn();
    }

    try {
      await this.chatRuntime.chatLoop(this.abortController);
    } finally {
      this.abortController = null;
    }

    if (!this._isSubAgent) {
      const tasks = taskStore.list();
      if (tasks.length > 0 && tasks.every((t) => t.status === "completed")) {
        printTaskSummary(tasks);
      }
      printTokenUsage(this.runtimeState.totalInputTokens, this.runtimeState.totalOutputTokens);
      printDivider();
      this.sessionPersistence.autoSave();
    }
  }

  // ─── Sub-agent output capture ─────────────────────────────

  async runOnce(prompt: string): Promise<{ text: string; tokens: { input: number; output: number } }> {
    this.chatRuntime.outputBuffer = [];
    const prevInput = this.runtimeState.totalInputTokens;
    const prevOutput = this.runtimeState.totalOutputTokens;
    await this.chat(prompt);
    const text = this.chatRuntime.outputBuffer!.join("");
    this.chatRuntime.outputBuffer = null;
    return {
      text,
      tokens: {
        input: this.runtimeState.totalInputTokens - prevInput,
        output: this.runtimeState.totalOutputTokens - prevOutput,
      },
    };
  }

  // ─── REPL commands ────────────────────────────────────────

  clearHistory() {
    this.backend.clearMessages();
    this.runtimeState.totalInputTokens = 0;
    this.runtimeState.totalOutputTokens = 0;
    taskStore.clear();
    printInfo("Conversation cleared.");
  }

  async compact() {
    this.backend.runCompression(this.compression, this.runtimeState.totalInputTokens);
    const compactModel = resolveSubAgentModel(BUILTIN_AGENT_TYPES.COMPACT).model;
    await this.backend.compactConversation(compactModel);
    printInfo("Conversation compacted.");
  }

  // ─── Session persistence ──────────────────────────────────

  restoreSession(data: { anthropicMessages?: unknown[]; openaiMessages?: unknown[] }) {
    this.sessionPersistence.restoreSession(data);
  }

  // ─── File Change Tracking ─────────────────────────────────

  getFileChangeTrace(): string | null {
    if (this._isSubAgent) return null;
    const tracker = getTracker();
    return tracker ? tracker.getTurnSummary() : null;
  }

  revertLastTurn(): { success: boolean; reverted: string[]; error?: string } {
    if (this._isSubAgent) {
      return { success: false, reverted: [], error: "Sub-agent cannot revert" };
    }
    const tracker = getTracker();
    if (!tracker) {
      return { success: false, reverted: [], error: "No tracker initialized" };
    }
    return tracker.revertLastTurn();
  }

  // ─── Lifecycle ────────────────────────────────────────────

  destroy(): void {
    if (this.unsubscribeTaskStore) {
      this.unsubscribeTaskStore();
      this.unsubscribeTaskStore = undefined;
    }
    clearTracker();
    if (this._mcpManager && !this._isSubAgent) {
      this._mcpManager.shutdown().catch(() => {});
    }
  }
}
