import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  diagnosticCacheKey,
  getCachedDiagnostic,
  saveCachedDiagnostic,
} from "../src/cache";
import type {
  DiagnosticContext,
  DiagnosticResult,
  ReasonYouConfig,
} from "../src/types";

let tempDir: string;
let dbPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "reasonyou-cache-"));
  dbPath = join(tempDir, "reasonyou.db");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("diagnostic cache", () => {
  test("stores and loads diagnostics by context and provider settings", async () => {
    await saveCachedDiagnostic(context(), config(), diagnostic(), dbPath);

    const cached = await getCachedDiagnostic(context(), config(), dbPath);

    expect(cached).toEqual(diagnostic());
  });

  test("changes key when model changes", () => {
    expect(diagnosticCacheKey(context(), config())).not.toBe(
      diagnosticCacheKey(context(), { ...config(), model: "other-model" }),
    );
  });
});

function context(): DiagnosticContext {
  return {
    command: "ls xxx",
    cwd: "/repo",
    exitCode: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
    stderr: "ls: xxx: No such file or directory",
  };
}

function config(): ReasonYouConfig {
  return {
    provider: "custom",
    apiKey: "test-key",
    model: "test-model",
    baseUrl: "https://example.test/v1",
    openaiApi: "chat",
    language: "zh-CN",
    redact: true,
    historyLimit: 50,
  };
}

function diagnostic(): DiagnosticResult {
  return {
    summary: "路径不存在",
    reason: "目标路径不存在。",
    evidence: "stderr 显示 No such file or directory。",
    nextSteps: ["检查路径"],
    sourceCommand: "ls xxx",
    exitCode: 1,
    redacted: true,
  };
}
