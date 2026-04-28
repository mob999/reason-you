import OpenAI from "openai";
import type {
  DiagnosticContext,
  DiagnosticResult,
  ReasonYouConfig,
} from "./types";

export type OpenAIResponsesClient = {
  responses: {
    create(input: {
      model: string;
      input: string;
    }): Promise<{ output_text: string }>;
  };
};

export function buildDiagnosticPrompt(
  context: DiagnosticContext,
  language = "zh-CN",
): string {
  return [
    "你是一个面向开发者的命令行报错分析助手。",
    `请使用 ${language} 输出，保持简洁。`,
    "只输出以下三段：原因、证据、下一步。",
    "不要编造不存在的日志；如果信息不足，请明确指出还需要什么。",
    "",
    "# Error Context",
    `Command: ${context.command}`,
    `CWD: ${context.cwd}`,
    `Exit Code: ${context.exitCode}`,
    `Timestamp: ${context.timestamp}`,
    "",
    "# stderr",
    context.stderr?.trim() || "(stderr 不可用)",
  ].join("\n");
}

export async function analyzeWithOpenAI(
  context: DiagnosticContext,
  config: ReasonYouConfig,
  options: { client?: OpenAIResponsesClient; redacted: boolean },
): Promise<DiagnosticResult> {
  const client = options.client ?? new OpenAI({ baseURL: config.baseUrl });
  const response = await client.responses.create({
    model: config.model,
    input: buildDiagnosticPrompt(context, config.language),
  });

  return {
    ...parseDiagnosticText(response.output_text),
    sourceCommand: context.command,
    exitCode: context.exitCode,
    redacted: options.redacted,
  };
}

export function parseDiagnosticText(
  text: string,
): Pick<DiagnosticResult, "summary" | "reason" | "evidence" | "nextSteps"> {
  const reason = section(text, "原因") || text.trim();
  const evidence = section(text, "证据");
  const nextStepsText = section(text, "下一步");
  const nextSteps = nextStepsText
    ? nextStepsText
        .split("\n")
        .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean)
    : [];
  return { summary: firstSentence(reason), reason, evidence, nextSteps };
}

function section(text: string, title: string): string {
  const pattern = new RegExp(
    `(?:^|\\n)#{0,3}\\s*${title}\\s*[:：]?\\s*\\n?([\\s\\S]*?)(?=\\n#{0,3}\\s*(?:原因|证据|下一步)\\s*[:：]?|$)`,
  );
  return pattern.exec(text)?.[1]?.trim() ?? "";
}

function firstSentence(text: string): string {
  return text.split(/[。.!?]\s*/)[0]?.trim() || text.trim();
}
