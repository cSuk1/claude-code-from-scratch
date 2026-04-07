import { existsSync } from "fs";
import { READ_TOOLS, WRITE_TOOLS } from "./definitions.js";
import {
  getUserSettingsPath,
  getProjectSettingsPath,
  loadSettingsFile,
  readOrCreateSettings,
  writeSettingsFile,
} from "../cli/config.js";

export type PermissionMode = "default" | "plan" | "acceptEdits" | "bypassPermissions" | "dontAsk";

const DANGEROUS_PATTERNS = [
  /\brm\s/,
  /\bgit\s+(push|reset|clean|checkout\s+\.)/,
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\s/,
  />\s*\/dev\//,
  /\bkill\b/,
  /\bpkill\b/,
  /\breboot\b/,
  /\bshutdown\b/,
  /\bdel\s/i,
  /\brmdir\s/i,
  /\bformat\s/i,
  /\btaskkill\s/i,
  /\bRemove-Item\s/i,
  /\bStop-Process\s/i,
];

export function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some((p) => p.test(command));
}

interface ParsedRule {
  tool: string;
  pattern: string | null;
}

interface PermissionRules {
  allow: ParsedRule[];
  deny: ParsedRule[];
}

let cachedRules: PermissionRules | null = null;

function parseRule(rule: string): ParsedRule {
  const match = rule.match(/^([a-z_]+)\((.+)\)$/);
  if (match) {
    return { tool: match[1], pattern: match[2] };
  }
  return { tool: rule, pattern: null };
}

export function loadPermissionRules(): PermissionRules {
  if (cachedRules) return cachedRules;

  const allow: ParsedRule[] = [];
  const deny: ParsedRule[] = [];

  const userSettings = loadSettingsFile(getUserSettingsPath());
  const projectSettings = loadSettingsFile(getProjectSettingsPath());

  for (const settings of [userSettings, projectSettings]) {
    if (!settings?.permissions) continue;
    if (Array.isArray(settings.permissions.allow)) {
      for (const r of settings.permissions.allow) allow.push(parseRule(r));
    }
    if (Array.isArray(settings.permissions.deny)) {
      for (const r of settings.permissions.deny) deny.push(parseRule(r));
    }
  }

  cachedRules = { allow, deny };
  return cachedRules;
}

function matchesRule(rule: ParsedRule, toolName: string, input: Record<string, any>): boolean {
  if (rule.tool !== toolName) return false;
  if (!rule.pattern) return true;

  let value = "";
  if (toolName === "run_shell") value = input.command || "";
  else if (input.file_path) value = input.file_path;
  else return true;

  const pattern = rule.pattern;
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return value === pattern;
}

function checkPermissionRules(
  toolName: string,
  input: Record<string, any>
): "allow" | "deny" | null {
  const rules = loadPermissionRules();

  for (const rule of rules.deny) {
    if (matchesRule(rule, toolName, input)) return "deny";
  }
  for (const rule of rules.allow) {
    if (matchesRule(rule, toolName, input)) return "allow";
  }
  return null;
}

export function checkPermission(
  toolName: string,
  input: Record<string, any>,
  mode: PermissionMode = "default"
): { action: "allow" | "deny" | "confirm"; message?: string } {
  if (mode === "bypassPermissions") return { action: "allow" };

  const ruleResult = checkPermissionRules(toolName, input);
  if (ruleResult === "deny") {
    return { action: "deny", message: `Denied by permission rule for ${toolName}` };
  }
  if (ruleResult === "allow") {
    return { action: "allow" };
  }

  if (READ_TOOLS.has(toolName)) return { action: "allow" };

  if (mode === "plan" && WRITE_TOOLS.has(toolName)) {
    return { action: "deny", message: `Blocked in plan mode: ${toolName}` };
  }

  if (mode === "acceptEdits" && WRITE_TOOLS.has(toolName)) {
    return { action: "allow" };
  }

  let needsConfirm = false;
  let confirmMessage = "";

  if (toolName === "run_shell" && isDangerous(input.command)) {
    needsConfirm = true;
    confirmMessage = input.command;
  } else if (toolName === "write_file" && !existsSync(input.file_path)) {
    needsConfirm = true;
    confirmMessage = `write new file: ${input.file_path}`;
  } else if (toolName === "edit_file" && !existsSync(input.file_path)) {
    needsConfirm = true;
    confirmMessage = `edit non-existent file: ${input.file_path}`;
  }

  if (needsConfirm) {
    if (mode === "dontAsk") {
      return { action: "deny", message: `Auto-denied (dontAsk mode): ${confirmMessage}` };
    }
    return { action: "confirm", message: confirmMessage };
  }

  return { action: "allow" };
}

export function needsConfirmation(
  toolName: string,
  input: Record<string, any>
): string | null {
  const result = checkPermission(toolName, input);
  if (result.action === "confirm") return result.message || null;
  return null;
}

export function resetPermissionCache(): void {
  cachedRules = null;
}

// ─── Persist permission rules ────────────────────────────────

/**
 * Save a permission rule to project settings.
 * Creates the .ccmini directory if needed.
 */
export function savePermissionRule(rule: string, type: "allow" | "deny"): void {
  const settingsPath = getProjectSettingsPath();
  const settings = readOrCreateSettings(settingsPath);

  // Initialize permissions object
  if (!settings.permissions) {
    settings.permissions = { allow: [], deny: [] };
  }
  if (!Array.isArray(settings.permissions.allow)) {
    settings.permissions.allow = [];
  }
  if (!Array.isArray(settings.permissions.deny)) {
    settings.permissions.deny = [];
  }

  // Add rule if not already present
  const list = type === "allow" ? settings.permissions.allow : settings.permissions.deny;
  if (!list.includes(rule)) {
    list.push(rule);
  }

  // Write back
  writeSettingsFile(settingsPath, settings);

  // Invalidate cache so next check picks up the new rule
  cachedRules = null;
}

/**
 * Generate a permission rule string based on tool name and input.
 *
 * Strategy:
 *   run_shell — extract the "command base" and add a wildcard suffix.
 *     - Compound CLI tools (npm, git, docker, yarn, pnpm, cargo, go, pip,
 *       npx, kubectl, brew, apt, yum, dnf, pacman):
 *         "npm test --coverage" → run_shell(npm test*)
 *     - Standalone commands (rm, kill, make, gcc, ...):
 *         "rm -rf dist"         → run_shell(rm *)
 *     - Piped / chained commands: use only the first segment.
 *
 *   write_file / edit_file — exact file path.
 *     "src/foo.ts"            → write_file(src/foo.ts)
 *
 *   Anything else — tool name only (blanket rule).
 */
// Commands whose first word is just a dispatcher; the second word is the
// real sub-command and should be included in the pattern.
const COMPOUND_COMMANDS = new Set([
  "npm", "npx", "yarn", "pnpm", "bun",
  "git", "gh",
  "docker", "docker-compose", "podman",
  "cargo", "go", "pip", "pip3", "python", "python3",
  "kubectl", "helm",
  "brew", "apt", "apt-get", "yum", "dnf", "pacman",
  "systemctl", "journalctl",
]);
export function generatePermissionRule(toolName: string, input: Record<string, any>): string {
  if (toolName === "run_shell") {
    const command = (input.command || "").trim();
    // Strip leading env vars like "FOO=bar npm test"
    const withoutEnv = command.replace(/^(\w+=\S+\s+)+/, "");
    const parts = withoutEnv.split(/\s+/);
    const base = parts[0] || command;

    let pattern: string;
    if (COMPOUND_COMMANDS.has(base) && parts.length >= 2) {
      // "npm test --coverage" → "npm test*"
      pattern = parts.slice(0, 2).join(" ") + "*";
    } else {
      // "rm -rf dist" → "rm *"  (matches any rm invocation)
      pattern = base + " *";
    }
    return `run_shell(${pattern})`;
  }

  if (toolName === "write_file" || toolName === "edit_file") {
    // Allow all files in the project directory
    const projectRoot = process.cwd();
    return `${toolName}(${projectRoot}/*)`;
  }

  // For read_file, also use project-level wildcard if user triggers remember
  if (toolName === "read_file") {
    const projectRoot = process.cwd();
    return `${toolName}(${projectRoot}/*)`;
  }

  // Generic fallback: tool name only
  return toolName;
}
