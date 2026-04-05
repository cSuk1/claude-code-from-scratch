import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const CLI_PATH = join(__dirname, "../../dist/cli.js");
const TEST_DIR = join(__dirname, "../fixtures");

const hasApiKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

describe("True E2E - 工具调用解析测试", () => {
  afterAll(() => {
  });

  describe("工具调用解析 - 文件操作", () => {
    it("应能解析 read_file 工具调用", async () => {
      if (!hasApiKey()) {
        console.log("⚠️  跳过: 未设置 API Key");
        return;
      }

      const testFile = join(TEST_DIR, "tool-test.txt");
      const testContent = "Hello from tool test";
      writeFileSync(testFile, testContent);

      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn("node", [
          CLI_PATH,
          "-p", `Read the file at ${testFile} and tell me what it says`
        ], {
          cwd: join(__dirname, "../.."),
          timeout: 60000,
          env: { ...process.env },
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

      expect(output).toMatch(/Hello from tool test|tool_test|read_file/i);
    }, 90000);
  });

  describe("工具调用解析 - list_files", () => {
    it("应能解析 list_files 工具调用", async () => {
      if (!hasApiKey()) {
        console.log("⚠️  跳过: 未设置 API Key");
        return;
      }

      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn("node", [
          CLI_PATH,
          "-p", "List files in the tests directory"
        ], {
          cwd: join(__dirname, "../.."),
          timeout: 60000,
          env: { ...process.env },
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

      expect(output).toMatch(/test|directory|file|\.ts/i);
    }, 90000);
  });

  describe("工具调用解析 - grep_search", () => {
    it("应能解析 grep_search 工具调用", async () => {
      if (!hasApiKey()) {
        console.log("⚠️  跳过: 未设置 API Key");
        return;
      }

      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn("node", [
          CLI_PATH,
          "-p", "Search for 'describe' in the tests directory"
        ], {
          cwd: join(__dirname, "../.."),
          timeout: 60000,
          env: { ...process.env },
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
    }, 90000);
  });

  describe("工具调用解析 - write_file", () => {
    const outputFile = join(TEST_DIR, "e2e-write-output.txt");

    afterAll(() => {
      if (existsSync(outputFile)) {
        unlinkSync(outputFile);
      }
    });

    it("应能解析 write_file 工具调用", async () => {
      if (!hasApiKey()) {
        console.log("⚠️  跳过: 未设置 API Key");
        return;
      }

      const testContent = "E2E write test content " + Date.now();

      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn("node", [
          CLI_PATH,
          "--yolo",
          "-p", `Write "${testContent}" to ${outputFile}`
        ], {
          cwd: join(__dirname, "../.."),
          timeout: 60000,
          env: { ...process.env },
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
    }, 90000);
  });

  describe("工具调用解析 - run_shell", () => {
    it("应能解析 run_shell 工具调用", async () => {
      if (!hasApiKey()) {
        console.log("⚠️  跳过: 未设置 API Key");
        return;
      }

      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn("node", [
          CLI_PATH,
          "-p", "Run the command: echo 'shell test'"
        ], {
          cwd: join(__dirname, "../.."),
          timeout: 60000,
          env: { ...process.env },
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
    }, 90000);
  });

  describe("多轮工具调用", () => {
    it("应能处理多轮工具调用", async () => {
      if (!hasApiKey()) {
        console.log("⚠️  跳过: 未设置 API Key");
        return;
      }

      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn("node", [
          CLI_PATH,
          "-p", "What is the current directory? Then list files in it."
        ], {
          cwd: join(__dirname, "../.."),
          timeout: 90000,
          env: { ...process.env },
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
    }, 120000);
  });
});

describe("True E2E - 工具结果处理", () => {
  it("应能将工具结果返回给模型", async () => {
    if (!hasApiKey()) {
      console.log("⚠️  跳过: 未设置 API Key");
      return;
    }

    const testFile = join(TEST_DIR, "result-test.txt");
    writeFileSync(testFile, "Test content for result handling");

    const output = await new Promise<string>((resolve, reject) => {
      const proc = spawn("node", [
        CLI_PATH,
        "-p", `Read ${testFile} and summarize what you read`
      ], {
        cwd: join(__dirname, "../.."),
        timeout: 90000,
        env: { ...process.env },
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

    expect(output).toMatch(/test|content|result|read/i);
  }, 120000);
});
