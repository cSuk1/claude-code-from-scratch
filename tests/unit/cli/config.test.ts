import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfigFile, type ApiConfig, type ConfigFile } from "../../../src/cli/config.js";

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

vi.mock("process", () => ({
  exit: vi.fn(),
  cwd: vi.fn().mockReturnValue("/test"),
}));

describe("CLI Config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadConfigFile", () => {
    it("should return null when config file does not exist", () => {
      const result = loadConfigFile();
      expect(result).toBeNull();
    });
  });
});

describe("ApiConfig interface", () => {
  it("should have correct shape", () => {
    const config: ApiConfig = {
      apiKey: "sk-key",
      apiBase: "https://api.example.com",
      useOpenAI: true,
    };

    expect(config.apiKey).toBe("sk-key");
    expect(config.apiBase).toBe("https://api.example.com");
    expect(config.useOpenAI).toBe(true);
  });

  it("should allow optional fields", () => {
    const config: ApiConfig = {
      apiKey: "sk-key",
      useOpenAI: false,
    };

    expect(config).toBeDefined();
  });
});

describe("ConfigFile interface", () => {
  it("should have correct shape", () => {
    const config: ConfigFile = {
      api: {
        provider: "anthropic",
        apiKey: "sk-key",
        baseUrl: "https://api.anthropic.com",
      },
      models: {
        pro: "gpt-4o",
        lite: "gpt-4o-mini",
        mini: "gpt-4o-mini",
      },
    };

    expect(config.api?.provider).toBe("anthropic");
    expect(config.models?.pro).toBe("gpt-4o");
  });

  it("should allow additional properties", () => {
    const config: ConfigFile = {
      permissionMode: "default",
      tools: {
        read_file: "allow",
        write_file: "ask",
      },
    };

    expect(config.permissionMode).toBe("default");
  });
});
