export type OpenAIApiMode = "responses" | "chat";

export type ReasonYouConfig = {
  model: string;
  baseUrl?: string;
  openaiApi: OpenAIApiMode;
  language: string;
  redact: boolean;
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
