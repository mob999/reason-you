import { describe, expect, test } from "bun:test";
import {
  analyzeWithOpenAI,
  analyzeWithOpenAIStream,
  buildDiagnosticPrompt,
  buildDiagnosticTextPrompt,
  effectiveOpenAIApi,
  formatDiagnosticResult,
  isMiniMaxBaseUrl,
  parseDiagnosticText,
  streamDiagnosticText,
} from "../src/llm";

describe("llm prompt", () => {
  test("builds a stable diagnostic prompt", () => {
    const prompt = buildDiagnosticPrompt({
      command: "npm test",
      cwd: "/repo",
      exitCode: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      stderr: "token=[REDACTED_SECRET]\nTypeError",
    });
    expect(prompt).toContain("Return strict JSON only");
    expect(prompt).toContain("Do not reveal reasoning");
    expect(prompt).toContain('"nextSteps":["..."]');
    expect(prompt).toContain("Command: npm test");
    expect(prompt).toContain("token=[REDACTED_SECRET]");
    expect(prompt).not.toContain("hunter2");
  });

  test("builds a streaming text prompt for terminal output", () => {
    const prompt = buildDiagnosticTextPrompt({
      command: "ls xxx",
      cwd: "/repo",
      exitCode: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      stderr: "ls: xxx: No such file or directory",
    });

    expect(prompt).toContain("Stream only the final answer");
    expect(prompt).toContain("原因:");
    expect(prompt).toContain("Do not output JSON");
  });

  test("parses the three section output shape", () => {
    const parsed = parseDiagnosticText(
      "原因\n依赖缺失。\n\n证据\nCannot find module\n\n下一步\n- npm install\n- npm test",
    );
    expect(parsed.summary).toBe("依赖缺失");
    expect(parsed.evidence).toBe("Cannot find module");
    expect(parsed.nextSteps).toEqual(["npm install", "npm test"]);
  });

  test("parses strict JSON diagnostic output", () => {
    const parsed = parseDiagnosticText(
      JSON.stringify({
        summary: "路径不存在",
        reason: "目标文件或目录不存在。",
        evidence: "stderr 显示 No such file or directory。",
        nextSteps: ["检查拼写", "运行 ls -la"],
      }),
    );

    expect(parsed).toEqual({
      summary: "路径不存在",
      reason: "目标文件或目录不存在。",
      evidence: "stderr 显示 No such file or directory。",
      nextSteps: ["检查拼写", "运行 ls -la"],
    });
  });

  test("filters model planning chatter from fallback text output", () => {
    const parsed = parseDiagnosticText(`原因
目标路径不存在。

证据
stderr 显示 No such file or directory。

下一步
- Make concise. Use Chinese. Also note: CWD is ~/reasonyou.
- The path "xxx" likely is relative, but could also be absolute.
- 检查当前目录下是否存在 xxx。
- We'll output:
`);

    expect(parsed.nextSteps).toEqual(["检查当前目录下是否存在 xxx。"]);
  });

  test("uses injected OpenAI-compatible responses client", async () => {
    const result = await analyzeWithOpenAI(
      {
        command: "npm test",
        cwd: "/repo",
        exitCode: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        stderr: "TypeError",
      },
      {
        model: "gpt-5",
        baseUrl: "https://example.test/v1",
        openaiApi: "responses",
        language: "zh-CN",
        redact: true,
        historyLimit: 50,
      },
      {
        redacted: true,
        client: {
          responses: {
            create: async (input) => {
              expect(input.model).toBe("gpt-5");
              return {
                output_text: JSON.stringify({
                  summary: "测试失败",
                  reason: "测试运行失败。",
                  evidence: "stderr 包含 TypeError。",
                  nextSteps: ["修复类型"],
                }),
              };
            },
          },
        },
      },
    );

    expect(result.summary).toBe("测试失败");
    expect(result.redacted).toBe(true);
  });

  test("uses chat completions for OpenAI-compatible providers", async () => {
    const result = await analyzeWithOpenAI(
      {
        command: "npm test",
        cwd: "/repo",
        exitCode: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        stderr: "TypeError",
      },
      {
        model: "third-party-model",
        baseUrl: "https://example.test/v1",
        openaiApi: "chat",
        language: "zh-CN",
        redact: true,
        historyLimit: 50,
      },
      {
        redacted: true,
        client: {
          responses: {
            create: async () => {
              throw new Error("responses should not be used");
            },
          },
          chat: {
            completions: {
              create: async (input) => {
                expect(input.model).toBe("third-party-model");
                expect(input.messages[0]?.content).toContain("TypeError");
                expect("reasoning_split" in input).toBe(false);
                return {
                  choices: [
                    {
                      message: {
                        content:
                          '{"summary":"第三方接口可用","reason":"第三方接口可用。","evidence":"TypeError","nextSteps":["继续"]}',
                      },
                    },
                  ],
                };
              },
            },
          },
        },
      },
    );

    expect(result.summary).toBe("第三方接口可用");
  });

  test("collects responses streaming output", async () => {
    const result = await analyzeWithOpenAIStream(
      {
        command: "ls xxx",
        cwd: "/repo",
        exitCode: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        stderr: "ls: xxx: No such file or directory",
      },
      {
        model: "gpt-5",
        openaiApi: "responses",
        language: "zh-CN",
        redact: true,
        historyLimit: 50,
      },
      {
        redacted: true,
        client: {
          responses: {
            create: async () =>
              streamChunks([
                {
                  type: "response.output_text.delta",
                  delta: '{"summary":"路径',
                },
                {
                  type: "response.output_text.delta",
                  delta: '不存在","reason":"目标不存在。",',
                },
                {
                  type: "response.output_text.delta",
                  delta: '"evidence":"stderr","nextSteps":["检查路径"]}',
                },
              ]) as never,
          },
        },
      },
    );

    expect(result.summary).toBe("路径不存在");
    expect(result.nextSteps).toEqual(["检查路径"]);
  });

  test("collects chat streaming output", async () => {
    const result = await analyzeWithOpenAIStream(
      {
        command: "ls xxx",
        cwd: "/repo",
        exitCode: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        stderr: "ls: xxx: No such file or directory",
      },
      {
        model: "third-party-model",
        openaiApi: "chat",
        language: "zh-CN",
        redact: true,
        historyLimit: 50,
      },
      {
        redacted: true,
        client: {
          responses: {
            create: async () => {
              throw new Error("responses should not be used");
            },
          },
          chat: {
            completions: {
              create: async () =>
                streamChunks([
                  { choices: [{ delta: { content: '{"summary":"路径' } }] },
                  {
                    choices: [
                      {
                        delta: { content: '不存在","reason":"目标不存在。",' },
                      },
                    ],
                  },
                  {
                    choices: [
                      {
                        delta: {
                          content:
                            '"evidence":"stderr","nextSteps":["检查路径"]}',
                        },
                      },
                    ],
                  },
                ]) as never,
            },
          },
        },
      },
    );

    expect(result.summary).toBe("路径不存在");
    expect(result.nextSteps).toEqual(["检查路径"]);
  });

  test("streams terminal text deltas directly", async () => {
    const deltas: string[] = [];

    await streamDiagnosticText(
      {
        command: "ls xxx",
        cwd: "/repo",
        exitCode: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        stderr: "ls: xxx: No such file or directory",
      },
      {
        model: "third-party-model",
        openaiApi: "chat",
        language: "zh-CN",
        redact: true,
        historyLimit: 50,
      },
      {
        onDelta: (text) => {
          deltas.push(text);
        },
        client: {
          responses: {
            create: async () => {
              throw new Error("responses should not be used");
            },
          },
          chat: {
            completions: {
              create: async (input) => {
                expect(input.messages[0]?.content).toContain("原因:");
                return streamChunks([
                  { choices: [{ delta: { content: "原因:\n" } }] },
                  { choices: [{ delta: { content: "目标不存在。\n" } }] },
                ]) as never;
              },
            },
          },
        },
      },
    );

    expect(deltas.join("")).toBe("原因:\n目标不存在。\n");
  });

  test("auto-detects MiniMax and hides thinking content without thinking params", async () => {
    expect(isMiniMaxBaseUrl("https://api.minimax.io/v1")).toBe(true);
    expect(
      effectiveOpenAIApi({
        model: "minimax-text",
        baseUrl: "https://api.minimax.io/v1",
        openaiApi: "auto",
        language: "zh-CN",
        redact: true,
        historyLimit: 50,
      }),
    ).toBe("chat");

    await streamDiagnosticText(
      {
        command: "ls xxx",
        cwd: "/repo",
        exitCode: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        stderr: "ls: xxx: No such file or directory",
      },
      {
        model: "minimax-text",
        baseUrl: "https://api.minimax.io/v1",
        openaiApi: "auto",
        language: "zh-CN",
        redact: true,
        historyLimit: 50,
      },
      {
        onDelta: (text) => {
          expect(text).not.toContain("<think>");
        },
        client: {
          responses: {
            create: async () => {
              throw new Error("responses should not be used");
            },
          },
          chat: {
            completions: {
              create: async (input) => {
                expect("reasoning_split" in input).toBe(false);
                expect("enable_thinking" in input).toBe(false);
                return streamChunks([
                  { choices: [{ delta: { reasoning_content: "hidden" } }] },
                  { choices: [{ delta: { content: "<think>hidden" } }] },
                  {
                    choices: [
                      { delta: { content: "</think>原因:\n目标不存在。" } },
                    ],
                  },
                ]) as never;
              },
            },
          },
        },
      },
    );
  });

  test("removes think tags before parsing JSON output", () => {
    const parsed = parseDiagnosticText(
      '<think>hidden</think>{"summary":"ok","reason":"正文","evidence":"stderr","nextSteps":["继续"]}',
    );

    expect(parsed.reason).toBe("正文");
  });

  test("formats diagnostics for terminal output", () => {
    expect(
      formatDiagnosticResult({
        reason: "目标不存在。",
        evidence: "stderr 显示 No such file or directory。",
        nextSteps: ["检查路径"],
      }),
    ).toBe(
      "原因:\n目标不存在。\n\n证据:\nstderr 显示 No such file or directory。\n\n下一步:\n- 检查路径\n",
    );
  });
});

async function* streamChunks(chunks: Array<Record<string, unknown>>) {
  for (const chunk of chunks) {
    yield chunk;
  }
}
