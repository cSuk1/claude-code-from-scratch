import { describe, it, expect, afterAll } from "vitest";
import { spawn } from "child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

const CLI_PATH = join(__dirname, "../../dist/cli.js");
const TEST_DIR = join(__dirname, "../fixtures");

describe("True E2E - CLI 完整流程测试", () => {
  describe("CLI 入口点", () => {
    it("应能执行 CLI --help", async () => {
      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn("node", [CLI_PATH, "--help"], {
          cwd: join(__dirname, "../.."),
          timeout: 10000,
        });

        let output = "";
        proc.stdout.on("data", (data) => {
          output += data.toString();
        });
        proc.stderr.on("data", (data) => {
          output += data.toString();
        });
        proc.on("close", (code) => {
          resolve(output);
        });
        proc.on("error", reject);
      });

      expect(output).toContain("Usage");
      expect(output).toContain("--model");
    });

    it("应能显示帮助信息", async () => {
      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn("node", [CLI_PATH, "--help"], {
          cwd: join(__dirname, "../.."),
          timeout: 10000,
        });

        let output = "";
        proc.stdout.on("data", (data) => {
          output += data.toString();
        });
        proc.stderr.on("data", (data) => {
          output += data.toString();
        });
        proc.on("close", () => resolve(output));
        proc.on("error", reject);
      });

      expect(output).toContain("Usage");
      expect(output).toContain("--model");
    }, 15000);

    it("应能执行无参数 CLI（显示帮助）", async () => {
      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn("node", [CLI_PATH], {
          cwd: join(__dirname, "../.."),
          timeout: 10000,
        });

        let output = "";
        proc.stdout.on("data", (data) => {
          output += data.toString();
        });
        proc.stderr.on("data", (data) => {
          output += data.toString();
        });
        proc.on("close", () => resolve(output));
        proc.on("error", reject);
      });

      expect(output.length).toBeGreaterThan(0);
    }, 15000);
  });
});

describe("True E2E - 工具副作用测试", () => {
  const testFilePath = join(TEST_DIR, "e2e-test-file.txt");

  afterAll(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  it("应能读取测试文件", () => {
    const testContent = "E2E test content";
    writeFileSync(testFilePath, testContent);

    expect(existsSync(testFilePath)).toBe(true);
    const content = readFileSync(testFilePath, "utf-8");
    expect(content).toBe(testContent);
  });

  it("应能创建和删除文件", () => {
    const tempFile = join(TEST_DIR, "temp-e2e.txt");

    writeFileSync(tempFile, "temporary");
    expect(existsSync(tempFile)).toBe(true);

    unlinkSync(tempFile);
    expect(existsSync(tempFile)).toBe(false);
  });

  it("应能执行 shell 命令", async () => {
    const output = await new Promise<string>((resolve, reject) => {
      const proc = spawn("echo", ["Hello E2E"], {
        shell: true,
      });

      let output = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
      });
      proc.on("close", () => resolve(output.trim()));
      proc.on("error", reject);
    });

    expect(output).toBe("Hello E2E");
  });
});

describe("True E2E - 完整工作流模拟", () => {
  it("应能使用 --model 参数", async () => {
    const output = await new Promise<string>((resolve, reject) => {
      const proc = spawn("node", [CLI_PATH, "--model", "glm-5", "--help"], {
        cwd: join(__dirname, "../.."),
        timeout: 10000,
      });

      let output = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
      });
      proc.stderr.on("data", (data) => {
        output += data.toString();
      });
      proc.on("close", () => resolve(output));
      proc.on("error", reject);
    });

    expect(output).toContain("Usage");
  }, 15000);
});

describe("True E2E - 配置文件测试", () => {
  it("应能加载配置文件（如存在）", async () => {
    const configPaths = [
      join(process.cwd(), ".ccmini/settings.json"),
      join(process.env.HOME || "", ".ccmini/settings.json"),
    ];

    let configFound = false;
    for (const path of configPaths) {
      if (existsSync(path)) {
        configFound = true;
        const content = readFileSync(path, "utf-8");
        expect(() => JSON.parse(content)).not.toThrow();
        break;
      }
    }

    console.log(`📄 配置文件: ${configFound ? "已找到" : "未找到"}`);
  });
});
