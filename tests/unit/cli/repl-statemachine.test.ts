import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReplStateMachine } from "../../../src/cli/repl-statemachine.js";
import type { ReplState, ReplEvent } from "../../../src/cli/repl-states.js";

describe("ReplStateMachine", () => {
  let sm: ReplStateMachine;

  beforeEach(() => {
    sm = new ReplStateMachine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    sm.clearExitConfirmTimer();
    vi.useRealTimers();
  });

  // ─── Initial state ──────────────────────────────────────

  describe("initial state", () => {
    it("should start in idle state", () => {
      expect(sm.state).toBe("idle");
    });
  });

  // ─── idle transitions ───────────────────────────────────

  describe("idle state transitions", () => {
    it("should stay idle on empty input", () => {
      sm.dispatch({ type: "USER_INPUT", input: "   " });
      expect(sm.state).toBe("idle");
    });

    it("should transition to processing on user input", () => {
      sm.dispatch({ type: "USER_INPUT", input: "hello" });
      expect(sm.state).toBe("processing");
    });

    it("should transition to exited on 'exit'", () => {
      sm.dispatch({ type: "USER_INPUT", input: "exit" });
      expect(sm.state).toBe("exited");
    });

    it("should transition to exited on 'quit'", () => {
      sm.dispatch({ type: "USER_INPUT", input: "quit" });
      expect(sm.state).toBe("exited");
    });

    it("should transition to command_exec on slash command", () => {
      sm.dispatch({ type: "USER_INPUT", input: "/help" });
      // After the automatic SLASH_COMMAND dispatch, should end up in command_exec
      expect(sm.state).toBe("command_exec");
    });

    it("should dispatch SLASH_COMMAND event as side-effect", () => {
      const transitions: [ReplState, ReplState, ReplEvent][] = [];
      sm.onTransition((from, to, event) => transitions.push([from, to, event]));

      sm.dispatch({ type: "USER_INPUT", input: "/model pro gpt-4o" });
      expect(sm.state).toBe("command_exec");

      // The action dispatches SLASH_COMMAND synchronously, which is a no-op
      // transition in command_exec state (no handler for it), so we only see
      // the idle→command_exec transition. Verify the event was recorded.
      expect(transitions.length).toBeGreaterThanOrEqual(1);
      expect(transitions[0][1]).toBe("command_exec");
      expect(transitions[0][2].type).toBe("USER_INPUT");
    });

    it("should transition to exit_pending on SIGINT", () => {
      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("exit_pending");
    });

    it("should ignore PROCESSING_DONE in idle", () => {
      sm.dispatch({ type: "PROCESSING_DONE" });
      expect(sm.state).toBe("idle");
    });

    it("should ignore CONFIRM_REQUEST in idle", () => {
      sm.dispatch({ type: "CONFIRM_REQUEST", toolName: "test", input: {} });
      expect(sm.state).toBe("idle");
    });
  });

  // ─── processing transitions ─────────────────────────────

  describe("processing state transitions", () => {
    beforeEach(() => {
      sm.dispatch({ type: "USER_INPUT", input: "hello" });
      expect(sm.state).toBe("processing");
    });

    it("should transition to idle on PROCESSING_DONE", () => {
      sm.dispatch({ type: "PROCESSING_DONE" });
      expect(sm.state).toBe("idle");
    });

    it("should transition to idle on PROCESSING_ERROR", () => {
      sm.dispatch({ type: "PROCESSING_ERROR", error: new Error("test") });
      expect(sm.state).toBe("idle");
    });

    it("should stay in processing on SIGINT (abort is external)", () => {
      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("processing");
    });

    it("should transition to confirming on CONFIRM_REQUEST", () => {
      sm.dispatch({ type: "CONFIRM_REQUEST", toolName: "run_shell", input: { command: "rm" } });
      expect(sm.state).toBe("confirming");
    });

    it("should transition to asking_user on ASK_REQUEST", () => {
      sm.dispatch({ type: "ASK_REQUEST", question: "What?" });
      expect(sm.state).toBe("asking_user");
    });
  });

  // ─── command_exec transitions ───────────────────────────

  describe("command_exec state transitions", () => {
    beforeEach(() => {
      sm.dispatch({ type: "USER_INPUT", input: "/help" });
      expect(sm.state).toBe("command_exec");
    });

    it("should transition to idle on PROCESSING_DONE", () => {
      sm.dispatch({ type: "PROCESSING_DONE" });
      expect(sm.state).toBe("idle");
    });

    it("should transition to idle on PROCESSING_ERROR", () => {
      sm.dispatch({ type: "PROCESSING_ERROR", error: new Error("fail") });
      expect(sm.state).toBe("idle");
    });

    it("should ignore SIGINT in command_exec", () => {
      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("command_exec");
    });
  });

  // ─── confirming transitions ─────────────────────────────

  describe("confirming state transitions", () => {
    beforeEach(() => {
      sm.dispatch({ type: "USER_INPUT", input: "hello" });
      sm.dispatch({ type: "CONFIRM_REQUEST", toolName: "test", input: {} });
      expect(sm.state).toBe("confirming");
    });

    it("should transition to processing on CONFIRM_RESULT allow", () => {
      sm.dispatch({ type: "CONFIRM_RESULT", result: "allow" });
      expect(sm.state).toBe("processing");
    });

    it("should transition to processing on CONFIRM_RESULT deny", () => {
      sm.dispatch({ type: "CONFIRM_RESULT", result: "deny" });
      expect(sm.state).toBe("processing");
    });

    it("should transition to processing on SIGINT (auto-deny)", () => {
      sm.dispatch({ type: "SIGINT" });
      // SIGINT triggers auto-deny which cascades to CONFIRM_RESULT
      expect(sm.state).toBe("processing");
    });
  });

  // ─── asking_user transitions ────────────────────────────

  describe("asking_user state transitions", () => {
    beforeEach(() => {
      sm.dispatch({ type: "USER_INPUT", input: "hello" });
      sm.dispatch({ type: "ASK_REQUEST", question: "Name?" });
      expect(sm.state).toBe("asking_user");
    });

    it("should transition to processing on ASK_RESULT", () => {
      sm.dispatch({ type: "ASK_RESULT", answer: "Alice" });
      expect(sm.state).toBe("processing");
    });

    it("should transition to processing on SIGINT (auto-empty answer)", () => {
      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("processing");
    });
  });

  // ─── exit_pending transitions ───────────────────────────

  describe("exit_pending state transitions", () => {
    beforeEach(() => {
      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("exit_pending");
    });

    it("should transition to exited on second SIGINT", () => {
      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("exited");
    });

    it("should transition to idle on EXIT_CONFIRM_TIMEOUT", () => {
      sm.dispatch({ type: "EXIT_CONFIRM_TIMEOUT" });
      expect(sm.state).toBe("idle");
    });

    it("should transition to idle on new USER_INPUT", () => {
      sm.dispatch({ type: "USER_INPUT", input: "hello" });
      expect(sm.state).toBe("idle");
    });
  });

  // ─── exited state ───────────────────────────────────────

  describe("exited state", () => {
    beforeEach(() => {
      sm.dispatch({ type: "USER_INPUT", input: "exit" });
      expect(sm.state).toBe("exited");
    });

    it("should ignore all events in exited state", () => {
      sm.dispatch({ type: "USER_INPUT", input: "hello" });
      expect(sm.state).toBe("exited");
      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("exited");
    });
  });

  // ─── Transition observer ────────────────────────────────

  describe("onTransition observer", () => {
    it("should notify listeners on state change", () => {
      const log: string[] = [];
      sm.onTransition((from, to) => log.push(`${from}→${to}`));

      sm.dispatch({ type: "USER_INPUT", input: "hi" });
      expect(log).toContain("idle→processing");
    });

    it("should not notify on illegal transitions", () => {
      const log: string[] = [];
      sm.onTransition((from, to) => log.push(`${from}→${to}`));

      // CONFIRM_RESULT is illegal in idle
      sm.dispatch({ type: "CONFIRM_RESULT", result: "allow" });
      expect(log).toHaveLength(0);
    });

    it("should support unsubscribing", () => {
      const log: string[] = [];
      const unsub = sm.onTransition((from, to) => log.push(`${from}→${to}`));

      unsub();
      sm.dispatch({ type: "USER_INPUT", input: "hi" });
      expect(log).toHaveLength(0);
    });
  });

  // ─── Exit confirm timer ─────────────────────────────────

  describe("exit confirm timer", () => {
    it("should dispatch EXIT_CONFIRM_TIMEOUT after timeout", () => {
      const log: string[] = [];
      sm.onTransition((from, to) => log.push(`${from}→${to}`));

      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("exit_pending");

      sm.startExitConfirmTimer(2000);
      vi.advanceTimersByTime(2000);

      expect(sm.state).toBe("idle");
      expect(log).toContain("exit_pending→idle");
    });

    it("should clear timer when returning to idle", () => {
      sm.dispatch({ type: "SIGINT" });
      sm.startExitConfirmTimer(2000);

      sm.clearExitConfirmTimer();
      vi.advanceTimersByTime(3000);

      // Timer was cleared, should still be in exit_pending
      expect(sm.state).toBe("exit_pending");
    });
  });

  // ─── Full flow: chat with confirm ───────────────────────

  describe("full flow: chat → confirm → continue", () => {
    it("should handle a complete confirm flow", () => {
      // idle → processing
      sm.dispatch({ type: "USER_INPUT", input: "delete file" });
      expect(sm.state).toBe("processing");

      // processing → confirming
      sm.dispatch({ type: "CONFIRM_REQUEST", toolName: "write_file", input: { file_path: "/tmp/x" } });
      expect(sm.state).toBe("confirming");

      // confirming → processing (allow)
      sm.dispatch({ type: "CONFIRM_RESULT", result: "allow" });
      expect(sm.state).toBe("processing");

      // processing → idle
      sm.dispatch({ type: "PROCESSING_DONE" });
      expect(sm.state).toBe("idle");
    });
  });

  // ─── Full flow: double SIGINT to exit ───────────────────

  describe("full flow: double SIGINT to exit", () => {
    it("should exit on two consecutive SIGINTs in idle", () => {
      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("exit_pending");

      sm.dispatch({ type: "SIGINT" });
      expect(sm.state).toBe("exited");
    });
  });
});
