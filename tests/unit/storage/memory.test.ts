import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getMemoryDir,
  listMemories,
  saveMemory,
  deleteMemory,
  loadMemoryIndex,
  recallMemories,
  buildMemoryPromptSection,
  type MemoryType,
} from "../../../src/storage/memory.js";
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const mockHomedir = join(tmpdir(), `ccmini-home-${randomUUID()}`);

vi.mock("os", async () => {
  const actual = await vi.importActual("os");
  return {
    ...actual,
    homedir: () => mockHomedir,
  };
});

describe("memory", () => {
  const testDir = join(tmpdir(), `ccmini-test-${randomUUID()}`);
  let memoryDir: string;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    vi.stubGlobal("process", {
      ...process,
      cwd: () => testDir,
    });
    mkdirSync(mockHomedir, { recursive: true });
    memoryDir = getMemoryDir();
  });

  afterEach(() => {
    try {
      rmSync(testDir, { force: true, recursive: true });
    } catch { }
    try {
      if (existsSync(memoryDir)) {
        rmSync(memoryDir, { force: true, recursive: true });
      }
    } catch { }
    try {
      rmSync(mockHomedir, { force: true, recursive: true });
    } catch { }
  });

  describe("getMemoryDir", () => {
    it("should return memory directory path", () => {
      const dir = getMemoryDir();
      expect(dir).toContain(".ccmini");
      expect(dir).toContain("projects");
      expect(dir).toContain("memory");
    });

    it("should create directory if not exists", () => {
      const dir = getMemoryDir();
      expect(existsSync(dir)).toBe(true);
    });
  });

  describe("listMemories", () => {
    it("should return empty array when no memories", () => {
      const memories = listMemories();
      expect(memories).toEqual([]);
    });

    it("should list saved memories", () => {
      saveMemory({
        name: "Test Memory",
        description: "A test memory",
        type: "user",
        content: "Test content",
      });

      const memories = listMemories();
      expect(memories.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("saveMemory", () => {
    it("should save memory with correct frontmatter", () => {
      const filename = saveMemory({
        name: "Test Memory",
        description: "A test",
        type: "user",
        content: "Test content here",
      });

      expect(filename).toMatch(/^user_/);
      expect(filename.endsWith(".md")).toBe(true);

      const dir = getMemoryDir();
      const content = readFileSync(join(dir, filename), "utf-8");
      expect(content).toContain("---");
      expect(content).toContain("name: Test Memory");
      expect(content).toContain("type: user");
      expect(content).toContain("Test content here");
    });

    it("should handle different memory types", () => {
      const types: MemoryType[] = ["user", "feedback", "project", "reference"];
      for (const type of types) {
        const filename = saveMemory({
          name: `Test ${type}`,
          description: `Test ${type}`,
          type,
          content: `Content for ${type}`,
        });
        expect(filename).toMatch(new RegExp(`^${type}_`));
      }
    });
  });

  describe("deleteMemory", () => {
    it("should delete existing memory", () => {
      const filename = saveMemory({
        name: "To Delete",
        description: "Will be deleted",
        type: "project",
        content: "Delete me",
      });

      const result = deleteMemory(filename);
      expect(result).toBe(true);

      const memories = listMemories();
      const found = memories.find((m) => m.filename === filename);
      expect(found).toBeUndefined();
    });

    it("should return false for non-existent memory", () => {
      const result = deleteMemory("nonexistent.md");
      expect(result).toBe(false);
    });
  });

  describe("loadMemoryIndex", () => {
    it("should return empty string when no memories", () => {
      const index = loadMemoryIndex();
      expect(index).toBe("");
    });

    it("should return index content", () => {
      saveMemory({
        name: "Indexed Memory",
        description: "Test index",
        type: "user",
        content: "Content",
      });

      const index = loadMemoryIndex();
      expect(index).toContain("Indexed Memory");
    });
  });

  describe("recallMemories", () => {
    it("should return empty for no matches", () => {
      saveMemory({
        name: "Unrelated",
        description: "Something else",
        type: "user",
        content: "Different content",
      });

      const results = recallMemories("xyz123nonexistent");
      expect(results).toEqual([]);
    });

    it("should find memories by keyword in name", () => {
      saveMemory({
        name: "Project Setup",
        description: "How to setup",
        type: "project",
        content: "Run npm install",
      });

      const results = recallMemories("project setup");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toContain("Project");
    });

    it("should find memories by keyword in content", () => {
      saveMemory({
        name: "NPM Commands",
        description: "Node package manager",
        type: "reference",
        content: "Use npm install to install packages",
      });

      const results = recallMemories("npm install");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should limit results", () => {
      for (let i = 0; i < 10; i++) {
        saveMemory({
          name: `Memory ${i}`,
          description: `Description ${i}`,
          type: "project",
          content: `Content ${i}`,
        });
      }

      const results = recallMemories("memory", 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe("buildMemoryPromptSection", () => {
    it("should return prompt with memory system info", () => {
      const prompt = buildMemoryPromptSection();
      expect(prompt).toContain("Memory System");
      expect(prompt).toContain("Memory Types");
    });
  });
});
