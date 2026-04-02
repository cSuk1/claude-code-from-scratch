import chalk from "chalk";
import stringWidth from "string-width";
import stripAnsi from "strip-ansi";

// ─── Helper: visual width (handles CJK, emoji, ANSI) ───────

function visWidth(s: string): number {
  return stringWidth(stripAnsi(s));
}

function padVisual(s: string, targetWidth: number): string {
  const diff = targetWidth - visWidth(s);
  return diff > 0 ? s + " ".repeat(diff) : s;
}

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

// ─── Markdown Renderer ──────────────────────────────────────

class MarkdownRenderer {
  private buffer = "";          // partial line accumulator
  private inCodeBlock = false;
  private codeBuffer: string[] = [];
  private codeLang = "";
  private inTable = false;
  private tableBuffer: string[] = [];

  reset(): void {
    this.buffer = "";
    this.inCodeBlock = false;
    this.codeBuffer = [];
    this.codeLang = "";
    this.inTable = false;
    this.tableBuffer = [];
  }

  flush(): void {
    if (this.inTable) {
      this.renderTable();
      this.inTable = false;
      this.tableBuffer = [];
    }
    if (this.inCodeBlock) {
      // Unclosed code block — render what we have
      this.renderCodeBlock();
      this.inCodeBlock = false;
      this.codeBuffer = [];
      this.codeLang = "";
    }
    if (this.buffer.length > 0) {
      process.stdout.write(this.renderLine(this.buffer));
      this.buffer = "";
    }
  }

  push(chunk: string): void {
    this.buffer += chunk;

    // Process complete lines
    let nlIdx: number;
    while ((nlIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nlIdx);
      this.buffer = this.buffer.slice(nlIdx + 1);
      this.processLine(line);
    }
  }

  private processLine(line: string): void {
    // Check for code fence
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```")) {
      if (!this.inCodeBlock) {
        // Flush any pending table before entering code block
        if (this.inTable) {
          this.renderTable();
          this.inTable = false;
          this.tableBuffer = [];
        }
        // Entering code block
        this.inCodeBlock = true;
        this.codeLang = trimmed.slice(3).trim();
        this.codeBuffer = [];
        return;
      } else {
        // Closing code block
        this.renderCodeBlock();
        this.inCodeBlock = false;
        this.codeBuffer = [];
        this.codeLang = "";
        return;
      }
    }

    if (this.inCodeBlock) {
      this.codeBuffer.push(line);
      return;
    }

    // Table detection: lines starting and ending with |
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    if (isTableRow) {
      if (!this.inTable) {
        this.inTable = true;
        this.tableBuffer = [];
      }
      this.tableBuffer.push(line);
      return;
    }

    // If we were in a table and hit a non-table line, flush the table
    if (this.inTable) {
      this.renderTable();
      this.inTable = false;
      this.tableBuffer = [];
    }

    // Normal line — render immediately
    process.stdout.write(this.renderLine(line) + "\n");
  }

  private renderCodeBlock(): void {
    const lines = this.codeBuffer;
    const langLabel = this.codeLang || "code";
    // Determine box width
    const maxLineLen = lines.reduce((max, l) => Math.max(max, l.length), 0);
    const boxWidth = Math.max(maxLineLen + 4, langLabel.length + 6, 30);

    // Top border
    const topLabel = `─ ${langLabel} `;
    const topRight = "─".repeat(Math.max(boxWidth - topLabel.length - 1, 0));
    process.stdout.write(chalk.dim(`  ╭${topLabel}${topRight}╮`) + "\n");

    // Content lines
    for (const l of lines) {
      const padded = l.padEnd(boxWidth - 2);
      process.stdout.write(chalk.dim("  │ ") + padded + chalk.dim(" │") + "\n");
    }

    // Bottom border
    process.stdout.write(chalk.dim(`  ╰${"─".repeat(boxWidth)}╯`) + "\n");
  }

  private renderTable(): void {
    const rows = this.tableBuffer;
    if (rows.length === 0) return;

    // Parse cells from each row
    const parsedRows: string[][] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      // Split by | and remove first/last empty entries
      const cells = row.split("|").slice(1, -1).map(c => c.trim());
      // Detect separator row (e.g. |------|------|)
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) {
        continue;
      }
      parsedRows.push(cells);
    }

    if (parsedRows.length === 0) return;

    // Determine column count and widths (using visual width for CJK/emoji)
    const colCount = Math.max(...parsedRows.map(r => r.length));
    const colWidths: number[] = [];
    for (let c = 0; c < colCount; c++) {
      colWidths[c] = 0;
      for (const row of parsedRows) {
        const cell = row[c] || "";
        colWidths[c] = Math.max(colWidths[c], visWidth(cell));
      }
    }

    // Render top border
    const topParts = colWidths.map(w => "─".repeat(w + 2));
    process.stdout.write(chalk.dim("  ╭" + topParts.join("┬") + "╮") + "\n");

    // Render header row (first parsed row)
    const header = parsedRows[0];
    const headerCells = colWidths.map((w, i) => {
      const cell = header[i] || "";
      return " " + padVisual(chalk.bold(cell), w) + " ";
    });
    process.stdout.write(chalk.dim("  │") + headerCells.join(chalk.dim("│")) + chalk.dim("│") + "\n");

    // Render header separator
    const sepParts = colWidths.map(w => "─".repeat(w + 2));
    process.stdout.write(chalk.dim("  ├" + sepParts.join("┼") + "┤") + "\n");

    // Render data rows
    for (let r = 1; r < parsedRows.length; r++) {
      const row = parsedRows[r];
      const dataCells = colWidths.map((w, i) => {
        const cell = row[i] || "";
        const rendered = this.renderInline(cell);
        return " " + padVisual(rendered, w) + " ";
      });
      process.stdout.write(chalk.dim("  │") + dataCells.join(chalk.dim("│")) + chalk.dim("│") + "\n");
    }

    // Render bottom border
    const botParts = colWidths.map(w => "─".repeat(w + 2));
    process.stdout.write(chalk.dim("  ╰" + botParts.join("┴") + "╯") + "\n");
  }

  private renderLine(line: string): string {
    // Horizontal rule: --- or ***  or ___
    if (/^(\s*)([-*_])\2{2,}\s*$/.test(line)) {
      return chalk.dim("─".repeat(40));
    }

    // Headings: # ## ###
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      return chalk.bold(headingMatch[2]);
    }

    // Block quote: > text
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      // Keep quote content but drop leading marker to avoid noisy ">" prefixes in CLI output.
      return this.renderInline(quoteMatch[1]);
    }

    // Unordered list: - item or * item
    const ulMatch = line.match(/^(\s*)([-*])\s+(.*)$/);
    if (ulMatch) {
      return ulMatch[1] + chalk.dim(ulMatch[2]) + " " + this.renderInline(ulMatch[3]);
    }

    // Ordered list: 1. item
    const olMatch = line.match(/^(\s*)(\d+\.)\s+(.*)$/);
    if (olMatch) {
      return olMatch[1] + chalk.dim(olMatch[2]) + " " + this.renderInline(olMatch[3]);
    }

    // Regular line — apply inline formatting
    return this.renderInline(line);
  }

  private renderInline(text: string): string {
    // Process inline markdown patterns
    // Order matters: code first (to avoid processing markdown inside code spans)

    // Inline code: `code`
    text = text.replace(/`([^`]+)`/g, (_m, code) => chalk.cyan(code));

    // Bold: **text**
    text = text.replace(/\*\*([^*]+)\*\*/g, (_m, t) => chalk.bold(t));

    // Italic: *text* or _text_  (but not inside words for _)
    text = text.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, (_m, t) => chalk.italic(t));
    text = text.replace(/(?<!\w)_([^_]+)_(?!\w)/g, (_m, t) => chalk.italic(t));

    // Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) =>
      chalk.underline.blue(label) + chalk.dim(` (${url})`)
    );

    return text;
  }
}

const mdRenderer = new MarkdownRenderer();

// ─── Assistant text ──────────────────────────────────────────

export function printAssistantText(text: string) {
  mdRenderer.push(text);
}

export function flushMarkdown(): void {
  mdRenderer.flush();
}

export function resetMarkdown(): void {
  mdRenderer.reset();
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
