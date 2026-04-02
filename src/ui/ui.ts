import chalk from "chalk";

// ─── Helper: format token counts ────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

// ─── Welcome ─────────────────────────────────────────────────

export function printWelcome() {
  const title = "  ✻ Claude Code Mini";
  const help = "  /help for commands";
  const width = 40;
  const top = chalk.dim("╭" + "─".repeat(width) + "╮");
  const bot = chalk.dim("╰" + "─".repeat(width) + "╯");
  const line1 = chalk.dim("│") + chalk.bold(" " + title.padEnd(width - 1)) + chalk.dim("│");
  const line2 = chalk.dim("│") + chalk.dim(" " + help.padEnd(width - 1)) + chalk.dim("│");
  console.log(`\n${top}\n${line1}\n${line2}\n${bot}\n`);
}

// ─── User prompt ─────────────────────────────────────────────

export function printUserPrompt() {
  process.stdout.write(chalk.bold.white("\n❯ "));
}

// ─── Assistant text ──────────────────────────────────────────

export function printAssistantText(text: string) {
  process.stdout.write(text);
}

// ─── Tool call ───────────────────────────────────────────────

export function printToolCall(name: string, input: Record<string, any>) {
  const summary = getToolSummary(name, input);
  console.log(
    chalk.dim.cyan("\n  ● ") +
      chalk.bold(name) +
      chalk.dim(` ${summary}`)
  );
}

// ─── Tool result ─────────────────────────────────────────────

export function printToolResult(name: string, result: string) {
  // Edit/write results get special colorized display
  if ((name === "edit_file" || name === "write_file") && !result.startsWith("Error")) {
    printFileChangeResult(name, result);
    return;
  }
  const maxLen = 500;
  const truncated =
    result.length > maxLen
      ? result.slice(0, maxLen) + chalk.gray(`\n  │ ... (${result.length} chars total)`)
      : result;
  const lines = truncated.split("\n").map((l) => chalk.dim("  │ ") + chalk.dim(l));
  console.log(lines.join("\n"));
}

// ─── File change result ──────────────────────────────────────

function printFileChangeResult(name: string, result: string) {
  const lines = result.split("\n");
  // First line is the success message
  console.log(chalk.dim("  │ ") + chalk.dim(lines[0]));

  // Rest is content preview or diff
  const maxDisplayLines = 40;
  const contentLines = lines.slice(1);
  const displayLines = contentLines.slice(0, maxDisplayLines);

  for (const line of displayLines) {
    if (!line.trim()) continue;
    const prefix = chalk.dim("  │ ");
    if (line.startsWith("@@")) {
      console.log(prefix + chalk.cyan(line));
    } else if (line.startsWith("- ")) {
      console.log(prefix + chalk.red(line));
    } else if (line.startsWith("+ ")) {
      console.log(prefix + chalk.green(line));
    } else {
      console.log(prefix + chalk.dim(line));
    }
  }
  if (contentLines.length > maxDisplayLines) {
    console.log(chalk.dim(`  │ ... (${contentLines.length - maxDisplayLines} more lines)`));
  }
}

// ─── Error ───────────────────────────────────────────────────

export function printError(msg: string) {
  console.error(chalk.red.bold(`\n  ✗ ${msg}`));
}

// ─── Confirmation ────────────────────────────────────────────

export function printConfirmation(command: string): void {
  console.log(
    chalk.yellow("\n  ⚠ Allow: ") + chalk.bold.white(command)
  );
}

// ─── Divider ─────────────────────────────────────────────────

export function printDivider() {
  console.log("");
}

// ─── Cost ────────────────────────────────────────────────────

export function printCost(inputTokens: number, outputTokens: number) {
  const costIn = (inputTokens / 1_000_000) * 3;
  const costOut = (outputTokens / 1_000_000) * 15;
  const total = costIn + costOut;
  console.log(
    chalk.dim(
      `  ↳ ${formatTokens(inputTokens)} in · ${formatTokens(outputTokens)} out · $${total.toFixed(2)}`
    )
  );
}

// ─── Retry ───────────────────────────────────────────────────

export function printRetry(attempt: number, max: number, reason: string) {
  console.log(
    chalk.dim.yellow(`\n  ↻ retry ${attempt}/${max} · ${reason}`)
  );
}

// ─── Info ────────────────────────────────────────────────────

export function printInfo(msg: string) {
  console.log(chalk.dim.cyan(`\n  ● ${msg}`));
}

// ─── Spinner for API calls ──────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let spinnerTimer: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;

export function startSpinner(label = "Thinking") {
  if (spinnerTimer) return; // already running
  spinnerFrame = 0;
  process.stdout.write(chalk.dim(`\n  ${SPINNER_FRAMES[0]} ${label}...`));
  spinnerTimer = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    process.stdout.write(`\r${chalk.dim(`  ${SPINNER_FRAMES[spinnerFrame]} ${label}...`)}`);
  }, 80);
}

export function stopSpinner() {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    process.stdout.write("\r\x1b[K");
  }
}

// ─── Sub-agent display ──────────────────────────────────────

export function printSubAgentStart(type: string, description: string) {
  console.log(
    chalk.dim.magenta(`\n  ▸ agent [${type}] `) + chalk.dim(description)
  );
}

export function printSubAgentEnd(type: string, description: string) {
  console.log(
    chalk.dim.magenta(`  ◂ agent [${type}] done`)
  );
}

// ─── Tool summaries ─────────────────────────────────────────

function getToolSummary(name: string, input: Record<string, any>): string {
  switch (name) {
    case "read_file":
      return input.file_path;
    case "write_file":
      return input.file_path;
    case "edit_file":
      return input.file_path;
    case "list_files":
      return input.pattern;
    case "grep_search":
      return `"${input.pattern}" in ${input.path || "."}`;
    case "run_shell":
      return input.command.length > 60
        ? input.command.slice(0, 60) + "..."
        : input.command;
    case "skill":
      return input.skill_name;
    case "agent":
      return `[${input.type || "general"}] ${input.description || ""}`;
    default:
      return "";
  }
}
