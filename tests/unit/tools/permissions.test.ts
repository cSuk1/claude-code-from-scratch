import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkPermission,
  isDangerous,
  needsConfirmation,
  resetPermissionCache,
  generatePermissionRule,
  type PermissionMode,
} from "../../../src/tools/permissions.js";

describe("permissions", () => {
  beforeEach(() => {
    resetPermissionCache();
  });

  describe("isDangerous", () => {
    it("should detect rm command as dangerous", () => {
      expect(isDangerous("rm -rf /")).toBe(true);
      expect(isDangerous("rm -rf .")).toBe(true);
    });

    it("should detect dangerous git commands", () => {
      expect(isDangerous("git push")).toBe(true);
      expect(isDangerous("git reset --hard")).toBe(true);
      expect(isDangerous("git clean -fd")).toBe(true);
      expect(isDangerous("git checkout .")).toBe(true);
    });

    it("should detect sudo as dangerous", () => {
      expect(isDangerous("sudo rm -rf /")).toBe(true);
      expect(isDangerous("sudo apt-get install")).toBe(true);
    });

    it("should detect mkfs as dangerous", () => {
      expect(isDangerous("mkfs /dev/sda1")).toBe(true);
    });

    it("should detect dd as dangerous", () => {
      expect(isDangerous("dd if=/dev/zero of=/dev/sda")).toBe(true);
    });

    it("should detect device redirect as dangerous", () => {
      expect(isDangerous("echo test > /dev/null")).toBe(true);
    });

    it("should detect kill commands as dangerous", () => {
      expect(isDangerous("kill -9 1234")).toBe(true);
      expect(isDangerous("pkill node")).toBe(true);
    });

    it("should detect shutdown/reboot as dangerous", () => {
      expect(isDangerous("shutdown -h now")).toBe(true);
      expect(isDangerous("reboot")).toBe(true);
    });

    it("should detect Windows dangerous commands", () => {
      expect(isDangerous("del /f /s /q C:\\*")).toBe(true);
      expect(isDangerous("rmdir /s /q C:\\temp")).toBe(true);
      expect(isDangerous("format D:")).toBe(true);
    });

    it("should allow safe commands", () => {
      expect(isDangerous("ls -la")).toBe(false);
      expect(isDangerous("cat file.txt")).toBe(false);
      expect(isDangerous("git status")).toBe(false);
      expect(isDangerous("git clone")).toBe(false);
      expect(isDangerous("npm install")).toBe(false);
    });
  });

  describe("checkPermission - mode: default", () => {
    it("should allow read tools by default", () => {
      expect(checkPermission("read_file", { file_path: "/test.ts" }).action).toBe("allow");
      expect(checkPermission("list_files", { path: "." }).action).toBe("allow");
      expect(checkPermission("grep_search", { pattern: "test" }).action).toBe("allow");
    });

    it("should require confirmation for new file write", () => {
      const result = checkPermission("write_file", { file_path: "/new/file.ts" }, "default");
      expect(result.action).toBe("confirm");
      expect(result.message).toContain("write new file");
    });

    it("should require confirmation for new file edit", () => {
      const result = checkPermission("edit_file", { file_path: "/new/file.ts" }, "default");
      expect(result.action).toBe("confirm");
      expect(result.message).toContain("edit non-existent");
    });

    it("should allow safe shell commands", () => {
      const result = checkPermission("run_shell", { command: "ls -la" }, "default");
      expect(result.action).toBe("allow");
    });

    it("should require confirmation for dangerous shell commands", () => {
      const result = checkPermission("run_shell", { command: "rm -rf /tmp/test" }, "default");
      expect(result.action).toBe("confirm");
      expect(result.message).toContain("rm");
    });
  });

  describe("checkPermission - mode: plan", () => {
    it("should allow read tools in plan mode", () => {
      const result = checkPermission("read_file", { file_path: "/test.ts" }, "plan");
      expect(result.action).toBe("allow");
    });

    it("should deny write tools in plan mode", () => {
      const result = checkPermission("write_file", { file_path: "/test.ts" }, "plan");
      expect(result.action).toBe("deny");
      expect(result.message).toContain("Blocked in plan mode");
    });

    it("should deny edit_file in plan mode", () => {
      const result = checkPermission("edit_file", { file_path: "/test.ts" }, "plan");
      expect(result.action).toBe("deny");
    });

    it("should allow safe shell commands in plan mode", () => {
      const result = checkPermission("run_shell", { command: "ls" }, "plan");
      expect(result.action).toBe("allow");
    });
  });

  describe("checkPermission - mode: acceptEdits", () => {
    it("should allow write tools in acceptEdits mode", () => {
      const result = checkPermission("write_file", { file_path: "/test.ts" }, "acceptEdits");
      expect(result.action).toBe("allow");
    });

    it("should still confirm dangerous shell commands", () => {
      const result = checkPermission("run_shell", { command: "rm -rf /" }, "acceptEdits");
      expect(result.action).toBe("confirm");
    });
  });

  describe("checkPermission - mode: bypassPermissions", () => {
    it("should allow everything in bypassPermissions mode", () => {
      expect(checkPermission("write_file", { file_path: "/test.ts" }, "bypassPermissions").action).toBe("allow");
      expect(checkPermission("run_shell", { command: "rm -rf /" }, "bypassPermissions").action).toBe("allow");
      expect(checkPermission("edit_file", { file_path: "/test.ts" }, "bypassPermissions").action).toBe("allow");
    });
  });

  describe("checkPermission - mode: dontAsk", () => {
    it("should deny new file writes in dontAsk mode", () => {
      const result = checkPermission("write_file", { file_path: "/new/file.ts" }, "dontAsk");
      expect(result.action).toBe("deny");
    });

    it("should deny dangerous commands in dontAsk mode", () => {
      const result = checkPermission("run_shell", { command: "rm -rf /" }, "dontAsk");
      expect(result.action).toBe("deny");
    });
  });

  describe("needsConfirmation", () => {
    it("should return message for tools needing confirmation", () => {
      const msg = needsConfirmation("write_file", { file_path: "/new/file.ts" });
      expect(msg).toBeTruthy();
      expect(msg).toContain("write new file");
    });

    it("should return null for allowed tools", () => {
      const msg = needsConfirmation("read_file", { file_path: "/test.ts" });
      expect(msg).toBeNull();
    });
  });

  describe("generatePermissionRule", () => {
    it("should generate wildcard rule for run_shell", () => {
      const rule = generatePermissionRule("run_shell", { command: "npm test" });
      expect(rule).toMatch(/^run_shell\(/);
      expect(rule).toContain("*");
    });

    it("should handle compound commands like npm, git, docker", () => {
      const rule = generatePermissionRule("run_shell", { command: "npm run build" });
      expect(rule).toBe("run_shell(npm run*)");
    });

    it("should generate file path rule for write_file", () => {
      const rule = generatePermissionRule("write_file", { file_path: "/project/src/index.ts" });
      expect(rule).toMatch(/^write_file\(/);
    });

    it("should generate rule for edit_file", () => {
      const rule = generatePermissionRule("edit_file", { file_path: "/project/src/index.ts" });
      expect(rule).toMatch(/^edit_file\(/);
    });

    it("should generate rule for read_file", () => {
      const rule = generatePermissionRule("read_file", { file_path: "/project/src/index.ts" });
      expect(rule).toMatch(/^read_file\(/);
    });
  });
});
