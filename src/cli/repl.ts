import * as readline from "readline";
import chalk from "chalk";
import { Agent } from "../core/agent.js";
import { printWelcome, printError, printInfo, showMenu, showQuestion, showFreeTextInput, gradientText } from "../ui/index.js";
import { discoverSkills, resolveSkillPrompt, getSkillByName, executeSkill } from "../extensions/skills.js";
import { CommandRegistry, registerBuiltinCommands } from "./commands.js";
import { generatePermissionRule, savePermissionRule } from "../tools/tools.js";
import { ReplStateMachine } from "./repl-statemachine.js";
import type { ReplState, ReplEvent } from "./repl-states.js";

// The prompt string — must match what readline knows about so cursor math works.
const PROMPT = "\n" + gradientText("❯ ", "#7dd3fc", "#c4b5fd");

export async function runRepl(agent: Agent) {
  // ─── Build command registry ─────────────────────────────────
  const registry = new CommandRegistry();
  registerBuiltinCommands(registry);

  // ─── State machine ──────────────────────────────────────────
  const sm = new ReplStateMachine();

  // ─── Tab-completion: slash commands + skills ────────────────
  const completer = (line: string): [string[], string] => {
    if (!line.startsWith("/")) {
      return [[], line];
    }

    const prefix = line.slice(1);

    const cmdHits = registry.getCompletions(prefix).map((c) => ({
      value: `/${c.name}`,
      display: `/${c.name}`.padEnd(16) + `  ${c.description}`,
    }));

    const skills = discoverSkills().filter(
      (s) => s.userInvocable && s.name.startsWith(prefix)
    );
    const skillHits = skills.map((s) => ({
      value: `/${s.name}`,
      display: `/${s.name}`.padEnd(16) + `  ${s.description}`,
    }));

    const allHits = [...cmdHits, ...skillHits];

    if (allHits.length === 0) {
      return [[], line];
    }

    if (allHits.length === 1) {
      return [[allHits[0].value + " "], line];
    }

    return [allHits.map((h) => h.display), line];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
  });

  rl.setPrompt(PROMPT);

  // ─── Pending result resolvers ───────────────────────────────
  // When Agent calls confirmFn/askUserFn, we create a Promise and
  // store its resolver. The state transition handler for confirming/
  // asking_user will resolve it when the user provides an answer.
  let pendingConfirmResolve: ((value: "allow" | "deny") => void) | null = null;
  let pendingAskResolve: ((value: string) => void) | null = null;

  // ─── Agent callback: confirmFn ──────────────────────────────
  agent.setConfirmFn(async (toolName: string, input: Record<string, any>) => {
    // Create a Promise that will be resolved when the user answers
    const promise = new Promise<"allow" | "deny">((resolve) => {
      pendingConfirmResolve = resolve;
    });
    sm.dispatch({ type: "CONFIRM_REQUEST", toolName, input });
    return promise;
  });

  // ─── Agent callback: askUserFn ──────────────────────────────
  agent.setAskUserFn(async (question: string, options?: string[], allowFreeText?: boolean) => {
    const promise = new Promise<string>((resolve) => {
      pendingAskResolve = resolve;
    });
    sm.dispatch({ type: "ASK_REQUEST", question, options, allowFreeText });
    return promise;
  });

  // ─── State transition → I/O behavior mapping ────────────────
  sm.onTransition((from, to, event) => {
    // ── Enter idle: restore prompt ───────────────────────────
    if (to === "idle") {
      sm.clearExitConfirmTimer();
      rl.resume();
      rl.prompt();
    }

    // ── Enter processing: start agent.chat() ─────────────────
    if (to === "processing" && event.type === "USER_INPUT") {
      const input = event.input.trim();
      rl.pause();
      agent
        .chat(input)
        .then(() => sm.dispatch({ type: "PROCESSING_DONE" }))
        .catch((e: any) => {
          if (e.name !== "AbortError" && !e.message?.includes("aborted")) {
            printError(e.message);
          }
          sm.dispatch({ type: "PROCESSING_ERROR", error: e });
        });
    }

    // ── Enter command_exec: execute slash command ─────────────
    if (to === "command_exec" && event.type === "SLASH_COMMAND") {
      const { command, args } = event as Extract<ReplEvent, { type: "SLASH_COMMAND" }>;
      handleSlashCommand(agent, registry, command, args)
        .then(() => sm.dispatch({ type: "PROCESSING_DONE" }))
        .catch(() => sm.dispatch({ type: "PROCESSING_ERROR", error: new Error("Command failed") }));
    }

    // ── Enter confirming: show permission menu ───────────────
    if (to === "confirming") {
      const { toolName, input } = event as Extract<ReplEvent, { type: "CONFIRM_REQUEST" }>;
      rl.pause();
      showConfirmMenu(toolName, input).then((result) => {
        // Resolve the pending promise from confirmFn
        if (pendingConfirmResolve) {
          pendingConfirmResolve(result);
          pendingConfirmResolve = null;
        }
        sm.dispatch({ type: "CONFIRM_RESULT", result });
      });
    }

    // ── Enter asking_user: show question UI ──────────────────
    if (to === "asking_user") {
      const { question, options, allowFreeText } = event as Extract<ReplEvent, { type: "ASK_REQUEST" }>;
      rl.pause();
      showAskUI(question, options, allowFreeText).then((answer) => {
        // Resolve the pending promise from askUserFn
        if (pendingAskResolve) {
          pendingAskResolve(answer);
          pendingAskResolve = null;
        }
        sm.dispatch({ type: "ASK_RESULT", answer });
      });
    }

    // ── Enter exit_pending: show hint + start timer ──────────
    if (to === "exit_pending") {
      console.log("\n  Press Ctrl+C again to exit.");
      sm.startExitConfirmTimer(2000);
    }

    // ── Enter exited: cleanup and exit ───────────────────────
    if (to === "exited") {
      agent.destroy();
      console.log("\nBye!\n");
      rl.close();
      process.exit(0);
    }
  });

  // ─── SIGINT handler ─────────────────────────────────────────
  process.on("SIGINT", () => {
    if (sm.state === "processing") {
      agent.abort();
      console.log("\n  (interrupted)");
      // chat() promise will resolve and dispatch PROCESSING_DONE
    } else if (sm.state === "confirming") {
      // Deny on Ctrl+C during confirmation
      if (pendingConfirmResolve) {
        pendingConfirmResolve("deny");
        pendingConfirmResolve = null;
      }
      sm.dispatch({ type: "SIGINT" });
    } else if (sm.state === "asking_user") {
      // Return empty on Ctrl+C during ask
      if (pendingAskResolve) {
        pendingAskResolve("");
        pendingAskResolve = null;
      }
      sm.dispatch({ type: "SIGINT" });
    } else {
      sm.dispatch({ type: "SIGINT" });
    }
  });

  // ─── Readline event → state machine event ──────────────────
  rl.on("line", (line) => {
    sm.dispatch({ type: "USER_INPUT", input: line });
  });

  printWelcome(agent.model);
  rl.prompt();
}

// ─── Helper: slash command dispatch ──────────────────────────

async function handleSlashCommand(
  agent: Agent,
  registry: CommandRegistry,
  command: string,
  args: string
): Promise<void> {
  // 1. Check built-in commands
  const cmd = registry.get(command);
  if (cmd) {
    await cmd.handler(agent, args);
    return;
  }

  // 2. Check user-invocable skills
  const skill = getSkillByName(command);
  if (skill && skill.userInvocable) {
    printInfo(`Invoking skill: ${skill.name}`);
    try {
      if (skill.context === "fork") {
        const forkResult = executeSkill(skill.name, args);
        if (forkResult) {
          await agent.chat(
            `Use the skill tool to invoke "${skill.name}" with args: ${args || "(none)"}`
          );
        }
      } else {
        const resolved = resolveSkillPrompt(skill, args);
        await agent.chat(resolved);
      }
    } catch (e: any) {
      if (e.name !== "AbortError" && !e.message?.includes("aborted")) {
        printError(e.message);
      }
    }
    return;
  }

  // Unknown command
  printInfo(`Unknown command: /${command}`);
}

// ─── Helper: permission confirm menu ────────────────────────

async function showConfirmMenu(
  toolName: string,
  input: Record<string, any>
): Promise<"allow" | "deny"> {
  const options = [
    { label: "Allow (this time only)", value: "allow" },
    { label: "Allow, and remember for this project", value: "allow-remember" },
    { label: "Deny (this time only)", value: "deny" },
    { label: "Deny, and always deny for this project", value: "deny-remember" },
  ];

  const choice = await showMenu("Allow this action? [↑/↓ + Enter]", options);

  if (choice === "allow-remember") {
    const rule = generatePermissionRule(toolName, input);
    savePermissionRule(rule, "allow");
    printInfo(`Allowed & remembered: ${rule}`);
    return "allow";
  }

  if (choice === "deny-remember") {
    const rule = generatePermissionRule(toolName, input);
    savePermissionRule(rule, "deny");
    printInfo(`Denied & remembered: ${rule}`);
    return "deny";
  }

  // null (Ctrl+C / Escape) or "deny"
  return choice === "allow" ? "allow" : "deny";
}

// ─── Helper: ask user UI ────────────────────────────────────
// Note: the question has already been rendered by the Assistant's
// streaming output, so we use a compact label here to avoid duplication.
async function showAskUI(
  question: string,
  options?: string[],
  allowFreeText?: boolean
): Promise<string> {
  if (options && options.length > 0) {
    return await showQuestion(`Select your answer [↑/↓ + Enter]`, options, allowFreeText);
  } else {
    return await showFreeTextInput("Your answer");
  }
}
