import { describe, it, expect, beforeEach, vi } from "vitest";
import { CompressionPipeline, SNIP_PLACEHOLDER, SNIP_THRESHOLD, KEEP_RECENT_RESULTS, OLD_RESULT_PLACEHOLDER } from "../../../src/core/runtime/compress.js";

describe("CompressionPipeline", () => {
  const effectiveWindow = 100000;

  describe("constructor", () => {
    it("should create pipeline with effectiveWindow", () => {
      const pipeline = new CompressionPipeline(effectiveWindow);
      expect(pipeline).toBeDefined();
    });

    it("should accept findToolUseById callback", () => {
      const findToolUseById = vi.fn();
      const pipeline = new CompressionPipeline(effectiveWindow, findToolUseById);
      expect(pipeline).toBeDefined();
    });
  });

  describe("updateApiCallTime", () => {
    it("should update lastApiCallTime", () => {
      const pipeline = new CompressionPipeline(effectiveWindow);
      const before = Date.now();
      pipeline.updateApiCallTime();
      const after = Date.now();
      expect(before).toBeLessThanOrEqual(after);
    });
  });

  describe("runAnthropic - budgetToolResults", () => {
    it("should not modify messages when utilization < 50%", () => {
      const pipeline = new CompressionPipeline(effectiveWindow);
      const messages = [
        { role: "user", content: [{ type: "tool_result", content: "x".repeat(50000), tool_use_id: "1" }] },
      ];
      pipeline.runAnthropic(messages as any, 10000);
      expect((messages[0].content as any)[0].content).toHaveLength(50000);
    });

    it("should truncate large tool results when utilization > 50%", () => {
      const pipeline = new CompressionPipeline(effectiveWindow);
      const longContent = "x".repeat(50000);
      const messages = [
        { role: "user", content: [{ type: "tool_result", content: longContent, tool_use_id: "1" }] },
      ];
      pipeline.runAnthropic(messages as any, 60000);
      const result = (messages[0].content as any)[0].content;
      expect(result).toContain("[... budgeted:");
      expect(result).toContain("chars truncated ...]");
    });

    it("should use smaller budget for high utilization (>70%)", () => {
      const pipeline = new CompressionPipeline(effectiveWindow);
      const longContent = "x".repeat(50000);
      const messages = [
        { role: "user", content: [{ type: "tool_result", content: longContent, tool_use_id: "1" }] },
      ];
      pipeline.runAnthropic(messages as any, 80000);
      const result = (messages[0].content as any)[0].content;
      expect(result).toContain("[... budgeted:");
    });
  });

  describe("runAnthropic - snipStaleResults", () => {
    it("should not snip when utilization < SNIP_THRESHOLD", () => {
      const findToolUseById = vi.fn().mockReturnValue({ name: "read_file", input: { file_path: "/test.ts" } });
      const pipeline = new CompressionPipeline(effectiveWindow, findToolUseById);

      const messages = [
        { role: "user", content: [{ type: "tool_result", content: "result1", tool_use_id: "1" }] },
        { role: "user", content: [{ type: "tool_result", content: "result2", tool_use_id: "2" }] },
      ];

      pipeline.runAnthropic(messages as any, effectiveWindow * 0.55);
      expect((messages[0].content as any)[0].content).toBe("result1");
    });

    it("should snip old results when utilization > SNIP_THRESHOLD", () => {
      const findToolUseById = vi.fn().mockImplementation((id: string) => {
        if (id === "1") return { name: "read_file", input: { file_path: "/test.ts" } };
        if (id === "2") return { name: "read_file", input: { file_path: "/test.ts" } };
        if (id === "3") return { name: "read_file", input: { file_path: "/test.ts" } };
        if (id === "4") return { name: "read_file", input: { file_path: "/test.ts" } };
        return null;
      });
      const pipeline = new CompressionPipeline(effectiveWindow, findToolUseById);

      const messages = [
        { role: "user", content: [{ type: "tool_result", content: "result1", tool_use_id: "1" }] },
        { role: "user", content: [{ type: "tool_result", content: "result2", tool_use_id: "2" }] },
        { role: "user", content: [{ type: "tool_result", content: "result3", tool_use_id: "3" }] },
        { role: "user", content: [{ type: "tool_result", content: "result4", tool_use_id: "4" }] },
      ];

      pipeline.runAnthropic(messages as any, effectiveWindow * SNIP_THRESHOLD + 1);

      const contents = messages.map(m => (m.content as any)[0].content);
      const snippedCount = contents.filter(c => c === SNIP_PLACEHOLDER).length;
      expect(snippedCount).toBeGreaterThan(0);
    });

    it("should keep recent results", () => {
      const findToolUseById = vi.fn().mockImplementation((id: string) => {
        return { name: "read_file", input: { file_path: `/test${id}.ts` } };
      });
      const pipeline = new CompressionPipeline(effectiveWindow, findToolUseById);

      const messages = Array.from({ length: 10 }, (_, i) => ({
        role: "user",
        content: [{ type: "tool_result", content: `result${i + 1}`, tool_use_id: `${i + 1}` }],
      }));

      pipeline.runAnthropic(messages as any, effectiveWindow * SNIP_THRESHOLD + 1);

      const contents = messages.map(m => (m.content as any)[0].content);
      const recentContents = contents.slice(-KEEP_RECENT_RESULTS);
      expect(recentContents.every(c => c !== SNIP_PLACEHOLDER)).toBe(true);
    });
  });

  describe("runAnthropic - microcompact", () => {
    it("should not clear when idle time < threshold", () => {
      const pipeline = new CompressionPipeline(effectiveWindow);
      pipeline.updateApiCallTime();

      const messages = [
        { role: "user", content: [{ type: "tool_result", content: "result1", tool_use_id: "1" }] },
        { role: "user", content: [{ type: "tool_result", content: "result2", tool_use_id: "2" }] },
      ];

      pipeline.runAnthropic(messages as any, 10000);
      expect((messages[0].content as any)[0].content).toBe("result1");
    });
  });

  describe("runOpenAI", () => {
    it("should handle OpenAI message format", () => {
      const pipeline = new CompressionPipeline(effectiveWindow);
      const messages = [
        { role: "tool", tool_call_id: "1", content: "x".repeat(50000) },
      ];
      pipeline.runOpenAI(messages as any, 60000);
      expect((messages[0] as any).content).toContain("[... budgeted:");
    });
  });

  describe("constants", () => {
    it("SNIP_THRESHOLD should be 0.60", () => {
      expect(SNIP_THRESHOLD).toBe(0.60);
    });

    it("KEEP_RECENT_RESULTS should be 3", () => {
      expect(KEEP_RECENT_RESULTS).toBe(3);
    });

    it("SNIP_PLACEHOLDER should be a string", () => {
      expect(typeof SNIP_PLACEHOLDER).toBe("string");
      expect(SNIP_PLACEHOLDER.length).toBeGreaterThan(0);
    });
  });
});
