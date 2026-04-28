import { describe, expect, test } from "bun:test";
import {
  analyzeWithOpenAI,
  buildDiagnosticPrompt,
  parseDiagnosticText,
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
    expect(prompt).toContain("原因、证据、下一步");
    expect(prompt).toContain("Command: npm test");
    expect(prompt).toContain("token=[REDACTED_SECRET]");
    expect(prompt).not.toContain("hunter2");
  });

  test("parses the three section output shape", () => {
    const parsed = parseDiagnosticText(
      "原因\n依赖缺失。\n\n证据\nCannot find module\n\n下一步\n- npm install\n- npm test",
    );
    expect(parsed.summary).toBe("依赖缺失");
    expect(parsed.evidence).toBe("Cannot find module");
    expect(parsed.nextSteps).toEqual(["npm install", "npm test"]);
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
                output_text:
                  "原因\n测试失败。\n\n证据\nTypeError\n\n下一步\n- 修复类型",
              };
            },
          },
        },
      },
    );

    expect(result.summary).toBe("测试失败");
    expect(result.redacted).toBe(true);
  });
});
