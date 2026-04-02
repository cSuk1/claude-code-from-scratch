# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # tsc + copy system-prompt.md template to dist/
npm run dev            # build + run CLI interactively
npm start              # run compiled dist/cli.js
node dist/cli.js --help
```

No test framework is configured yet. Validate changes with `npx tsc --noEmit`.

## Environment Variables

- `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` — Anthropic backend
- `OPENAI_API_KEY` + `OPENAI_BASE_URL` — OpenAI-compatible backend
- `MINI_CLAUDE_MODEL` — override default model (claude-opus-4-6)

## Architecture

This is a ~3000-line TypeScript CLI agent that mirrors Claude Code's core architecture. ESM modules, strict mode, target ES2022.

### Entry Flow

`src/cli.ts` → `parseArgs()` → `resolveApiConfig()` → create `Agent` → one-shot `agent.chat(prompt)` or `runRepl(agent)`.

### Key Modules

- **`src/core/agent.ts`** (~1065 lines) — Heart of the system. The `Agent` class orchestrates the chat loop, tool execution, token tracking, context compression, and sub-agent forking. Maintains **separate message histories** for Anthropic (`anthropicMessages`) and OpenAI (`openaiMessages`) formats. Routes via `useOpenAI` flag.
- **`src/core/prompt.ts`** — Builds the system prompt by rendering `src/templates/system-prompt.md` with dynamic sections: git context, CLAUDE.md content, memory index, discovered skills/agents.
- **`src/tools/tools.ts`** (~668 lines) — Defines 7 built-in tools (read_file, write_file, edit_file, list_files, grep_search, run_shell, skill) plus agent/skill meta-tools. Tools are defined in Anthropic format and converted to OpenAI format on-the-fly via `toOpenAITools()`.
- **`src/cli/`** — CLI layer split into `args.ts` (argument parsing), `config.ts` (API key/base resolution), `repl.ts` (interactive REPL with /commands and SIGINT handling).
- **`src/extensions/subagent.ts`** — Three built-in sub-agent types (explore, plan, general) with filtered tool sets. Custom agents loaded from `.claude/agents/*.md` with YAML frontmatter.
- **`src/extensions/skills.ts`** — Discovers skills from `.claude/skills/<name>/SKILL.md`. Two execution modes: `inline` (prompt injection) and `fork` (sub-agent).
- **`src/storage/session.ts`** — Session persistence to `~/.mini-claude/sessions/`. Auto-saves after each turn.
- **`src/storage/memory.ts`** — Per-project memory files in `~/.mini-claude/projects/<hash>/memory/`. Four types: user, feedback, project, reference. Builds a `MEMORY.md` index for system prompt injection.

### Context Compression Pipeline

Agent runs a 4-tier pipeline before each API call (first 3 are zero-cost local operations):

1. **Budget** — Truncate large tool results (keep head+tail) when context utilization > 50%
2. **Snip** — Replace stale/duplicate tool results with placeholder when utilization exceeds threshold
3. **Microcompact** — Aggressively clear old results when prompt cache is cold (idle > 5min)
4. **Auto-compact** — Full conversation summarization via API call when utilization > 85%

Each tier has separate Anthropic/OpenAI implementations due to different message formats.

### Permission System

5 modes: `default`, `plan`, `acceptEdits`, `bypassPermissions`, `dontAsk`. Permission checks happen in `Agent` before each tool execution. Dangerous shell commands are detected via regex patterns in `tools.ts`. Settings can be overridden via `.claude/settings.json`.

### Sub-agent Pattern

Sub-agents are isolated `Agent` instances with: filtered tool sets, own message history, output captured to buffer (not printed), tokens aggregated back to parent. They cannot recursively call agent/skill tools.

## Conventions

- All source uses ESM imports with explicit `.js` extensions (required by Node ESM resolution).
- Tool definitions follow Anthropic's `input_schema` format as the canonical form.
- The `Agent` class has parallel method pairs for both backends (e.g., `chatAnthropic()`/`chatOpenAI()`, `budgetToolResultsAnthropic()`/`budgetToolResultsOpenAI()`).
