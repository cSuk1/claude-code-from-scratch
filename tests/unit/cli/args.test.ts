import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs, type ParsedArgs } from "../../../src/cli/args.js";

// Helper to mock process.argv and run parseArgs
function mockParse(args: string[]): ParsedArgs {
  vi.spyOn(process, "argv", "get").mockReturnValue(["node", "cli.js", ...args]);
  return parseArgs();
}

describe("parseArgs", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("permission modes", () => {
    it("should default to default mode", () => {
      const result = mockParse([]);
      expect(result.permissionMode).toBe("default");
    });

    it("should parse --yolo as bypassPermissions", () => {
      const result = mockParse(["--yolo"]);
      expect(result.permissionMode).toBe("bypassPermissions");
    });

    it("should parse -y as bypassPermissions", () => {
      const result = mockParse(["-y"]);
      expect(result.permissionMode).toBe("bypassPermissions");
    });

    it("should parse --plan as plan", () => {
      const result = mockParse(["--plan"]);
      expect(result.permissionMode).toBe("plan");
    });

    it("should parse --accept-edits as acceptEdits", () => {
      const result = mockParse(["--accept-edits"]);
      expect(result.permissionMode).toBe("acceptEdits");
    });

    it("should parse --dont-ask as dontAsk", () => {
      const result = mockParse(["--dont-ask"]);
      expect(result.permissionMode).toBe("dontAsk");
    });
  });

  describe("thinking flag", () => {
    it("should default to false", () => {
      const result = mockParse([]);
      expect(result.thinking).toBe(false);
    });

    it("should enable thinking with --thinking flag", () => {
      const result = mockParse(["--thinking"]);
      expect(result.thinking).toBe(true);
    });
  });

  describe("model option", () => {
    it("should accept --model with value", () => {
      const result = mockParse(["--model", "gpt-4o"]);
      expect(result.model).toBe("gpt-4o");
    });

    it("should accept -m short flag", () => {
      const result = mockParse(["-m", "claude-3-haiku"]);
      expect(result.model).toBe("claude-3-haiku");
    });

    it("should use default model when not specified", () => {
      const result = mockParse([]);
      expect(result.model).toBeDefined();
      expect(result.model.length).toBeGreaterThan(0);
    });
  });

  describe("resume option", () => {
    it("should parse --resume", () => {
      const result = mockParse(["--resume"]);
      expect(result.resume).toBe(true);
    });
  });

  describe("max-turns option", () => {
    it("should parse --max-turns with number", () => {
      const result = mockParse(["--max-turns", "5"]);
      expect(result.maxTurns).toBe(5);
    });

    it("should handle invalid number gracefully", () => {
      const result = mockParse(["--max-turns", "abc"]);
      expect(result.maxTurns).toBeUndefined();
    });
  });

  describe("connect option", () => {
    it("should parse --connect", () => {
      const result = mockParse(["--connect"]);
      expect(result.connect).toBe(true);
    });
  });

  describe("positional prompt", () => {
    it("should capture single word as prompt", () => {
      const result = mockParse(["hello"]);
      expect(result.prompt).toBe("hello");
    });

    it("should capture multiple words as prompt", () => {
      const result = mockParse(["hello", "world", "test"]);
      expect(result.prompt).toBe("hello world test");
    });

    it("should return undefined when no prompt", () => {
      const result = mockParse([]);
      expect(result.prompt).toBeUndefined();
    });
  });

  describe("combined options", () => {
    it("should parse multiple options together", () => {
      const result = mockParse(["--yolo", "--thinking", "--model", "gpt-4o", "fix the bug"]);
      expect(result.permissionMode).toBe("bypassPermissions");
      expect(result.thinking).toBe(true);
      expect(result.model).toBe("gpt-4o");
      expect(result.prompt).toBe("fix the bug");
    });

    it("should handle --plan with prompt", () => {
      const result = mockParse(["--plan", "describe the refactor"]);
      expect(result.permissionMode).toBe("plan");
      expect(result.prompt).toBe("describe the refactor");
    });
  });

  describe("apiBase", () => {
    it("should default to undefined", () => {
      const result = mockParse([]);
      expect(result.apiBase).toBeUndefined();
    });
  });
});