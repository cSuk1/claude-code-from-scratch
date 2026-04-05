import { describe, it, expect } from "vitest";
import { parseFrontmatter, formatFrontmatter } from "../../../src/utils/frontmatter.js";

describe("frontmatter", () => {
  describe("parseFrontmatter", () => {
    it("should return body as-is when no frontmatter", () => {
      const result = parseFrontmatter("Just some plain text content.");
      expect(result.meta).toEqual({});
      expect(result.body).toBe("Just some plain text content.");
    });

    it("should return body as-is when only one delimiter", () => {
      const result = parseFrontmatter("---only start");
      expect(result.meta).toEqual({});
      expect(result.body).toBe("---only start");
    });

    it("should parse simple frontmatter", () => {
      const input = `---
name: Test Memory
description: A test description
type: user
---
Body content here.`;
      const result = parseFrontmatter(input);

      expect(result.meta).toEqual({
        name: "Test Memory",
        description: "A test description",
        type: "user",
      });
      expect(result.body).toBe("Body content here.");
    });

    it("should handle empty meta", () => {
      const input = `---
---
Body content.`;
      const result = parseFrontmatter(input);
      expect(result.meta).toEqual({});
      expect(result.body).toBe("Body content.");
    });

    it("should handle meta with empty values", () => {
      const input = `---
name:
description: Has value
---
Body.`;
      const result = parseFrontmatter(input);
      expect(result.meta.name).toBe("");
      expect(result.meta.description).toBe("Has value");
    });

    it("should handle body with leading/trailing whitespace", () => {
      const input = `---
name: Test
---
  Body with whitespace  `;
      const result = parseFrontmatter(input);
      expect(result.body).toBe("Body with whitespace");
    });

    it("should handle multiline body", () => {
      const input = `---
name: Test
---
Line 1
Line 2
Line 3`;
      const result = parseFrontmatter(input);
      expect(result.body).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should handle keys without values on same line", () => {
      const input = `---
name: value
: invalid key
another: valid
---
Body`;
      const result = parseFrontmatter(input);
      expect(result.meta.name).toBe("value");
      expect(result.meta.another).toBe("valid");
    });
  });

  describe("formatFrontmatter", () => {
    it("should format frontmatter with meta and body", () => {
      const meta = {
        name: "Test Memory",
        description: "A test",
        type: "user",
      };
      const body = "This is the body content.";

      const result = formatFrontmatter(meta, body);

      expect(result).toContain("---");
      expect(result).toContain("name: Test Memory");
      expect(result).toContain("description: A test");
      expect(result).toContain("type: user");
      expect(result).toContain("This is the body content.");
    });

    it("should handle empty meta", () => {
      const result = formatFrontmatter({}, "Body only");
      const lines = result.split("\n");
      expect(lines[0]).toBe("---");
      expect(lines[1]).toBe("---");
      expect(lines[3]).toBe("Body only");
    });

    it("should handle special characters in values", () => {
      const meta = { name: "Test: with colon" };
      const result = formatFrontmatter(meta, "Body");
      expect(result.includes("name: Test: with colon")).toBe(true);
    });
  });

  describe("roundtrip", () => {
    it("should parse and format back correctly", () => {
      const original = `---
name: Roundtrip Test
description: Testing roundtrip
type: project
---
This is the body content.`;

      const parsed = parseFrontmatter(original);
      const formatted = formatFrontmatter(parsed.meta, parsed.body);

      expect(formatted.includes("name: Roundtrip Test")).toBe(true);
      expect(formatted.includes("description: Testing roundtrip")).toBe(true);
      expect(formatted.includes("type: project")).toBe(true);
      expect(formatted.includes("This is the body content.")).toBe(true);
    });
  });
});
