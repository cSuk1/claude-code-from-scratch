// System prompt builder — loads template and renders with gathered context.
// Delegates context collection to context-sources.ts.

import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { gatherPromptContext, type PromptContext } from "./context-sources.js";

// Re-export context utilities so existing imports still work via this module
export { loadClaudeMd, getGitContext, gatherPromptContext, type PromptContext } from "./context-sources.js";

// ─── Template rendering ─────────────────────────────────────

function getTemplateDir(): string {
  return fileURLToPath(new URL(".", import.meta.url));
}

/** Render a system prompt template with the given context */
export function renderSystemPrompt(template: string, ctx: PromptContext): string {
  return template
    .split("{{cwd}}").join(ctx.cwd)
    .split("{{date}}").join(ctx.date)
    .split("{{platform}}").join(ctx.platform)
    .split("{{shell}}").join(ctx.shell)
    .split("{{git_context}}").join(ctx.gitContext)
    .split("{{claude_md}}").join(ctx.claudeMd)
    .split("{{memory}}").join(ctx.memorySection)
    .split("{{skills}}").join(ctx.skillsSection)
    .split("{{agents}}").join(ctx.agentSection);
}

// ─── Public API (same signature as original prompt.ts) ───────

export function buildSystemPrompt(): string {
  const templateDir = getTemplateDir();
  const template = readFileSync(join(templateDir, "../../templates/system-prompt.md"), "utf-8");
  const ctx = gatherPromptContext();
  return renderSystemPrompt(template, ctx);
}

export function loadPlanModePrompt(): string {
  const templateDir = getTemplateDir();
  return readFileSync(join(templateDir, "../../templates/plan-mode-prompt.md"), "utf-8").trim();
}
