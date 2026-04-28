import { describe, expect, test } from "bun:test";
import { redactText } from "../src/redact";

describe("redactText", () => {
  test("redacts common secrets and home paths while preserving stack traces", () => {
    const input = [
      "Error: failed",
      "    at main (/Users/alice/project/src/index.ts:10:5)",
      "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      "password=hunter2",
    ].join("\n");
    const result = redactText(input, "/Users/alice");
    expect(result.redacted).toBe(true);
    expect(result.text).toContain("at main (~/project/src/index.ts:10:5)");
    expect(result.text).toContain("[REDACTED_OPENAI_KEY]");
    expect(result.text).toContain("Bearer [REDACTED_TOKEN]");
    expect(result.text).toContain("password=[REDACTED_SECRET]");
  });
});
