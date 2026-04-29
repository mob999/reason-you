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
  delete process.env.REASONYOU_PROVIDER;
  delete process.env.REASONYOU_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.REASONYOU_MODEL;
  delete process.env.REASONYOU_BASE_URL;
  delete process.env.REASONYOU_OPENAI_API;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.REASONYOU_LANGUAGE;
  delete process.env.REASONYOU_REDACT;
  delete process.env.REASONYOU_RERUN;
  delete process.env.REASONYOU_DISPLAY_THINKING;
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
      JSON.stringify({
        model: "user-model",
        provider: "custom",
        apiKey: "user-key",
        baseUrl: "https://user.example/v1",
        openaiApi: "chat",
        rerun: true,
        displayThinking: true,
        historyLimit: 10,
      }),
      "utf8",
    );
    process.env.REASONYOU_MODEL = "env-model";
    process.env.REASONYOU_API_KEY = "env-key";
    process.env.OPENAI_BASE_URL = "https://openai-env.example/v1";
    process.env.REASONYOU_BASE_URL = "https://env.example/v1";
    const config = await loadConfig({
      model: "flag-model",
      baseUrl: "https://flag.example/v1",
    });
    expect(config.model).toBe("flag-model");
    expect(config.apiKey).toBe("env-key");
    expect(config.provider).toBe("custom");
    expect(config.baseUrl).toBe("https://flag.example/v1");
    expect(config.openaiApi).toBe("chat");
    expect(config.language).toBe("zh-CN");
    expect(config.rerun).toBe(true);
    expect(config.displayThinking).toBe(true);
    expect(config.historyLimit).toBe(10);
  });

  test("reads OPENAI_BASE_URL when project-specific env is not set", async () => {
    process.env.OPENAI_BASE_URL = "https://openai-env.example/v1";

    const config = await loadConfig();

    expect(config.baseUrl).toBe("https://openai-env.example/v1");
  });

  test("ignores undefined overrides instead of replacing defaults", async () => {
    const config = await loadConfig({
      model: undefined,
      provider: undefined,
      apiKey: undefined,
      baseUrl: undefined,
      openaiApi: undefined,
      language: undefined,
      redact: undefined,
      rerun: undefined,
      displayThinking: undefined,
      historyLimit: undefined,
    });

    expect(config.model).toBe("gpt-5");
    expect(config.provider).toBeUndefined();
    expect(config.apiKey).toBeUndefined();
    expect(config.baseUrl).toBeUndefined();
    expect(config.openaiApi).toBe("auto");
    expect(config.language).toBe("zh-CN");
    expect(config.redact).toBe(true);
    expect(config.rerun).toBe(false);
    expect(config.displayThinking).toBe(false);
    expect(config.historyLimit).toBe(50);
  });

  test("reads rerun and thinking defaults from environment", async () => {
    process.env.REASONYOU_RERUN = "true";
    process.env.REASONYOU_DISPLAY_THINKING = "yes";

    const config = await loadConfig();

    expect(config.rerun).toBe(true);
    expect(config.displayThinking).toBe(true);
  });

  test("reads chat completion mode from environment", async () => {
    process.env.REASONYOU_OPENAI_API = "chat";

    const config = await loadConfig();

    expect(config.openaiApi).toBe("chat");
  });

  test("reads OPENAI_API_KEY when project-specific key is not set", async () => {
    process.env.OPENAI_API_KEY = "openai-env-key";

    const config = await loadConfig();

    expect(config.apiKey).toBe("openai-env-key");
  });
});
