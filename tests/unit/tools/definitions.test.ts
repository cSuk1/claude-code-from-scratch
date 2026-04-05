import { describe, it, expect } from "vitest";
import {
    toolDefinitions,
    getToolMetadata,
    getToolCategory,
    isParallelSafe,
    isIdempotent,
    READ_TOOLS,
    WRITE_TOOLS,
    EXEC_TOOLS,
    AGENT_TOOLS,
} from "../../../src/tools/definitions.js";

describe("toolDefinitions", () => {
    it("should have all expected tools", () => {
        const toolNames = toolDefinitions.map((t) => t.name);
        expect(toolNames).toContain("read_file");
        expect(toolNames).toContain("write_file");
        expect(toolNames).toContain("edit_file");
        expect(toolNames).toContain("list_files");
        expect(toolNames).toContain("grep_search");
        expect(toolNames).toContain("run_shell");
        expect(toolNames).toContain("skill");
        expect(toolNames).toContain("agent");
        expect(toolNames).toContain("task_create");
        expect(toolNames).toContain("task_update");
        expect(toolNames).toContain("task_list");
        expect(toolNames).toContain("web_search");
        expect(toolNames).toContain("ask_user");
    });

    it("should have valid input_schema for all tools", () => {
        for (const tool of toolDefinitions) {
            expect(tool.input_schema).toBeDefined();
            expect(tool.input_schema.type).toBe("object");
            expect(tool.input_schema.properties).toBeDefined();
        }
    });

    it("should have metadata for all tools", () => {
        for (const tool of toolDefinitions) {
            expect(tool.metadata).toBeDefined();
            expect(tool.metadata.category).toBeDefined();
            expect(typeof tool.metadata.parallelSafe).toBe("boolean");
            expect(typeof tool.metadata.idempotent).toBe("boolean");
        }
    });
});

describe("getToolMetadata", () => {
    it("should return metadata for valid tool", () => {
        const metadata = getToolMetadata("read_file");
        expect(metadata).toBeDefined();
        expect(metadata?.category).toBe("read");
        expect(metadata?.parallelSafe).toBe(true);
        expect(metadata?.idempotent).toBe(true);
    });

    it("should return undefined for invalid tool", () => {
        const metadata = getToolMetadata("nonexistent_tool");
        expect(metadata).toBeUndefined();
    });
});

describe("getToolCategory", () => {
    it("should return correct category for read tools", () => {
        expect(getToolCategory("read_file")).toBe("read");
        expect(getToolCategory("list_files")).toBe("read");
        expect(getToolCategory("grep_search")).toBe("read");
        expect(getToolCategory("web_search")).toBe("read");
    });

    it("should return correct category for write tools", () => {
        expect(getToolCategory("write_file")).toBe("write");
        expect(getToolCategory("edit_file")).toBe("write");
    });

    it("should return correct category for exec tools", () => {
        expect(getToolCategory("run_shell")).toBe("exec");
    });

    it("should return correct category for agent tools", () => {
        expect(getToolCategory("skill")).toBe("agent");
        expect(getToolCategory("agent")).toBe("agent");
        expect(getToolCategory("ask_user")).toBe("agent");
    });

    it("should return undefined for invalid tool", () => {
        expect(getToolCategory("invalid")).toBeUndefined();
    });
});

describe("isParallelSafe", () => {
    it("should return true for parallel safe tools", () => {
        expect(isParallelSafe("read_file")).toBe(true);
        expect(isParallelSafe("list_files")).toBe(true);
        expect(isParallelSafe("grep_search")).toBe(true);
    });

    it("should return false for non-parallel safe tools", () => {
        expect(isParallelSafe("write_file")).toBe(false);
        expect(isParallelSafe("edit_file")).toBe(false);
        expect(isParallelSafe("run_shell")).toBe(false);
    });

    it("should return false for invalid tool", () => {
        expect(isParallelSafe("invalid")).toBe(false);
    });
});

describe("isIdempotent", () => {
    it("should return true for idempotent tools", () => {
        expect(isIdempotent("read_file")).toBe(true);
        expect(isIdempotent("list_files")).toBe(true);
        expect(isIdempotent("grep_search")).toBe(true);
    });

    it("should return false for non-idempotent tools", () => {
        expect(isIdempotent("write_file")).toBe(false);
        expect(isIdempotent("edit_file")).toBe(false);
        expect(isIdempotent("run_shell")).toBe(false);
    });

    it("should return false for invalid tool", () => {
        expect(isIdempotent("invalid")).toBe(false);
    });
});

describe("Tool sets", () => {
    it("READ_TOOLS should contain all read tools", () => {
        expect(READ_TOOLS.has("read_file")).toBe(true);
        expect(READ_TOOLS.has("list_files")).toBe(true);
        expect(READ_TOOLS.has("grep_search")).toBe(true);
        expect(READ_TOOLS.has("web_search")).toBe(true);
    });

    it("WRITE_TOOLS should contain all write tools", () => {
        expect(WRITE_TOOLS.has("write_file")).toBe(true);
        expect(WRITE_TOOLS.has("edit_file")).toBe(true);
    });

    it("EXEC_TOOLS should contain exec tools", () => {
        expect(EXEC_TOOLS.has("run_shell")).toBe(true);
    });

    it("AGENT_TOOLS should contain agent tools", () => {
        expect(AGENT_TOOLS.has("skill")).toBe(true);
        expect(AGENT_TOOLS.has("agent")).toBe(true);
        expect(AGENT_TOOLS.has("ask_user")).toBe(true);
    });

    it("tool sets should not overlap", () => {
        const readArr = Array.from(READ_TOOLS);
        const overlap = readArr.filter((t) => WRITE_TOOLS.has(t));
        expect(overlap).toHaveLength(0);
    });
});
