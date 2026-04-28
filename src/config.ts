import { dirname } from "node:path";
import { configPath } from "./paths";
import type { ReasonYouConfig } from "./types";

export const DEFAULT_CONFIG: ReasonYouConfig = {
  model: "gpt-5",
  baseUrl: undefined,
  language: "zh-CN",
  redact: true,
  historyLimit: 50,
};

export async function loadUserConfig(
  filePath = configPath(),
): Promise<Partial<ReasonYouConfig>> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return {};
  return normalizePartialConfig(
    (await file.json()) as Partial<ReasonYouConfig>,
  );
}

export async function loadConfig(
  overrides: Partial<ReasonYouConfig> = {},
): Promise<ReasonYouConfig> {
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    ...(await loadUserConfig()),
    ...configFromEnv(),
    ...overrides,
  });
}

export async function writeConfigValue(
  key: keyof ReasonYouConfig,
  value: string,
): Promise<ReasonYouConfig> {
  const current = await loadUserConfig();
  const next = normalizePartialConfig({
    ...current,
    [key]: parseConfigValue(key, value),
  });
  await Bun.$`mkdir -p ${dirname(configPath())}`.quiet();
  await Bun.write(configPath(), `${JSON.stringify(next, null, 2)}\n`);
  return loadConfig();
}

export function configFromEnv(env = process.env): Partial<ReasonYouConfig> {
  return normalizePartialConfig({
    model: env.REASONYOU_MODEL,
    baseUrl: env.REASONYOU_BASE_URL ?? env.OPENAI_BASE_URL,
    language: env.REASONYOU_LANGUAGE,
    redact: env.REASONYOU_REDACT
      ? parseBoolean(env.REASONYOU_REDACT)
      : undefined,
    historyLimit: env.REASONYOU_HISTORY_LIMIT
      ? Number.parseInt(env.REASONYOU_HISTORY_LIMIT, 10)
      : undefined,
  });
}

function normalizeConfig(config: ReasonYouConfig): ReasonYouConfig {
  return {
    model: nonEmpty(config.model, DEFAULT_CONFIG.model),
    baseUrl: optionalUrl(config.baseUrl),
    language: nonEmpty(config.language, DEFAULT_CONFIG.language),
    redact: Boolean(config.redact),
    historyLimit: positiveInteger(
      config.historyLimit,
      DEFAULT_CONFIG.historyLimit,
    ),
  };
}

function normalizePartialConfig(
  config: Partial<ReasonYouConfig>,
): Partial<ReasonYouConfig> {
  const next: Partial<ReasonYouConfig> = {};
  if (config.model !== undefined)
    next.model = nonEmpty(config.model, DEFAULT_CONFIG.model);
  if (config.baseUrl !== undefined) next.baseUrl = optionalUrl(config.baseUrl);
  if (config.language !== undefined)
    next.language = nonEmpty(config.language, DEFAULT_CONFIG.language);
  if (config.redact !== undefined) next.redact = Boolean(config.redact);
  if (config.historyLimit !== undefined)
    next.historyLimit = positiveInteger(
      config.historyLimit,
      DEFAULT_CONFIG.historyLimit,
    );
  return next;
}

function parseConfigValue(
  key: keyof ReasonYouConfig,
  value: string,
): ReasonYouConfig[keyof ReasonYouConfig] {
  if (key === "redact") return parseBoolean(value);
  if (key === "historyLimit")
    return positiveInteger(
      Number.parseInt(value, 10),
      DEFAULT_CONFIG.historyLimit,
    );
  return value;
}

function parseBoolean(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function nonEmpty(value: string, fallback: string): string {
  return value.trim() ? value : fallback;
}

function optionalUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
