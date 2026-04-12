// Tool executor — dispatches tool calls, records file changes, handles ask_user.
// Extracted from Agent to isolate tool execution from the chat loop.

import { executeTool, checkPermission, isParallelSafe, isIdempotent, type PermissionMode } from "../../tools/tools.js";
import { existsSync, readFileSync } from "fs";
import { getTracker } from "../../storage/file-tracker.js";
import { toolStrategies } from "./strategies.js";
import {
  printToolCall,
  printToolResult,
  printInfo,
  showQuestion,
  showFreeTextInput,
  stopSpinner,
} from "../../ui/index.js";
import type { ToolResultEntry } from "../../backend/index.js";
import type { MCPClientManager } from "../../mcp/index.js";
import type { PermissionGate } from "./permission-gate.js";

// ─── Types ──────────────────────────────────────────────────

/** Minimal Agent surface needed by tool executor (avoids circular dep) */
export interface ToolExecutorHost {
  readonly isSubAgent: boolean;
  readonly permissionMode: PermissionMode;
  readonly mcpManager?: MCPClientManager;
  readonly toolDefs: import("../../tools/tools.js").ToolDef[];
  readonly apiBaseConfig?: string;
  readonly apiKeyConfig?: string;
  readonly anthropicBaseURLConfig?: string;
  readonly askUserFn?: (question: string, options?: string[], allowFreeText?: boolean) => Promise<string>;
  addTokenUsage(input: number, output: number): void;
  hideSpinner(): void;
}

// ─── Tool Executor ──────────────────────────────────────────

export class ToolExecutor {
  constructor(
    private host: ToolExecutorHost,
    private permissionGate: PermissionGate,
  ) {}

  /** Check if a tool call can be executed in parallel during streaming */
  canParallelExecute(name: string): boolean {
    return isParallelSafe(name) && isIdempotent(name);
  }

  /** Execute a single tool call with permission checks and file tracking */
  async execute(
    name: string,
    toolCallId: string,
    args: string,
    printResults = true,
  ): Promise<ToolResultEntry | null> {
    let input: Record<string, any>;
    try {
      input = JSON.parse(args);
    } catch {
      input = {};
    }

    if (printResults) printToolCall(name, input);

    // Permission check
    const perm = checkPermission(name, input, this.host.permissionMode);
    if (perm.action === "deny") {
      if (printResults) printInfo(`Denied: ${perm.message}`);
      return { toolCallId, content: `Action denied: ${perm.message}` };
    }
    if (perm.action === "confirm" && perm.message) {
      const allowed = await this.permissionGate.confirm(name, input, perm.message);
      if (!allowed) {
        return { toolCallId, content: "User denied this action." };
      }
    }

    // Pre-execution file snapshot
    let originalContent: string | null = null;
    let fileExistedBefore = false;
    const needTrack = !this.host.isSubAgent && (name === "write_file" || name === "edit_file");

    if (needTrack) {
      fileExistedBefore = existsSync(input.file_path);
      originalContent = fileExistedBefore ? readFileSync(input.file_path, "utf-8") : "";
    }

    // Dispatch
    const result = await this.dispatch(name, input);

    // Post-execution file tracking
    if (needTrack) {
      const isSuccess = !result.startsWith("Error");
      if (isSuccess) {
        const tracker = getTracker();
        if (tracker) {
          const newContent = existsSync(input.file_path)
            ? readFileSync(input.file_path, "utf-8")
            : "";
          tracker.recordChange(
            name as "write_file" | "edit_file",
            input.file_path,
            originalContent || "",
            newContent,
            input.old_string || "",
            input.new_string || "",
            fileExistedBefore,
          );
        }
      }
    }

    if (printResults) printToolResult(name, result);
    return { toolCallId, content: result };
  }

  // ─── Internal dispatch ────────────────────────────────────

  private async dispatch(name: string, input: Record<string, any>): Promise<string> {
    // Strategy pattern for agent and skill tools
    if (toolStrategies.has(name)) {
      const strategy = toolStrategies.get(name)!;
      // Strategy needs the full Agent — pass host which implements the same interface
      return strategy.execute(this.host as any, input);
    }
    if (name === "ask_user") return this.executeAskUser(input);
    // MCP tools
    if (this.host.mcpManager?.isMCPTool(name)) {
      const result = await this.host.mcpManager.executeTool(name, input);
      return result || `Error: MCP tool "${name}" returned no result`;
    }
    return executeTool(name, input);
  }

  private async executeAskUser(input: Record<string, any>): Promise<string> {
    const question = input.question || "No question provided";
    const options = Array.isArray(input.options) ? input.options as string[] : undefined;
    const allowFreeText = !!input.allow_free_text;

    if (this.host.isSubAgent) {
      return "Error: ask_user is not available in sub-agent context.";
    }

    this.host.hideSpinner();

    try {
      if (this.host.askUserFn) {
        const answer = await this.host.askUserFn(question, options, allowFreeText);
        return `User's answer: ${answer}`;
      }
      if (options && options.length > 0) {
        const answer = await showQuestion(question, options, allowFreeText);
        return `User's answer: ${answer}`;
      } else {
        const answer = await showFreeTextInput(question);
        return `User's answer: ${answer}`;
      }
    } catch (e: any) {
      return `Error asking user: ${e.message}`;
    }
  }
}
