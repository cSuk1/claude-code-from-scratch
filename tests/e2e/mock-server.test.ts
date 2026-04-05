import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";

const MOCK_RESPONSE = {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created: Date.now(),
    model: "gpt-4o",
    choices: [
        {
            index: 0,
            message: {
                role: "assistant",
                content: "Hello! I'm a mock assistant.",
            },
            finish_reason: "stop",
        },
    ],
    usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
    },
};

const MOCK_STREAM_CHUNK = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"},\"index\":0,\"finish_reason\":null}]}\n\ndata: {\"choices\":[{\"delta\":{},\"index\":0,\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}\n\ndata: [DONE]\n\n";

describe("E2E - Mock API Server", () => {
    let server: http.Server;
    let port: number;

    beforeEach(async () => {
        server = http.createServer((req, res) => {
            if (req.url?.includes("/chat/completions")) {
                if (req.headers["stream"] === "true") {
                    res.writeHead(200, {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        Connection: "keep-alive",
                    });
                    res.write(MOCK_STREAM_CHUNK);
                    setTimeout(() => res.end(), 100);
                } else {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(MOCK_RESPONSE));
                }
            } else {
                res.writeHead(404);
                res.end("Not Found");
            }
        });

        await new Promise<void>((resolve) => {
            server.listen(0, () => {
                port = (server.address() as any).port;
                resolve();
            });
        });
    });

    afterEach(() => {
        server.close();
    });

    it("应能启动 Mock HTTP 服务器", () => {
        expect(port).toBeGreaterThan(0);
    });

    it("应能接收非流式响应", async () => {
        const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "Hi" }] }),
        });

        const data = await response.json();
        expect(data.choices[0].message.content).toBe("Hello! I'm a mock assistant.");
    });

    it("应能接收流式响应", async () => {
        const response = await fetch(`http://localhost:${port}/v1/chat/completions?stream=true`, {
            method: "POST",
            headers: { "Content-Type": "application/json", stream: "true" },
            body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "Hi" }], stream: true }),
        });

        expect(response.headers.get("content-type")).toContain("text/event-stream");
    });
});

describe("E2E - OpenAI Backend with Mock Server", () => {
    let server: http.Server;
    let port: number;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(async () => {
        originalEnv = { ...process.env };

        server = http.createServer((req, res) => {
            if (req.url?.includes("/chat/completions")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    id: "chatcmpl-mock",
                    object: "chat.completion",
                    created: Date.now(),
                    model: "gpt-4o",
                    choices: [{
                        index: 0,
                        message: { role: "assistant", content: "Mock response" },
                        finish_reason: "stop",
                    }],
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }));
            } else {
                res.writeHead(404);
                res.end("Not Found");
            }
        });

        await new Promise<void>((resolve) => {
            server.listen(0, () => {
                port = (server.address() as any).port;
                resolve();
            });
        });
    });

    afterEach(() => {
        server.close();
        process.env = originalEnv;
    });

    it("应能使用 Mock Server 创建 OpenAI Backend", async () => {
        const { OpenAIBackend } = await import("../../../src/backend/openai-backend.js");
        const config = {
            model: "gpt-4o",
            systemPrompt: "You are helpful.",
            tools: [],
            baseURL: `http://localhost:${port}/v1`,
            apiKey: "mock-key",
        };

        const backend = new OpenAIBackend(config, false, vi.fn());
        expect(backend.model).toBe("gpt-4o");
    });

    it("应能在 Mock Server 上执行流式请求", async () => {
        const { OpenAIBackend } = await import("../../../src/backend/openai-backend.js");

        const chunks: string[] = [];
        const emitText = (text: string) => chunks.push(text);

        const config = {
            model: "gpt-4o",
            systemPrompt: "You are helpful.",
            tools: [],
            baseURL: `http://localhost:${port}/v1`,
            apiKey: "mock-key",
        };

        const backend = new OpenAIBackend(config, false, emitText);
        backend.addUserMessage("Say hello");

        const result = await backend.stream();
        expect(result.content).toBeDefined();
    });
});

describe("E2E - Anthropic Backend with Mock Server", () => {
    let server: http.Server;
    let port: number;

    beforeEach(async () => {
        server = http.createServer((req, res) => {
            if (req.url?.includes("/messages")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    id: "msg-mock",
                    type: "message",
                    role: "assistant",
                    content: [{ type: "text", text: "Mock Anthropic response" }],
                    model: "claude-sonnet-4-20250514",
                    usage: { input_tokens: 10, output_tokens: 20 },
                }));
            } else {
                res.writeHead(404);
                res.end("Not Found");
            }
        });

        await new Promise<void>((resolve) => {
            server.listen(0, () => {
                port = (server.address() as any).port;
                resolve();
            });
        });
    });

    afterEach(() => {
        server.close();
    });

    it("应能使用 Mock Server 创建 Anthropic Backend", async () => {
        const { AnthropicBackend } = await import("../../../src/backend/anthropic-backend.js");

        const config = {
            model: "claude-sonnet-4-20250514",
            systemPrompt: "You are helpful.",
            tools: [],
            apiKey: "mock-key",
        };

        const backend = new AnthropicBackend(config, false, vi.fn());
        expect(backend.model).toBe("claude-sonnet-4-20250514");
    });
});
