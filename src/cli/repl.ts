import * as readline from "readline";
import chalk from "chalk";
import { Agent } from "../core/agent.js";
import { printWelcome, printError, printInfo } from "../ui/ui.js";
import { discoverSkills, resolveSkillPrompt, getSkillByName, executeSkill } from "../extensions/skills.js";
import { CommandRegistry, registerBuiltinCommands } from "./commands.js";

// The prompt string — must match what readline knows about so cursor math works.
const PROMPT = "\n" + chalk.bold.cyan("> ");

export async function runRepl(agent: Agent) {
  // ─── Build command registry ─────────────────────────────────
  const registry = new CommandRegistry();
  registerBuiltinCommands(registry);

  // ─── Tab-completion: slash commands + skills ────────────────
  const completer = (line: string): [string[], string] => {
    // Only complete when input starts with "/"
    if (!line.startsWith("/")) {
      return [[], line];
    }

    const prefix = line.slice(1); // strip leading "/"

    // Gather built-in command completions
    const cmdHits = registry.getCompletions(prefix).map((c) => ({
      value: `/${c.name}`,
      display: `/${c.name}`.padEnd(16) + `  ${c.description}`,
    }));

    // Gather skill completions
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

    // Single match → auto-complete with trailing space
    if (allHits.length === 1) {
      return [[allHits[0].value + " "], line];
    }

    // Multiple matches → return display strings for readline to show as a
    // list, plus the values so readline can find common prefix for
    // partial completion.  We return display strings — readline prints them
    // and then redraws the prompt + current input automatically.
    return [allHits.map((h) => h.display), line];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
  });

  // Tell readline what our prompt is so it can correctly calculate cursor
  // position after tab-completion and Ctrl+C redraws.
  rl.setPrompt(PROMPT);

  // Provide confirmFn that reuses this readline instance
  agent.setConfirmFn((_message: string) => {
    return new Promise((resolve) => {
      rl.question("  Allow? (y/n): ", (answer) => {
        resolve(answer.toLowerCase().startsWith("y"));
      });
    });
  });

  // Ctrl+C handling
  let sigintCount = 0;
  process.on("SIGINT", () => {
    if (agent.isProcessing) {
      agent.abort();
      console.log("\n  (interrupted)");
      sigintCount = 0;
      rl.prompt();
    } else {
      sigintCount++;
      if (sigintCount >= 2) {
        console.log("\nBye!\n");
        process.exit(0);
      }
      console.log("\n  Press Ctrl+C again to exit.");
      rl.prompt();
    }
  });

  printWelcome(agent.model);

  // Use readline's native prompt + "line" event so that the prompt string
  // is always known to readline.  This is essential for tab-completion
  // redraws to work correctly.
  rl.on("line", async (line) => {
    const input = line.trim();
    sigintCount = 0;

    if (!input) {
      rl.prompt();
      return;
    }
    if (input === "exit" || input === "quit") {
      console.log("\nBye!\n");
      rl.close();
      process.exit(0);
    }

    // ─── Slash command dispatch ───────────────────────────────
    if (input.startsWith("/")) {
      const spaceIdx = input.indexOf(" ");
      const cmdName = spaceIdx > 0 ? input.slice(1, spaceIdx) : input.slice(1);
      const cmdArgs = spaceIdx > 0 ? input.slice(spaceIdx + 1) : "";

      // 1. Check built-in commands from the registry
      const command = registry.get(cmdName);
      if (command) {
        await command.handler(agent, cmdArgs);
        rl.prompt();
        return;
      }

      // 2. Check user-invocable skills
      const skill = getSkillByName(cmdName);
      if (skill && skill.userInvocable) {
        printInfo(`Invoking skill: ${skill.name}`);
        try {
          if (skill.context === "fork") {
            const forkResult = executeSkill(skill.name, cmdArgs);
            if (forkResult) {
              await agent.chat(
                `Use the skill tool to invoke "${skill.name}" with args: ${cmdArgs || "(none)"}`
              );
            }
          } else {
            const resolved = resolveSkillPrompt(skill, cmdArgs);
            await agent.chat(resolved);
          }
        } catch (e: any) {
          if (e.name !== "AbortError" && !e.message?.includes("aborted")) {
            printError(e.message);
          }
        }
        rl.prompt();
        return;
      }

      // Unknown slash command — fall through to regular chat
    }

    // ─── Regular chat ─────────────────────────────────────────
    try {
      await agent.chat(input);
    } catch (e: any) {
      if (e.name === "AbortError" || e.message?.includes("aborted")) {
        // Already handled by SIGINT handler
      } else {
        printError(e.message);
      }
    }

    rl.prompt();
  });

  // Kick off the first prompt
  rl.prompt();
}
