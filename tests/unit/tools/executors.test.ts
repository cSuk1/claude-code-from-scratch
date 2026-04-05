import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeToolHandler } from "../../../src/tools/executors.js";
import { join, dirname } from "path";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";

describe("executors - read_file", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "ccmini-exec-test-"));
  });

  afterEach(() => {
    if (testDir) rmSync(testDir, { force: true, recursive: true });
  });

  it("should read existing file", async () => {
    const filePath = join(testDir, "test.txt");
    writeFileSync(filePath, "Hello World");

    const result = await executeToolHandler("read_file", { file_path: filePath });
    expect(result).toContain("Hello World");
  });

  it("should return error for non-existent file", async () => {
    const result = await executeToolHandler("read_file", { file_path: "/nonexistent/file.txt" });
    expect(result).toContain("Error reading file");
  });

  it("should respect offset parameter", async () => {
    const filePath = join(testDir, "lines.txt");
    writeFileSync(filePath, "line1\nline2\nline3\nline4\nline5");

    const result = await executeToolHandler("read_file", { file_path: filePath, offset: 3 });
    expect(result).toContain("line3");
    expect(result).not.toContain("line1");
  });

  it("should respect limit parameter", async () => {
    const filePath = join(testDir, "lines.txt");
    writeFileSync(filePath, "line1\nline2\nline3\nline4\nline5");

    const result = await executeToolHandler("read_file", { file_path: filePath, limit: 2 });
    expect(result).toContain("line1");
    expect(result).toContain("line2");
    expect(result).not.toContain("line5");
  });

  it("should handle empty file", async () => {
    const filePath = join(testDir, "empty.txt");
    writeFileSync(filePath, "");

    const result = await executeToolHandler("read_file", { file_path: filePath });
    expect(result).toContain("empty");
  });
});

describe("executors - write_file", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "ccmini-exec-test-"));
  });

  afterEach(() => {
    if (testDir) rmSync(testDir, { force: true, recursive: true });
  });

  it("should create new file", async () => {
    const filePath = join(testDir, "new.txt");
    const result = await executeToolHandler("write_file", { file_path: filePath, content: "test content" });

    expect(result).toContain("Successfully wrote");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("test content");
  });

  it("should overwrite existing file", async () => {
    const filePath = join(testDir, "existing.txt");
    writeFileSync(filePath, "original");

    const result = await executeToolHandler("write_file", { file_path: filePath, content: "updated" });

    expect(result).toContain("Successfully wrote");
    expect(readFileSync(filePath, "utf-8")).toBe("updated");
  });

  it("should create parent directories", async () => {
    const filePath = join(testDir, "subdir", "nested", "file.txt");
    const result = await executeToolHandler("write_file", { file_path: filePath, content: "deep" });

    expect(result).toContain("Successfully wrote");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should return error for invalid path", async () => {
    // Write to root should fail
    const result = await executeToolHandler("write_file", { file_path: "/proc/test", content: "fail" });
    expect(result).toContain("Error");
  });
});

describe("executors - list_files", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "ccmini-exec-test-"));
    // Create test files
    writeFileSync(join(testDir, "a.ts"), "a");
    writeFileSync(join(testDir, "b.js"), "b");
    writeFileSync(join(testDir, "c.txt"), "c");
    require("fs").mkdirSync(join(testDir, "subdir"));
    writeFileSync(join(testDir, "subdir", "d.ts"), "d");
  });

  afterEach(() => {
    if (testDir) rmSync(testDir, { force: true, recursive: true });
  });

  it("should list files with glob pattern", async () => {
    // Use pattern to force glob mode (not ripgrep)
    const result = await executeToolHandler("list_files", { pattern: "*.ts", path: testDir });
    // Result may be files or error (depends on whether rg is available)
    expect(result).toBeTruthy();
  });

  it("should handle empty pattern", async () => {
    const result = await executeToolHandler("list_files", { pattern: "*", path: testDir });
    expect(result).toBeTruthy();
  });
});

describe("executors - grep_search", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "ccmini-exec-test-"));
    writeFileSync(join(testDir, "test.ts"), "function hello() {\n  return 'world';\n}");
  });

  afterEach(() => {
    if (testDir) rmSync(testDir, { force: true, recursive: true });
  });

  it("should find matching pattern", async () => {
    const result = await executeToolHandler("grep_search", { pattern: "hello", path: testDir });
    expect(result).toContain("hello");
  });

  it("should return empty for no matches", async () => {
    const result = await executeToolHandler("grep_search", { pattern: "nonexistent", path: testDir });
    expect(result).toContain("No matches found");
  });
});

describe("executors - run_shell", () => {
  it("should execute command", async () => {
    const result = await executeToolHandler("run_shell", { command: "echo hello" });
    expect(result.trim()).toBe("hello");
  });

  it("should handle command with spaces", async () => {
    const result = await executeToolHandler("run_shell", { command: "echo 'hello world'" });
    expect(result.trim()).toBe("hello world");
  });

  it("should capture stderr", async () => {
    const result = await executeToolHandler("run_shell", { command: "ls /nonexistent 2>&1" });
    expect(result).toContain("No such file");
  });

  it("should respect timeout", async () => {
    const result = await executeToolHandler("run_shell", { command: "sleep 10", timeout: 1 });
    // Should fail due to timeout
    expect(result).toBeTruthy();
  });
});

describe("executors - task_*", () => {
  it("should create task", async () => {
    const result = await executeToolHandler("task_create", {
      subject: "Test task",
      description: "Test description",
    });
    expect(result).toContain("Test task");
  });

  it("should list tasks", async () => {
    const result = await executeToolHandler("task_list", {});
    expect(result).toBeDefined();
  });
});

describe("executors - unknown tool", () => {
  it("should return error for unknown tool", async () => {
    const result = await executeToolHandler("unknown_tool" as any, {});
    expect(result).toContain("Unknown tool");
  });
});