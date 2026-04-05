#!/usr/bin/env node

import { Agent } from "./core/agent.js";
import { printError, printInfo } from "./ui/index.js";
import { loadSession, getLatestSessionId } from "./storage/session.js";
import { parseArgs } from "./cli/args.js";
import { resolveApiConfig } from "./cli/config.js";
import { runRepl } from "./cli/repl.js";
import { initModelTiers } from "./core/model-tiers.js";
import { runConnectFlow } from "./cli/commands.js";

async function main() {
  const args = parseArgs();

  if (args.connect) {
    await runConnectFlow();
    process.exit(0);
  }

  const { permissionMode, model, prompt, resume, thinking, maxTurns } = args;
  const { apiBase, apiKey, useOpenAI } = resolveApiConfig(args);

  initModelTiers();

  const agent = new Agent({
    permissionMode, model, thinking, maxTurns,
    apiBase: useOpenAI ? apiBase : undefined,
    anthropicBaseURL: !useOpenAI ? apiBase : undefined,
    apiKey,
  });

  if (resume) {
    const sessionId = getLatestSessionId();
    if (sessionId) {
      const session = loadSession(sessionId);
      if (session) {
        agent.restoreSession({
          anthropicMessages: session.anthropicMessages,
          openaiMessages: session.openaiMessages,
        });
      } else {
        printInfo("No session found to resume.");
      }
    } else {
      printInfo("No previous sessions found.");
    }
  }

  if (prompt) {
    try {
      await agent.chat(prompt);
    } catch (e: any) {
      printError(e.message);
      process.exit(1);
    }
  } else {
    await runRepl(agent);
  }
}

main().catch((e) => {
  printError(e.message);
  process.exit(1);
});
