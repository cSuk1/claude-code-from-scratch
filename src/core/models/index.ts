// Models — model capabilities, tier routing, and configuration.

// Model capabilities (context window, thinking support, output limits)
export {
  getContextWindow,
  isInternalModel,
  modelSupportsThinking,
  modelSupportsAdaptiveThinking,
  getMaxOutputTokens,
} from "./agent-model.js";

// Model tier system (pro/lite/mini hierarchy, sub-agent routing)
export {
  initModelTiers,
  getModelForTier,
  getTierConfig,
  getAllTierConfigs,
  setTierModel,
  isTierName,
  resolveSubAgentModel,
  formatTierInfo,
  resetModelTiers,
  type ModelTier,
  type ModelTierConfig,
} from "./model-tiers.js";
