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
  chat?: {
    completions: {
      create(input: {
        model: string;
        messages: Array<{ role: "user"; content: string }>;
      }): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
};

export function buildDiagnosticPrompt(
  context: DiagnosticContext,
  language = "zh-CN",
): string {
  return [
    "You are a command-line error diagnostic engine.",
    `Respond in ${language}. Be concise.`,
    "Do not reveal reasoning, planning, analysis notes, hidden chain-of-thought, or drafting steps.",
    "Do not say what you will output. Output only the final answer.",
    "Return strict JSON only, with this exact shape:",
    '{"summary":"...","reason":"...","evidence":"...","nextSteps":["..."]}',
    "Rules:",
    "- reason: one or two short sentences.",
    "- evidence: cite only command, cwd, exit code, and stderr facts shown below.",
    "- nextSteps: 1 to 4 concrete user actions, no meta commentary.",
    "- If information is insufficient, say exactly what is missing.",
    "- Do not wrap JSON in markdown.",
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
  const prompt = buildDiagnosticPrompt(context, config.language);
  const outputText =
    config.openaiApi === "chat"
      ? await createChatCompletion(client, config.model, prompt)
      : await createResponse(client, config.model, prompt);

  return {
    ...parseDiagnosticText(outputText),
    sourceCommand: context.command,
    exitCode: context.exitCode,
    redacted: options.redacted,
  };
}

async function createResponse(
  client: OpenAIResponsesClient,
  model: string,
  prompt: string,
): Promise<string> {
  const response = await client.responses.create({ model, input: prompt });
  return response.output_text;
}

async function createChatCompletion(
  client: OpenAIResponsesClient,
  model: string,
  prompt: string,
): Promise<string> {
  const response = await client.chat?.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
  });
  return response?.choices[0]?.message.content ?? "";
}

export function parseDiagnosticText(
  text: string,
): Pick<DiagnosticResult, "summary" | "reason" | "evidence" | "nextSteps"> {
  const parsedJson = parseDiagnosticJson(text);
  if (parsedJson) return parsedJson;

  const cleanedText = stripMetaLines(text).trim();
  const reason = section(cleanedText, "原因") || cleanedText;
  const evidence = section(cleanedText, "证据");
  const nextStepsText = section(cleanedText, "下一步");
  const nextSteps = nextStepsText
    ? nextStepsText
        .split("\n")
        .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
        .filter((line) => !isMetaLine(line))
        .filter(Boolean)
    : [];
  return { summary: firstSentence(reason), reason, evidence, nextSteps };
}

function parseDiagnosticJson(
  text: string,
): Pick<
  DiagnosticResult,
  "summary" | "reason" | "evidence" | "nextSteps"
> | null {
  const candidate = extractJsonObject(text);
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate) as Partial<{
      summary: unknown;
      reason: unknown;
      evidence: unknown;
      nextSteps: unknown;
    }>;
    const reason = stringValue(parsed.reason);
    const evidence = stringValue(parsed.evidence);
    const nextSteps = Array.isArray(parsed.nextSteps)
      ? parsed.nextSteps.map(stringValue).filter(Boolean)
      : [];
    if (!reason && !evidence && nextSteps.length === 0) return null;

    return {
      summary: stringValue(parsed.summary) || firstSentence(reason),
      reason,
      evidence,
      nextSteps,
    };
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text);
  const input = fenced?.[1] ?? text;
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  return start >= 0 && end > start ? input.slice(start, end + 1) : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripMetaLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !isMetaLine(line.trim()))
    .join("\n");
}

function isMetaLine(line: string): boolean {
  return /\b(we can say|we'll output|we will output|ensure not to|make concise|use chinese|the command was probably|likely is relative|ok, that's straightforward|also note:|so we can say)\b/i.test(
    line,
  );
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
