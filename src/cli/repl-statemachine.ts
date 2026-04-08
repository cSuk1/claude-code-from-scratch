/**
 * REPL State Machine — Core Logic
 *
 * A finite state machine that governs REPL behavior.
 * All state transitions are explicit and centralized here,
 * making the REPL's control flow easy to understand, test, and extend.
 */

import { ReplState, ReplEvent, Transition } from "./repl-states.js";

export class ReplStateMachine {
  private _state: ReplState = "idle";
  private _exitConfirmTimer: ReturnType<typeof setTimeout> | null = null;

  /** Listeners notified on every state transition */
  private listeners = new Set<(from: ReplState, to: ReplState, event: ReplEvent) => void>();

  get state(): ReplState {
    return this._state;
  }

  // ─── Observer ─────────────────────────────────────────────

  /** Subscribe to state transitions. Returns an unsubscribe function. */
  onTransition(fn: (from: ReplState, to: ReplState, event: ReplEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ─── Core Dispatch ────────────────────────────────────────

  /**
   * Receive an event and attempt a state transition.
   * If the transition is valid, updates state, notifies listeners,
   * and executes any side-effect action.
   */
  dispatch(event: ReplEvent): void {
    const prev = this._state;
    const transition = this.resolveTransition(prev, event);
    if (!transition) return; // illegal transition — silently ignore

    this._state = transition.next;

    for (const fn of this.listeners) {
      fn(prev, transition.next, event);
    }

    if (transition.action) {
      const result = transition.action();
      if (result instanceof Promise) result.catch(console.error);
    }
  }

  // ─── Transition Table ─────────────────────────────────────

  private resolveTransition(state: ReplState, event: ReplEvent): Transition | null {
    if (state === "exited") return null;

    switch (state) {
      case "idle":
        return this.fromIdle(event);
      case "processing":
        return this.fromProcessing(event);
      case "command_exec":
        return this.fromCommandExec(event);
      case "confirming":
        return this.fromConfirming(event);
      case "asking_user":
        return this.fromAskingUser(event);
      case "exit_pending":
        return this.fromExitPending(event);
      default:
        return null;
    }
  }

  // ── idle ──────────────────────────────────────────────────

  private fromIdle(event: ReplEvent): Transition | null {
    switch (event.type) {
      case "USER_INPUT": {
        const input = event.input.trim();
        if (!input) return { next: "idle" };
        if (input === "exit" || input === "quit") return { next: "exited" };
        if (input.startsWith("/")) {
          const spaceIdx = input.indexOf(" ");
          const command = spaceIdx > 0 ? input.slice(1, spaceIdx) : input.slice(1);
          const args = spaceIdx > 0 ? input.slice(spaceIdx + 1) : "";
          return {
            next: "command_exec",
            action: () => this.dispatch({ type: "SLASH_COMMAND", command, args }),
          };
        }
        return { next: "processing" };
      }
      case "SIGINT":
        return { next: "exit_pending" };
      default:
        return null;
    }
  }

  // ── processing ────────────────────────────────────────────

  private fromProcessing(event: ReplEvent): Transition | null {
    switch (event.type) {
      case "PROCESSING_DONE":
        return { next: "idle" };
      case "PROCESSING_ERROR":
        return { next: "idle" };
      case "SIGINT":
        // Agent abort is handled externally; chat() will resolve
        return { next: "processing" };
      case "CONFIRM_REQUEST":
        return { next: "confirming" };
      case "ASK_REQUEST":
        return { next: "asking_user" };
      default:
        return null;
    }
  }

  // ── command_exec ──────────────────────────────────────────

  private fromCommandExec(event: ReplEvent): Transition | null {
    switch (event.type) {
      case "PROCESSING_DONE":
      case "PROCESSING_ERROR":
        return { next: "idle" };
      default:
        return null;
    }
  }

  // ── confirming ────────────────────────────────────────────

  private fromConfirming(event: ReplEvent): Transition | null {
    switch (event.type) {
      case "CONFIRM_RESULT":
        return { next: "processing" };
      case "SIGINT":
        return {
          next: "processing",
          action: () => this.dispatch({ type: "CONFIRM_RESULT", result: "deny" }),
        };
      default:
        return null;
    }
  }

  // ── asking_user ───────────────────────────────────────────

  private fromAskingUser(event: ReplEvent): Transition | null {
    switch (event.type) {
      case "ASK_RESULT":
        return { next: "processing" };
      case "SIGINT":
        return {
          next: "processing",
          action: () => this.dispatch({ type: "ASK_RESULT", answer: "" }),
        };
      default:
        return null;
    }
  }

  // ── exit_pending ──────────────────────────────────────────

  private fromExitPending(event: ReplEvent): Transition | null {
    switch (event.type) {
      case "SIGINT":
        return { next: "exited" };
      case "EXIT_CONFIRM_TIMEOUT":
        return { next: "idle" };
      case "USER_INPUT":
        return { next: "idle" };
      default:
        return null;
    }
  }

  // ─── Exit Confirm Timer ───────────────────────────────────

  startExitConfirmTimer(ms = 2000): void {
    this._exitConfirmTimer = setTimeout(() => {
      this._exitConfirmTimer = null;
      this.dispatch({ type: "EXIT_CONFIRM_TIMEOUT" });
    }, ms);
  }

  clearExitConfirmTimer(): void {
    if (this._exitConfirmTimer) {
      clearTimeout(this._exitConfirmTimer);
      this._exitConfirmTimer = null;
    }
  }
}
