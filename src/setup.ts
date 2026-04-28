import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { configPath } from "./paths";
import { writeConfig } from "./config";
import type { OpenAIApiMode, Provider, ReasonYouConfig } from "./types";

type ProviderPreset = {
  provider: Provider;
  label: string;
  baseUrl: string;
  model: string;
  openaiApi: OpenAIApiMode;
};

const PROVIDERS: ProviderPreset[] = [
  {
    provider: "minimax-intl",
    label: "MiniMax 国际版",
    baseUrl: "https://api.minimax.io/v1",
    model: "MiniMax-M2.7",
    openaiApi: "chat",
  },
  {
    provider: "minimax-cn",
    label: "MiniMax 国内版",
    baseUrl: "https://api.minimaxi.com/v1",
    model: "MiniMax-M2.7",
    openaiApi: "chat",
  },
  {
    provider: "custom",
    label: "自定义 OpenAI-compatible",
    baseUrl: "",
    model: "",
    openaiApi: "chat",
  },
];

export function needsInteractiveConfig(config: ReasonYouConfig): boolean {
  return !config.apiKey || !config.baseUrl || !config.provider;
}

export function maskedSecret(value: string | undefined): string {
  if (!value) return "未配置";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function ensureInteractiveConfig(
  config: ReasonYouConfig,
  options: { force?: boolean } = {},
): Promise<ReasonYouConfig> {
  if (!options.force && !needsInteractiveConfig(config)) {
    return config;
  }
  if (!process.stdin.isTTY) {
    return config;
  }
  return promptForConfig(config);
}

export async function promptForConfig(
  current: ReasonYouConfig,
): Promise<ReasonYouConfig> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log(`Reason You 配置向导 (${configPath()})`);
    console.log("选择 Provider:");
    PROVIDERS.forEach((provider, index) => {
      console.log(`  ${index + 1}. ${provider.label}`);
    });

    const selected = providerByChoice(
      await ask(rl, "Provider [1-3]", providerIndex(current.provider)),
    );
    const apiKey = await askSecret(rl, "API Key", current.apiKey);
    const baseUrl =
      selected.provider === "custom"
        ? await ask(rl, "Base URL", current.baseUrl ?? "")
        : selected.baseUrl;
    const model = await ask(rl, "Model", current.model || selected.model);
    const openaiApi =
      selected.provider === "custom"
        ? parseOpenAIApiMode(
            await ask(rl, "API mode (auto/responses/chat)", current.openaiApi),
          )
        : selected.openaiApi;

    const next = await writeConfig({
      ...current,
      provider: selected.provider,
      apiKey,
      baseUrl,
      model: model || selected.model,
      openaiApi,
    });
    console.log("配置已保存。");
    return next;
  } finally {
    rl.close();
  }
}

function providerIndex(provider: Provider | undefined): string {
  const index = PROVIDERS.findIndex((preset) => preset.provider === provider);
  return String(index >= 0 ? index + 1 : 1);
}

function providerByChoice(choice: string): ProviderPreset {
  const index = Number.parseInt(choice, 10) - 1;
  return PROVIDERS[index] ?? PROVIDERS[0]!;
}

async function ask(
  rl: readline.Interface,
  prompt: string,
  defaultValue: string,
): Promise<string> {
  const answer = await rl.question(
    `${prompt}${defaultValue ? ` (${defaultValue})` : ""}: `,
  );
  return answer.trim() || defaultValue;
}

async function askSecret(
  rl: readline.Interface,
  prompt: string,
  current: string | undefined,
): Promise<string> {
  const answer = await rl.question(
    `${prompt}${current ? ` (${maskedSecret(current)}, 回车保留)` : ""}: `,
  );
  return answer.trim() || current || "";
}

function parseOpenAIApiMode(value: string): OpenAIApiMode {
  return value === "responses" || value === "chat" ? value : "auto";
}
