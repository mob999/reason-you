import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";

let tempDir: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(async () => {
  originalEnv = { ...process.env };
  tempDir = await mkdtemp(join(tmpdir(), "reasonyou-config-"));
  process.env.REASONYOU_CONFIG_PATH = join(tempDir, "config.json");
  delete process.env.REASONYOU_MODEL;
  delete process.env.REASONYOU_LANGUAGE;
  delete process.env.REASONYOU_REDACT;
  delete process.env.REASONYOU_HISTORY_LIMIT;
});

afterEach(async () => {
  process.env = originalEnv;
  await rm(tempDir, { recursive: true, force: true });
});

describe("config", () => {
  test("applies default, user config, env, and flag precedence", async () => {
    await writeFile(
      join(tempDir, "config.json"),
      JSON.stringify({ model: "user-model", historyLimit: 10 }),
      "utf8",
    );
    process.env.REASONYOU_MODEL = "env-model";
    const config = await loadConfig({ model: "flag-model" });
    expect(config.model).toBe("flag-model");
    expect(config.language).toBe("zh-CN");
    expect(config.historyLimit).toBe(10);
  });
});
