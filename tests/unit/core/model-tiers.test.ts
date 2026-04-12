import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getModelForTier,
  getTierConfig,
  getAllTierConfigs,
  setTierModel,
  isTierName,
  resolveSubAgentModel,
  formatTierInfo,
  resetModelTiers,
  initModelTiers,
  type ModelTier,
} from "../../../src/core/models/model-tiers.js";

describe("model-tiers", () => {
  beforeEach(() => {
    resetModelTiers();
    initModelTiers();
  });

  describe("DEFAULT_MODELS", () => {
    it("should have default models for each tier", () => {
      expect(getModelForTier("pro")).toBeDefined();
      expect(getModelForTier("lite")).toBeDefined();
      expect(getModelForTier("mini")).toBeDefined();
    });
  });

  describe("getModelForTier", () => {
    it("should return a string for pro tier", () => {
      const model = getModelForTier("pro");
      expect(typeof model).toBe("string");
      expect(model.length).toBeGreaterThan(0);
    });

    it("should return a string for lite tier", () => {
      const model = getModelForTier("lite");
      expect(typeof model).toBe("string");
    });

    it("should return a string for mini tier", () => {
      const model = getModelForTier("mini");
      expect(typeof model).toBe("string");
    });
  });

  describe("getTierConfig", () => {
    it("should return full config for pro tier", () => {
      const config = getTierConfig("pro");
      expect(config.tier).toBe("pro");
      expect(config.model).toBeDefined();
      expect(config.description).toBeDefined();
      expect(config.source).toBeDefined();
    });

    it("should return full config for lite tier", () => {
      const config = getTierConfig("lite");
      expect(config.tier).toBe("lite");
    });

    it("should return full config for mini tier", () => {
      const config = getTierConfig("mini");
      expect(config.tier).toBe("mini");
    });
  });

  describe("getAllTierConfigs", () => {
    it("should return all tier configs", () => {
      const all = getAllTierConfigs();
      expect(all.pro).toBeDefined();
      expect(all.lite).toBeDefined();
      expect(all.mini).toBeDefined();
    });
  });

  describe("setTierModel", () => {
    it("should override model at runtime", () => {
      const original = getModelForTier("pro");
      setTierModel("pro", "gpt-4o");
      expect(getModelForTier("pro")).toBe("gpt-4o");
      setTierModel("pro", original);
    });

    it("should set source to runtime", () => {
      setTierModel("lite", "claude-3-haiku");
      const config = getTierConfig("lite");
      expect(config.source).toBe("runtime");
    });
  });

  describe("isTierName", () => {
    it("should return true for valid tier names", () => {
      expect(isTierName("pro")).toBe(true);
      expect(isTierName("lite")).toBe(true);
      expect(isTierName("mini")).toBe(true);
    });

    it("should return false for invalid tier names", () => {
      expect(isTierName("PRO")).toBe(false);
      expect(isTierName("proo")).toBe(false);
      expect(isTierName("")).toBe(false);
      expect(isTierName("default")).toBe(false);
    });
  });

  describe("resolveSubAgentModel", () => {
    it("should route explore to lite tier", () => {
      const result = resolveSubAgentModel("explore");
      expect(result.tier).toBe("lite");
    });

    it("should route plan to lite tier", () => {
      const result = resolveSubAgentModel("plan");
      expect(result.tier).toBe("lite");
    });

    it("should route general to pro tier", () => {
      const result = resolveSubAgentModel("general");
      expect(result.tier).toBe("pro");
    });

    it("should route compact to mini tier", () => {
      const result = resolveSubAgentModel("compact");
      expect(result.tier).toBe("mini");
    });

    it("should use explicit model if provided", () => {
      const result = resolveSubAgentModel("explore", "gpt-4o");
      expect(result.model).toBe("gpt-4o");
      expect(result.source).toBe("explicit-model");
    });

    it("should resolve tier name in explicit model", () => {
      const result = resolveSubAgentModel("explore", "mini");
      expect(result.tier).toBe("mini");
      expect(result.source).toBe("explicit-tier:mini");
    });

    it("should default to pro for unknown agent types", () => {
      const result = resolveSubAgentModel("unknown_type");
      expect(result.tier).toBe("pro");
    });
  });

  describe("formatTierInfo", () => {
    it("should return formatted string", () => {
      const info = formatTierInfo();
      expect(typeof info).toBe("string");
      expect(info.length).toBeGreaterThan(0);
    });
  });

  describe("resetModelTiers", () => {
    it("should reset to default models", () => {
      setTierModel("pro", "custom-model");
      resetModelTiers();
      initModelTiers();
      const config = getTierConfig("pro");
      expect(config.model).toBeDefined();
    });
  });
});
