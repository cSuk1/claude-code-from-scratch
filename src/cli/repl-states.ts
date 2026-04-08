/**
 * REPL State Machine — Type Definitions
 *
 * Defines all states, events, and transition result types
 * for the REPL finite state machine.
 */

// ─── States ────────────────────────────────────────────────

/**
 * All valid REPL states.
 *
 * - idle:        Waiting for user input
 * - processing:  Agent is streaming a response
 * - command_exec: Executing a slash command or skill
 * - confirming:  Waiting for user to allow/deny a tool action
 * - asking_user: Waiting for user to answer an ask_user prompt
 * - exit_pending: First Ctrl+C pressed, waiting for second to exit
 * - exited:      Terminal state, process is exiting
 */
export type ReplState =
  | "idle"
  | "processing"
  | "command_exec"
  | "confirming"
  | "asking_user"
  | "exit_pending"
  | "exited";

// ─── Events ────────────────────────────────────────────────

/** Events that can trigger state transitions */
export type ReplEvent =
  | { type: "USER_INPUT"; input: string }
  | { type: "SLASH_COMMAND"; command: string; args: string }
  | { type: "PROCESSING_DONE" }
  | { type: "PROCESSING_ERROR"; error: Error }
  | { type: "CONFIRM_REQUEST"; toolName: string; input: Record<string, any> }
  | { type: "CONFIRM_RESULT"; result: "allow" | "deny" }
  | { type: "ASK_REQUEST"; question: string; options?: string[]; allowFreeText?: boolean }
  | { type: "ASK_RESULT"; answer: string }
  | { type: "SIGINT" }
  | { type: "EXIT_CONFIRM_TIMEOUT" }
  | { type: "EXIT" };

// ─── Transition ────────────────────────────────────────────

/** Result of a state transition */
export interface Transition {
  next: ReplState;
  /** Side-effect to execute upon entering the new state */
  action?: () => void | Promise<void>;
}
