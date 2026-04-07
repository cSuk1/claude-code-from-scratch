import { execSync, execFileSync } from "child_process";
import { existsSync, readFileSync, statSync } from "fs";
import { join, relative, isAbsolute } from "path";

const isWin = process.platform === "win32";

// Check if git is available
function isGitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { encoding: "utf-8", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function runGit(args: string[]): string {
  try {
    const result = execFileSync("git", args, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      timeout: 30000,
    });
    return result.trim();
  } catch (e: any) {
    const stderr = (e.stderr?.toString() || "").trim() || e.message;
    // Git commands that fail gracefully return meaningful messages
    if (stderr) return stderr;
    return `Git error: ${e.message}`;
  }
}

// ─── Git Status ───────────────────────────────────────────────

interface GitStatusEntry {
  path: string;
  status: string;
  staged: boolean;
}

export function getGitStatus(): { isRepo: boolean; branch: string; files: GitStatusEntry[] } {
  if (!isGitAvailable()) {
    return { isRepo: false, branch: "", files: [] };
  }

  try {
    // Get current branch
    const branch = runGit(["branch", "--show-current"]);
    if (!branch) {
      // Detached HEAD state
      const rev = runGit(["rev-parse", "--short", "HEAD"]);
      return { isRepo: true, branch: `HEAD detached at ${rev}`, files: [] };
    }

    // Get status with short format
    const statusOutput = runGit(["status", "--porcelain=v1"]);

    const files: GitStatusEntry[] = [];
    if (statusOutput) {
      for (const line of statusOutput.split("\n")) {
        if (!line.trim()) continue;
        const indexStatus = line[0] || " ";
        const workTreeStatus = line[1] || " ";
        const path = line.slice(3);

        // Determine staged status
        const staged = indexStatus !== " " && indexStatus !== "?";

        // Build status string
        let status = "";
        if (indexStatus === "M") status += "modified (staged)";
        else if (indexStatus === "A") status += "added";
        else if (indexStatus === "D") status += "deleted (staged)";
        else if (indexStatus === "R") status += "renamed";
        else if (indexStatus === "C") status += "copied";

        if (workTreeStatus === "M") status += status ? ", modified" : "modified";
        else if (workTreeStatus === "D") status += status ? ", deleted" : "deleted";
        else if (workTreeStatus === "?" && indexStatus === "?") status = "untracked";

        if (status) {
          files.push({ path, status, staged });
        }
      }
    }

    return { isRepo: true, branch, files };
  } catch {
    return { isRepo: false, branch: "", files: [] };
  }
}

// ─── Git Diff ───────────────────────────────────────────────────

export function getGitDiff(filePath?: string): string {
  if (!isGitAvailable()) return "Git not available";

  try {
    if (filePath) {
      return runGit(["diff", "--", filePath]);
    }
    return runGit(["diff"]);
  } catch (e: any) {
    return `Git diff error: ${e.message}`;
  }
}

export function getGitDiffStaged(): string {
  if (!isGitAvailable()) return "Git not available";

  try {
    return runGit(["diff", "--cached"]);
  } catch (e: any) {
    return `Git diff error: ${e.message}`;
  }
}

// ─── Git Log ───────────────────────────────────────────────────

interface GitCommitEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  body?: string;
}

export function getGitLog(limit = 10, filePath?: string): GitCommitEntry[] {
  if (!isGitAvailable()) return [];

  try {
    let format = "%H%n%h%n%s%n%an%n%ad%n%b%n---COMMIT_END---";
    let args = ["log", `--max-count=${limit}`, `--format=${format}`];

    if (filePath) {
      args.push("--", filePath);
    }

    const output = runGit(args);
    const commits: GitCommitEntry[] = [];

    for (const commitBlock of output.split("---COMMIT_END---")) {
      if (!commitBlock.trim()) continue;
      const lines = commitBlock.trim().split("\n");
      if (lines.length < 5) continue;

      commits.push({
        hash: lines[0],
        shortHash: lines[1],
        subject: lines[2],
        author: lines[3],
        date: lines[4],
        body: lines.slice(5).join("\n").trim() || undefined,
      });
    }

    return commits;
  } catch {
    return [];
  }
}

// ─── Git Branch ───────────────────────────────────────────────

interface GitBranchEntry {
  name: string;
  current: boolean;
  remote: boolean;
}

export function getGitBranches(): GitBranchEntry[] {
  if (!isGitAvailable()) return [];

  try {
    const output = runGit(["branch", "-a"]);
    const branches: GitBranchEntry[] = [];

    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const isCurrent = trimmed.startsWith("*");
      const name = trimmed.replace(/^\*\s?/, "");

      // Check if remote branch
      const isRemote = name.startsWith("remotes/") || name.startsWith("origin/") || name.startsWith("HEAD ->");

      branches.push({
        name: name.replace(/^origin\//, "").replace(/^remotes\//, ""),
        current: isCurrent,
        remote: isRemote,
      });
    }

    return branches;
  } catch {
    return [];
  }
}

// ─── Git Show ───────────────────────────────────────────────────

export function getGitShow(ref: string, filePath?: string): string {
  if (!isGitAvailable()) return "Git not available";

  try {
    if (filePath) {
      return runGit(["show", `${ref}:${filePath}`]);
    }
    return runGit(["show", ref]);
  } catch (e: any) {
    return `Git show error: ${e.message}`;
  }
}

// ─── Git Blame ──────────────────────────────────────────────────

export function getGitBlame(filePath: string): string {
  if (!isGitAvailable()) return "Git not available";

  if (!existsSync(filePath)) {
    return `File not found: ${filePath}`;
  }

  try {
    return runGit(["blame", filePath]);
  } catch (e: any) {
    return `Git blame error: ${e.message}`;
  }
}

// ─── Git Remote ─────────────────────────────────────────────────

interface GitRemoteEntry {
  name: string;
  fetch: string;
  push: string;
}

export function getGitRemotes(): GitRemoteEntry[] {
  if (!isGitAvailable()) return [];

  try {
    const output = runGit(["remote", "-v"]);
    const remotes: Map<string, { fetch?: string; push?: string }> = new Map();

    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
      if (!match) continue;

      const [, name, url, type] = match;
      if (!remotes.has(name)) {
        remotes.set(name, {});
      }
      remotes.get(name)![type as "fetch" | "push"] = url;
    }

    return Array.from(remotes.entries()).map(([name, urls]) => ({
      name,
      fetch: urls.fetch || "",
      push: urls.push || "",
    }));
  } catch {
    return [];
  }
}

// ─── Git Info Summary ───────────────────────────────────────────

export function getGitInfoSummary(): string {
  if (!isGitAvailable()) {
    return "Git is not available";
  }

  const { isRepo, branch, files } = getGitStatus();

  if (!isRepo) {
    return "Not a git repository";
  }

  const lines: string[] = [];
  lines.push(`Branch: ${branch}`);

  // Summary counts
  const staged = files.filter(f => f.staged).length;
  const modified = files.filter(f => !f.staged && f.status !== "untracked").length;
  const untracked = files.filter(f => f.status === "untracked").length;

  if (staged > 0) lines.push(`Staged: ${staged} file(s)`);
  if (modified > 0) lines.push(`Modified: ${modified} file(s)`);
  if (untracked > 0) lines.push(`Untracked: ${untracked} file(s)`);

  if (files.length === 0) {
    lines.push("Working tree clean");
  }

  // Show remotes
  const remotes = getGitRemotes();
  if (remotes.length > 0) {
    lines.push(`Remote: ${remotes[0].name} (${remotes[0].fetch || remotes[0].push})`);
  }

  return lines.join("\n");
}