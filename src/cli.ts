import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Command, InvalidArgumentError } from "commander";
import { getCachedDiagnostic, saveCachedDiagnostic } from "./cache";
import { loadConfig, writeConfigValue } from "./config";
import { hasUsefulStderr, latestFailureRecord } from "./history";
import {
  analyzeWithOpenAI,
  effectiveOpenAIApi,
  formatDiagnosticResult,
  parseDiagnosticText,
  streamDiagnosticText,
} from "./llm";
import { configPath, historyPath } from "./paths";
import { redactText } from "./redact";
import {
  ensureInteractiveConfig,
  maskedSecret,
  promptForConfig,
} from "./setup";
import {
  detectShell,
  installHook,
  isHookInstalled,
  type SupportedShell,
} from "./shell";
import type { DiagnosticContext, ReasonYouConfig } from "./types";
import { VERSION } from "./version";

type AnalyzeOptions = {
  json?: boolean;
  rerun?: boolean;
  displayThinking?: boolean;
  hideThinking?: boolean;
  model?: string;
  baseUrl?: string;
  openaiApi?: "auto" | "responses" | "chat";
  noRedact?: boolean;
};

type InitOptions = {
  shell?: SupportedShell;
};

export async function main(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv, { from: "user" });
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("reasonyou")
    .description("Explain the most recent failed shell command with an LLM.")
    .version(VERSION, "--version", "print version")
    .helpCommand("help [command]", "display help for command")
    .option("--json", "print machine-readable JSON")
    .option("--rerun", "ignore cached diagnostics and request a fresh analysis")
    .option(
      "--display-thinking",
      "display model thinking output when available",
    )
    .option("--hide-thinking", "hide model thinking output")
    .option("--model <model>", "override the OpenAI model for this run")
    .option("--base-url <url>", "override the OpenAI-compatible base URL")
    .option(
      "--openai-api <mode>",
      "OpenAI API mode: auto, responses, or chat",
      parseOpenAIApiMode,
    )
    .option("--no-redact", "send command context without local redaction")
    .action((options: AnalyzeOptions) => handleAnalyze(options));

  program
    .command("init")
    .description("install the shell hook that records failed commands")
    .option("--shell <shell>", "shell to configure: zsh or bash", parseShell)
    .action((options: InitOptions) => handleInit(options));

  program
    .command("doctor")
    .description("check Reason You setup")
    .action(handleDoctor);

  const config = program
    .command("config")
    .description("read and write Reason You config");

  config
    .command("get")
    .description("print all config or one config value")
    .argument("[key]", "config key", parseOptionalConfigKey)
    .action((key?: keyof ReasonYouConfig) => handleConfigGet(key));

  config
    .command("set")
    .description("set one config value")
    .argument("<key>", "config key", parseConfigKey)
    .argument("<value>", "config value")
    .action((key: keyof ReasonYouConfig, value: string) =>
      handleConfigSet(key, value),
    );

  return program;
}

async function handleAnalyze(options: AnalyzeOptions): Promise<void> {
  const config = await loadConfig({
    model: options.model,
    baseUrl: options.baseUrl,
    openaiApi: options.openaiApi,
    redact: options.noRedact ? false : undefined,
    rerun: options.rerun,
    displayThinking: options.displayThinking
      ? true
      : options.hideThinking
        ? false
        : undefined,
  });
  const configured = await ensureInteractiveConfig(config);
  const record = await latestFailureRecord();
  if (!record) {
    console.error(
      "No failed command history found. Run `reasonyou init`, restart your shell, then run a failing command.",
    );
    process.exitCode = 1;
    return;
  }
  if (!configured.apiKey) {
    console.error(
      "Missing API key. Run `reasonyou init` to configure a provider.",
    );
    process.exitCode = 1;
    return;
  }

  let stderr = record.stderr;
  if (!hasUsefulStderr(record) && (await confirmRerun(record.command))) {
    stderr = await rerunCommand(record.command, record.cwd);
  }

  const { context, redacted } = applyRedaction(
    {
      command: record.command,
      cwd: record.cwd,
      exitCode: record.exitCode,
      timestamp: record.timestamp,
      stderr,
    },
    configured,
  );
  if (options.json) {
    const cached = configured.rerun
      ? null
      : await getCachedDiagnostic(context, configured);
    if (cached) {
      console.log(JSON.stringify(cached, null, 2));
      return;
    }
    const diagnostic = await analyzeWithOpenAI(context, configured, {
      redacted,
    });
    await saveCachedDiagnostic(context, configured, diagnostic);
    console.log(JSON.stringify(diagnostic, null, 2));
    return;
  }

  const cached = configured.rerun
    ? null
    : await getCachedDiagnostic(context, configured);
  if (cached) {
    process.stdout.write(formatDiagnosticResult(cached));
    return;
  }

  if (options.displayThinking && options.hideThinking) {
    console.error(
      "Choose either --display-thinking or --hide-thinking, not both.",
    );
    process.exitCode = 1;
    return;
  }

  let streamedText = "";
  await streamDiagnosticText(context, configured, {
    onDelta: (text) => {
      streamedText += text;
      process.stdout.write(text);
    },
    onThinkingDelta: configured.displayThinking
      ? (text) => {
          process.stdout.write(text);
        }
      : undefined,
  });
  process.stdout.write("\n");
  await saveCachedDiagnostic(context, configured, {
    ...parseDiagnosticText(streamedText),
    sourceCommand: context.command,
    exitCode: context.exitCode,
    redacted,
  });
}

async function handleInit(options: InitOptions): Promise<void> {
  await promptForConfig(await loadConfig());
  const shell = options.shell ?? detectShell();
  const result = await installHook(shell);
  console.log(
    result.changed
      ? `Installed Reason You hook in ${result.rcPath}`
      : `Reason You hook already exists in ${result.rcPath}`,
  );
  console.log(
    "Restart your shell or source the rc file before using automatic history capture.",
  );
}

async function handleDoctor(): Promise<void> {
  const shell = detectShell();
  const config = await loadConfig();
  const checks = [
    ["API key", Boolean(config.apiKey), maskedSecret(config.apiKey)],
    [
      `${shell} hook`,
      isHookInstalled(shell),
      "Run `reasonyou init` and restart your shell.",
    ],
    ["Config path", true, configPath()],
    [
      "Provider",
      Boolean(config.provider),
      config.provider ?? "Run `reasonyou init`.",
    ],
    ["OpenAI base URL", true, config.baseUrl ?? "default"],
    [
      "OpenAI API mode",
      true,
      `${config.openaiApi} (${effectiveOpenAIApi(config)})`,
    ],
    ["History file", existsSync(historyPath()), historyPath()],
  ] as const;
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? "ok" : "missing"} ${label}: ${detail}`);
  }
}

async function handleConfigGet(key?: keyof ReasonYouConfig): Promise<void> {
  const config = await loadConfig();
  const displayConfig = redactConfig(config);
  console.log(
    key ? String(displayConfig[key]) : JSON.stringify(displayConfig, null, 2),
  );
}

async function handleConfigSet(
  key: keyof ReasonYouConfig,
  value: string,
): Promise<void> {
  console.log(
    JSON.stringify(redactConfig(await writeConfigValue(key, value)), null, 2),
  );
}

function redactConfig(config: ReasonYouConfig): ReasonYouConfig {
  return {
    ...config,
    apiKey: maskedSecret(config.apiKey),
  };
}

function applyRedaction(
  context: DiagnosticContext,
  config: ReasonYouConfig,
): { context: DiagnosticContext; redacted: boolean } {
  if (!config.redact) return { context, redacted: false };
  const command = redactText(context.command);
  const cwd = redactText(context.cwd);
  const stderr = redactText(context.stderr ?? "");
  return {
    context: {
      ...context,
      command: command.text,
      cwd: cwd.text,
      stderr: stderr.text,
    },
    redacted: command.redacted || cwd.redacted || stderr.redacted,
  };
}

async function confirmRerun(command: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  process.stdout.write(
    `No stderr was captured. Rerun this command to capture output?\n${command}\n[y/N] `,
  );
  for await (const line of console) return line.trim().toLowerCase() === "y";
  return false;
}

async function rerunCommand(command: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.on("close", () => resolve(output));
    child.on("error", (error) => resolve(error.message));
  });
}

function parseShell(value: string): SupportedShell {
  if (value === "zsh" || value === "bash") return value;
  throw new InvalidArgumentError("expected zsh or bash");
}

function parseOptionalConfigKey(
  value: string | undefined,
): keyof ReasonYouConfig | undefined {
  return value ? parseConfigKey(value) : undefined;
}

function parseConfigKey(value: string): keyof ReasonYouConfig {
  if (
    value === "model" ||
    value === "provider" ||
    value === "apiKey" ||
    value === "baseUrl" ||
    value === "openaiApi" ||
    value === "language" ||
    value === "redact" ||
    value === "rerun" ||
    value === "displayThinking" ||
    value === "historyLimit"
  ) {
    return value;
  }
  throw new InvalidArgumentError(
    "expected one of: provider, apiKey, model, baseUrl, openaiApi, language, redact, rerun, displayThinking, historyLimit",
  );
}

function parseOpenAIApiMode(value: string): "auto" | "responses" | "chat" {
  if (value === "auto" || value === "responses" || value === "chat") {
    return value;
  }
  throw new InvalidArgumentError("expected auto, responses, or chat");
}
