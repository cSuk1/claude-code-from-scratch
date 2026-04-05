import { execSync, execFileSync } from "child_process";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { glob } from "glob";

const MAX_GREP_RESULTS = 100;
const MAX_GREP_SCAN_RESULTS = 200;
const MAX_FILE_LIST_RESULTS = 200;

const isWin = process.platform === "win32";

export function checkCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { encoding: "utf-8", timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(input: {
  pattern: string;
  path?: string;
}): Promise<string> {
  const hasRg = checkCommandAvailable("rg");

  if (hasRg) {
    return listFilesWithRipgrep(input);
  }

  return listFilesWithGlob(input);
}

async function listFilesWithRipgrep(input: {
  pattern: string;
  path?: string;
}): Promise<string> {
  try {
    const args = [
      "--files",
      "--glob", input.pattern,
      "--sort=modified",
      "--no-ignore-vcs",
      "--no-ignore-global",
      "--hidden",
    ];

    const result = execFileSync("rg", args, {
      cwd: input.path || process.cwd(),
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      timeout: 10000,
    });

    const files = result.split("\n").filter(Boolean);
    if (files.length === 0) return "No files found matching the pattern.";
    return files.slice(0, MAX_FILE_LIST_RESULTS).join("\n") +
      (files.length > MAX_FILE_LIST_RESULTS ? `\n... and ${files.length - MAX_FILE_LIST_RESULTS} more` : "");
  } catch {
    return listFilesWithGlob(input);
  }
}

async function listFilesWithGlob(input: {
  pattern: string;
  path?: string;
}): Promise<string> {
  try {
    const files = await glob(input.pattern, {
      cwd: input.path || process.cwd(),
      nodir: true,
      ignore: ["node_modules/**", ".git/**"],
    });
    if (files.length === 0) return "No files found matching the pattern.";
    return files.slice(0, MAX_FILE_LIST_RESULTS).join("\n") +
      (files.length > MAX_FILE_LIST_RESULTS ? `\n... and ${files.length - MAX_FILE_LIST_RESULTS} more` : "");
  } catch (e: any) {
    return `Error listing files: ${e.message}`;
  }
}

export function grepSearch(input: {
  pattern: string;
  path?: string;
  include?: string;
}): string {
  const hasRg = checkCommandAvailable("rg");

  if (hasRg) {
    return grepWithRipgrep(input);
  }

  if (!isWin && checkCommandAvailable("grep")) {
    return grepWithGnuGrep(input);
  }

  return grepJS(input.pattern, input.path || ".", input.include);
}

function grepWithRipgrep(input: { pattern: string; path?: string; include?: string }): string {
  try {
    const args = [
      "--line-number",
      "--color=never",
      "--no-heading",
      "--max-count=1000",
    ];

    if (input.include) {
      args.push("--glob", input.include);
    }

    args.push(
      "--glob", "!.git",
      "--glob", "!.svn",
      "--glob", "!.hg",
      "--glob", "!.bzr",
      "--glob", "!_darcs"
    );

    args.push("--", input.pattern);
    args.push(input.path || ".");

    const result = execFileSync("rg", args, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      timeout: 15000,
    });

    const lines = result.split("\n").filter(Boolean);
    const shown = lines.slice(0, MAX_GREP_RESULTS);
    return shown.join("\n") +
      (lines.length > MAX_GREP_RESULTS ? `\n... and ${lines.length - MAX_GREP_RESULTS} more matches` : "");
  } catch (e: any) {
    if (e.status === 1) return "No matches found.";
    return `Error: ${e.message}`;
  }
}

function grepWithGnuGrep(input: { pattern: string; path?: string; include?: string }): string {
  try {
    const args = ["--line-number", "--color=never", "-r"];
    if (input.include) args.push(`--include=${input.include}`);
    args.push("--", input.pattern);
    args.push(input.path || ".");

    const result = execFileSync("grep", args, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      timeout: 10000,
    });

    const lines = result.split("\n").filter(Boolean);
    return lines.slice(0, MAX_GREP_RESULTS).join("\n") +
      (lines.length > MAX_GREP_RESULTS ? `\n... and ${lines.length - MAX_GREP_RESULTS} more matches` : "");
  } catch (e: any) {
    if (e.status === 1) return "No matches found.";
    return `Error: ${e.message}`;
  }
}

function grepJS(pattern: string, dir: string, include?: string): string {
  const re = new RegExp(pattern);
  const includeRe = include ? new RegExp(include.replace(/\*/g, ".*").replace(/\?/g, ".")) : null;
  const matches: string[] = [];

  function walk(d: string) {
    if (matches.length >= MAX_GREP_SCAN_RESULTS) return;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }

    for (const name of entries) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const full = join(d, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (includeRe && !includeRe.test(name)) continue;

      try {
        const text = readFileSync(full, "utf-8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            matches.push(`${full}:${i + 1}:${lines[i]}`);
            if (matches.length >= MAX_GREP_SCAN_RESULTS) return;
          }
        }
      } catch {
        // skip non-text files
      }
    }
  }

  walk(dir);
  if (matches.length === 0) return "No matches found.";
  const shown = matches.slice(0, MAX_GREP_RESULTS);
  return shown.join("\n") +
    (matches.length > MAX_GREP_RESULTS ? `\n... and ${matches.length - MAX_GREP_RESULTS} more matches` : "");
}
