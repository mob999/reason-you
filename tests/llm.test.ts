import { describe, expect, test } from "bun:test";
import { buildDiagnosticPrompt, parseDiagnosticText } from "../src/llm";

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
});
