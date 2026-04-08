// Single source of truth for the project version.
// Read from package.json at build time; falls back to hardcoded value.

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readVersionFromPackageJson(): string {
  try {
    // Walk up from dist/ or src/ to find package.json
    const pkgPath = join(__dirname, "..", "package.json");
    const raw = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    if (pkg.version && typeof pkg.version === "string") {
      return pkg.version;
    }
  } catch {
    // fallback
  }
  return "0.0.0";
}

export const VERSION = readVersionFromPackageJson();
export const APP_NAME = "claude-code-mini";
