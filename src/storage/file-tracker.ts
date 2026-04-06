// File change tracker - tracks all file modifications by conversation turn
// Supports reverting previous turns

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface FileChange {
  file_path: string;
  operation: "write_file" | "edit_file";
  old_content: string;
  new_content: string;
  old_string: string;
  new_string: string;
  timestamp: number;
  fileExistedBefore: boolean;
}

export interface TurnRecord {
  turnId: number;
  changes: FileChange[];
}

export class FileChangeTracker {
  private turns: TurnRecord[] = [];
  private currentTurnId = 0;
  private sessionFile: string;

  constructor(sessionId: string) {
    this.sessionFile = join(process.cwd(), `.ccmini`, `trace-${sessionId}.json`);
  }

  startTurn(): number {
    this.currentTurnId++;
    return this.currentTurnId;
  }

  recordChange(
    operation: "write_file" | "edit_file",
    file_path: string,
    old_content: string,
    new_content: string,
    old_string: string,
    new_string: string,
    fileExistedBefore: boolean,
  ): void {
    // Find current turn or create it
    let turn = this.turns.find(t => t.turnId === this.currentTurnId);
    if (!turn) {
      turn = { turnId: this.currentTurnId, changes: [] };
      this.turns.push(turn);
    }

    turn.changes.push({
      file_path,
      operation,
      old_content,
      new_content,
      old_string,
      new_string,
      timestamp: Date.now(),
      fileExistedBefore,
    });
  }

  getTurns(): TurnRecord[] {
    return [...this.turns].reverse(); // Most recent first
  }

  getTurnCount(): number {
    return this.currentTurnId;
  }

  revertLastTurn(): { success: boolean; reverted: string[]; error?: string } {
    if (this.currentTurnId === 0) {
      return { success: false, reverted: [], error: "No turns to revert" };
    }

    const turn = this.turns.find(t => t.turnId === this.currentTurnId);
    if (!turn || turn.changes.length === 0) {
      return { success: false, reverted: [], error: "No changes in last turn" };
    }

    const reverted: string[] = [];
    const errors: string[] = [];

    // Revert changes in reverse order (newest first)
    for (const change of turn.changes.reverse()) {
      try {
        if (change.operation === "write_file") {
          if (change.fileExistedBefore) {
            // File existed before, restore original content
            writeFileSync(change.file_path, change.old_content, "utf-8");
            reverted.push(change.file_path);
          } else {
            // File didn't exist before, delete it
            const { unlinkSync } = require("fs");
            unlinkSync(change.file_path);
            reverted.push(change.file_path);
          }
        } else if (change.operation === "edit_file") {
          // Restore from stored original content
          writeFileSync(change.file_path, change.old_content, "utf-8");
          reverted.push(change.file_path);
        }
      } catch (e: any) {
        errors.push(`${change.file_path}: ${e.message}`);
      }
    }

    // Clear the turn's changes after revert
    turn.changes = [];

    // Move back to previous turn
    this.currentTurnId--;

    if (errors.length > 0) {
      return {
        success: reverted.length > 0,
        reverted,
        error: errors.join("; "),
      };
    }

    return { success: true, reverted };
  }

  getTurnSummary(): string {
    if (this.turns.length === 0) {
      return "No file changes recorded.";
    }

    const lines: string[] = [`Total turns: ${this.currentTurnId}`, ""];

    for (const turn of this.turns.slice().reverse()) {
      if (turn.changes.length === 0) continue;
      lines.push(`Turn ${turn.turnId}:`);
      for (const change of turn.changes) {
        const op = change.operation === "write_file" ? "WRITE" : "EDIT";
        lines.push(`  [${op}] ${change.file_path}`);
      }
    }

    return lines.join("\n");
  }

  save(): void {
    const data = JSON.stringify({
      turns: this.turns,
      currentTurnId: this.currentTurnId,
    }, null, 2);

    const dir = join(process.cwd(), ".ccmini");
    const { mkdirSync } = require("fs");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.sessionFile, data, "utf-8");
  }

  load(): boolean {
    if (!existsSync(this.sessionFile)) return false;
    try {
      const data = JSON.parse(readFileSync(this.sessionFile, "utf-8"));
      this.turns = data.turns || [];
      this.currentTurnId = data.currentTurnId || 0;
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    this.turns = [];
    this.currentTurnId = 0;
  }
}

// Singleton instance - will be initialized per session
let tracker: FileChangeTracker | null = null;

export function getFileTracker(sessionId: string): FileChangeTracker {
  if (!tracker) {
    tracker = new FileChangeTracker(sessionId);
    tracker.load();
  }
  return tracker;
}

export function initFileTracker(sessionId: string): FileChangeTracker {
  tracker = new FileChangeTracker(sessionId);
  return tracker;
}

export function clearTracker(): void {
  tracker = null;
}

export function getTracker(): FileChangeTracker | null {
  return tracker;
}