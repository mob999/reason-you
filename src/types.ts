export type OpenAIApiMode = "auto" | "responses" | "chat";
export type Provider = "minimax-intl" | "minimax-cn" | "custom";

export type ReasonYouConfig = {
  provider?: Provider;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  openaiApi: OpenAIApiMode;
  language: string;
  redact: boolean;
  rerun: boolean;
  displayThinking: boolean;
  historyLimit: number;
};

export type FailureRecord = {
  id: string;
  command: string;
  cwd: string;
  exitCode: number;
  timestamp: string;
  stderr?: string;
};

export type DiagnosticContext = {
  command: string;
  cwd: string;
  exitCode: number;
  timestamp: string;
  stderr?: string;
};

export type DiagnosticResult = {
  summary: string;
  reason: string;
  evidence: string;
  nextSteps: string[];
  sourceCommand: string;
  exitCode: number;
  redacted: boolean;
};
