import { dirname } from "node:path";
import { configPath } from "./paths";
import type { OpenAIApiMode, Provider, ReasonYouConfig } from "./types";

export const DEFAULT_CONFIG: ReasonYouConfig = {
  provider: undefined,
  apiKey: undefined,
  model: "gpt-5",
  baseUrl: undefined,
  openaiApi: "auto",
  language: "zh-CN",
  redact: true,
  rerun: false,
  displayThinking: false,
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
    ...definedConfig(overrides),
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

export async function writeConfig(
  config: Partial<ReasonYouConfig>,
): Promise<ReasonYouConfig> {
  const next = normalizePartialConfig(config);
  await Bun.$`mkdir -p ${dirname(configPath())}`.quiet();
  await Bun.write(configPath(), `${JSON.stringify(next, null, 2)}\n`);
  return loadConfig();
}

export function configFromEnv(env = process.env): Partial<ReasonYouConfig> {
  return normalizePartialConfig({
    apiKey: env.REASONYOU_API_KEY ?? env.OPENAI_API_KEY,
    provider: env.REASONYOU_PROVIDER as Provider | undefined,
    model: env.REASONYOU_MODEL,
    baseUrl: env.REASONYOU_BASE_URL ?? env.OPENAI_BASE_URL,
    openaiApi: env.REASONYOU_OPENAI_API as OpenAIApiMode | undefined,
    language: env.REASONYOU_LANGUAGE,
    redact: env.REASONYOU_REDACT
      ? parseBoolean(env.REASONYOU_REDACT)
      : undefined,
    rerun: env.REASONYOU_RERUN ? parseBoolean(env.REASONYOU_RERUN) : undefined,
    displayThinking: env.REASONYOU_DISPLAY_THINKING
      ? parseBoolean(env.REASONYOU_DISPLAY_THINKING)
      : undefined,
    historyLimit: env.REASONYOU_HISTORY_LIMIT
      ? Number.parseInt(env.REASONYOU_HISTORY_LIMIT, 10)
      : undefined,
  });
}

function normalizeConfig(config: ReasonYouConfig): ReasonYouConfig {
  return {
    provider: provider(config.provider),
    apiKey: optionalSecret(config.apiKey),
    model: nonEmpty(config.model, DEFAULT_CONFIG.model),
    baseUrl: optionalUrl(config.baseUrl),
    openaiApi: openaiApiMode(config.openaiApi),
    language: nonEmpty(config.language, DEFAULT_CONFIG.language),
    redact: Boolean(config.redact),
    rerun: Boolean(config.rerun),
    displayThinking: Boolean(config.displayThinking),
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
  if (config.provider !== undefined) next.provider = provider(config.provider);
  if (config.apiKey !== undefined) next.apiKey = optionalSecret(config.apiKey);
  if (config.model !== undefined)
    next.model = nonEmpty(config.model, DEFAULT_CONFIG.model);
  if (config.baseUrl !== undefined) next.baseUrl = optionalUrl(config.baseUrl);
  if (config.openaiApi !== undefined)
    next.openaiApi = openaiApiMode(config.openaiApi);
  if (config.language !== undefined)
    next.language = nonEmpty(config.language, DEFAULT_CONFIG.language);
  if (config.redact !== undefined) next.redact = Boolean(config.redact);
  if (config.rerun !== undefined) next.rerun = Boolean(config.rerun);
  if (config.displayThinking !== undefined)
    next.displayThinking = Boolean(config.displayThinking);
  if (config.historyLimit !== undefined)
    next.historyLimit = positiveInteger(
      config.historyLimit,
      DEFAULT_CONFIG.historyLimit,
    );
  return next;
}

function definedConfig(
  config: Partial<ReasonYouConfig>,
): Partial<ReasonYouConfig> {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  ) as Partial<ReasonYouConfig>;
}

function parseConfigValue(
  key: keyof ReasonYouConfig,
  value: string,
): ReasonYouConfig[keyof ReasonYouConfig] {
  if (key === "redact" || key === "rerun" || key === "displayThinking")
    return parseBoolean(value);
  if (key === "historyLimit")
    return positiveInteger(
      Number.parseInt(value, 10),
      DEFAULT_CONFIG.historyLimit,
    );
  return value;
}

function provider(value: Provider | undefined): Provider | undefined {
  return value === "minimax-intl" ||
    value === "minimax-cn" ||
    value === "custom"
    ? value
    : undefined;
}

function openaiApiMode(value: OpenAIApiMode | undefined): OpenAIApiMode {
  return value === "chat" || value === "responses"
    ? value
    : DEFAULT_CONFIG.openaiApi;
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

function optionalSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
