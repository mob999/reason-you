import OpenAI from "openai";
import type {
  DiagnosticContext,
  DiagnosticResult,
  OpenAIApiMode,
  ReasonYouConfig,
} from "./types";

export type OpenAIResponsesClient = {
  responses: {
    create(input: {
      model: string;
      input: string;
      stream?: boolean;
    }): Promise<{ output_text: string }>;
  };
  chat?: {
    completions: {
      create(input: {
        model: string;
        messages: Array<{ role: "user"; content: string }>;
        stream?: boolean;
        reasoning_split?: boolean;
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

export function buildDiagnosticTextPrompt(
  context: DiagnosticContext,
  language = "zh-CN",
): string {
  return [
    "You are a command-line error diagnostic assistant.",
    `Respond in ${language}. Be concise.`,
    "Stream only the final answer in this exact text shape:",
    "原因:",
    "<one or two short sentences>",
    "",
    "证据:",
    "<cite only command, cwd, exit code, and stderr facts shown below>",
    "",
    "下一步:",
    "- <concrete action>",
    "- <concrete action>",
    "",
    "Do not reveal reasoning, planning, analysis notes, hidden chain-of-thought, or drafting steps.",
    "Do not output JSON, markdown fences, or extra commentary.",
    "If information is insufficient, say exactly what is missing.",
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
  const client =
    options.client ??
    (new OpenAI({
      baseURL: config.baseUrl,
    }) as unknown as OpenAIResponsesClient);
  const prompt = buildDiagnosticPrompt(context, config.language);
  const apiMode = effectiveOpenAIApi(config);
  const outputText =
    apiMode === "chat"
      ? await createChatCompletion(client, config, prompt)
      : await createResponse(client, config.model, prompt);

  return {
    ...parseDiagnosticText(outputText),
    sourceCommand: context.command,
    exitCode: context.exitCode,
    redacted: options.redacted,
  };
}

export async function analyzeWithOpenAIStream(
  context: DiagnosticContext,
  config: ReasonYouConfig,
  options: { client?: OpenAIResponsesClient; redacted: boolean },
): Promise<DiagnosticResult> {
  const client =
    options.client ??
    (new OpenAI({
      baseURL: config.baseUrl,
    }) as unknown as OpenAIResponsesClient);
  const prompt = buildDiagnosticPrompt(context, config.language);
  const apiMode = effectiveOpenAIApi(config);
  const outputText =
    apiMode === "chat"
      ? await collectChatCompletionStream(client, config, prompt)
      : await collectResponseStream(client, config.model, prompt);

  return {
    ...parseDiagnosticText(outputText),
    sourceCommand: context.command,
    exitCode: context.exitCode,
    redacted: options.redacted,
  };
}

export async function streamDiagnosticText(
  context: DiagnosticContext,
  config: ReasonYouConfig,
  options: {
    client?: OpenAIResponsesClient;
    onDelta: (text: string) => void | Promise<void>;
  },
): Promise<void> {
  const client =
    options.client ??
    (new OpenAI({
      baseURL: config.baseUrl,
    }) as unknown as OpenAIResponsesClient);
  const prompt = buildDiagnosticTextPrompt(context, config.language);
  const apiMode = effectiveOpenAIApi(config);

  if (apiMode === "chat") {
    await streamChatCompletionText(client, config, prompt, options.onDelta);
    return;
  }

  await streamResponseText(client, config.model, prompt, options.onDelta);
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
  config: ReasonYouConfig,
  prompt: string,
): Promise<string> {
  const response = await client.chat?.completions.create({
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    ...providerRequestOptions(config),
  });
  return response?.choices[0]?.message.content ?? "";
}

async function streamResponseText(
  client: OpenAIResponsesClient,
  model: string,
  prompt: string,
  onDelta: (text: string) => void | Promise<void>,
): Promise<void> {
  const stream = (await client.responses.create({
    model,
    input: prompt,
    stream: true,
  })) as unknown as AsyncIterable<Record<string, unknown>>;

  for await (const event of stream) {
    const text = responseStreamText(event);
    if (text) await onDelta(text);
  }
}

async function streamChatCompletionText(
  client: OpenAIResponsesClient,
  config: ReasonYouConfig,
  prompt: string,
  onDelta: (text: string) => void | Promise<void>,
): Promise<void> {
  const stream = (await client.chat?.completions.create({
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
    ...providerRequestOptions(config),
  })) as AsyncIterable<Record<string, unknown>> | undefined;

  if (!stream) return;
  for await (const chunk of stream) {
    const text = chatStreamText(chunk);
    if (text) await onDelta(text);
  }
}

async function collectResponseStream(
  client: OpenAIResponsesClient,
  model: string,
  prompt: string,
): Promise<string> {
  const stream = (await client.responses.create({
    model,
    input: prompt,
    stream: true,
  })) as unknown as AsyncIterable<Record<string, unknown>>;

  let output = "";
  for await (const event of stream) {
    output += responseStreamText(event);
  }
  return output;
}

async function collectChatCompletionStream(
  client: OpenAIResponsesClient,
  config: ReasonYouConfig,
  prompt: string,
): Promise<string> {
  const stream = (await client.chat?.completions.create({
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
    ...providerRequestOptions(config),
  })) as AsyncIterable<Record<string, unknown>> | undefined;

  let output = "";
  if (!stream) return output;
  for await (const chunk of stream) {
    output += chatStreamText(chunk);
  }
  return output;
}

export function isMiniMaxBaseUrl(baseUrl: string | undefined): boolean {
  return Boolean(baseUrl && /minimax/i.test(baseUrl));
}

export function effectiveOpenAIApi(
  config: ReasonYouConfig,
): Exclude<OpenAIApiMode, "auto"> {
  if (config.openaiApi === "chat" || config.openaiApi === "responses") {
    return config.openaiApi;
  }
  return isMiniMaxBaseUrl(config.baseUrl) ? "chat" : "responses";
}

function providerRequestOptions(config: Pick<ReasonYouConfig, "baseUrl">): {
  reasoning_split?: boolean;
} {
  return isMiniMaxBaseUrl(config.baseUrl) ? { reasoning_split: true } : {};
}

function responseStreamText(event: Record<string, unknown>): string {
  if (typeof event.delta === "string") return event.delta;
  if (typeof event.output_text === "string") return event.output_text;
  if (
    event.type === "response.output_text.delta" &&
    typeof event.delta === "string"
  ) {
    return event.delta;
  }
  return "";
}

function chatStreamText(chunk: Record<string, unknown>): string {
  const choices = chunk.choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0] as { delta?: { content?: unknown } } | undefined;
  return typeof first?.delta?.content === "string" ? first.delta.content : "";
}

export function formatDiagnosticResult(
  diagnostic: Pick<DiagnosticResult, "reason" | "evidence" | "nextSteps">,
): string {
  const lines = [
    "原因:",
    diagnostic.reason,
    "",
    "证据:",
    diagnostic.evidence || "暂无更多证据。",
    "",
    "下一步:",
    ...(diagnostic.nextSteps.length
      ? diagnostic.nextSteps.map((step) => `- ${step}`)
      : ["- 补充 stderr 后再次运行 reasonyou。"]),
  ];
  return `${lines.join("\n")}\n`;
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
