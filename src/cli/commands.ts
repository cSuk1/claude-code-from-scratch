import { Agent } from "../core/agent.js";
import { printInfo, printError } from "../ui/ui.js";
import { listMemories } from "../storage/memory.js";
import { discoverSkills } from "../extensions/skills.js";

// ─── Slash Command Interface ────────────────────────────────

export interface SlashCommand {
  /** Command name without the leading slash, e.g. "clear" */
  name: string;
  /** Short description shown in /help and completion dropdown */
  description: string;
  /** Usage string shown in /help, e.g. "/model [name]" */
  usage: string;
  /** Whether this command accepts arguments */
  hasArgs?: boolean;
  /** Handler — receives the Agent and any text after the command name */
  handler: (agent: Agent, args: string) => Promise<void> | void;
}

// ─── Command Registry ───────────────────────────────────────

export class CommandRegistry {
  private commands = new Map<string, SlashCommand>();

  /** Register a slash command */
  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd);
  }

  /** Look up a command by name */
  get(name: string): SlashCommand | undefined {
    return this.commands.get(name);
  }

  /** Return all registered commands (insertion order) */
  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Return commands whose name starts with the given prefix.
   * Used for tab-completion.
   */
  getCompletions(prefix: string): SlashCommand[] {
    const lower = prefix.toLowerCase();
    return this.getAll().filter((c) => c.name.startsWith(lower));
  }
}

// ─── Built-in Commands ──────────────────────────────────────

export function registerBuiltinCommands(registry: CommandRegistry): void {
  registry.register({
    name: "help",
    description: "Show all available commands",
    usage: "/help",
    handler: (_agent, _args) => {
      const all = registry.getAll();
      const maxUsage = Math.max(...all.map((c) => c.usage.length));
      console.log("");
      console.log("  Available commands:\n");
      for (const cmd of all) {
        const padded = cmd.usage.padEnd(maxUsage + 2);
        console.log(`    ${padded} ${cmd.description}`);
      }
      console.log("");
    },
  });

  registry.register({
    name: "clear",
    description: "Clear conversation history",
    usage: "/clear",
    handler: (agent, _args) => {
      agent.clearHistory();
    },
  });

  registry.register({
    name: "cost",
    description: "Show token usage and cost",
    usage: "/cost",
    handler: (agent, _args) => {
      agent.showCost();
    },
  });

  registry.register({
    name: "compact",
    description: "Manually compact conversation",
    usage: "/compact",
    handler: async (agent, _args) => {
      try {
        await agent.compact();
      } catch (e: any) {
        printError(e.message);
      }
    },
  });

  registry.register({
    name: "model",
    description: "Show current model or switch to a new one",
    usage: "/model [name]",
    hasArgs: true,
    handler: (agent, args) => {
      const newModel = args.trim();
      if (!newModel) {
        printInfo(`Current model: ${agent.model}`);
      } else {
        const result = agent.switchModel(newModel);
        printInfo(`Switched to model: ${result.model}`);
        if (!result.known) {
          printInfo(
            `Warning: "${result.model}" is not a recognized model. Make sure the model name is correct and your API backend supports it.`
          );
        }
      }
    },
  });

  registry.register({
    name: "memory",
    description: "List saved memories",
    usage: "/memory",
    handler: (_agent, _args) => {
      const memories = listMemories();
      if (memories.length === 0) {
        printInfo("No memories saved yet.");
      } else {
        printInfo(`${memories.length} memories:`);
        for (const m of memories) {
          console.log(`    [${m.type}] ${m.name} — ${m.description}`);
        }
      }
    },
  });

  registry.register({
    name: "skills",
    description: "List available skills",
    usage: "/skills",
    handler: (_agent, _args) => {
      const skills = discoverSkills();
      if (skills.length === 0) {
        printInfo(
          "No skills found. Add skills to .claude/skills/<name>/SKILL.md"
        );
      } else {
        printInfo(`${skills.length} skills:`);
        for (const s of skills) {
          const tag = s.userInvocable ? `/${s.name}` : s.name;
          console.log(`    ${tag} (${s.source}) — ${s.description}`);
        }
      }
    },
  });
}
