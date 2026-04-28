import { homedir } from "node:os";

export type RedactionResult = {
  text: string;
  redacted: boolean;
};

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_OPENAI_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, "Bearer [REDACTED_TOKEN]"],
  [
    /\b(api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*["']?[^"'\s]+["']?/gi,
    "$1=[REDACTED_SECRET]",
  ],
  [
    /\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+)/g,
    "[REDACTED_CREDENTIALS]@$1",
  ],
];

export function redactText(input: string, home = homedir()): RedactionResult {
  let output = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  if (home && home !== "/") output = output.split(home).join("~");
  return { text: output, redacted: output !== input };
}
