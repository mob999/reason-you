import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { historyPath } from "./paths";

const START = "# >>> reasonyou init >>>";
const END = "# <<< reasonyou init <<<";

export type SupportedShell = "zsh" | "bash";

export function detectShell(shell = process.env.SHELL ?? ""): SupportedShell {
  return shell.includes("bash") ? "bash" : "zsh";
}

export function rcPathForShell(
  shell: SupportedShell,
  home = homedir(),
): string {
  return shell === "bash" ? join(home, ".bashrc") : join(home, ".zshrc");
}

export function hookSnippet(
  shell: SupportedShell,
  targetHistoryPath = historyPath(),
): string {
  const escapedHistoryPath = targetHistoryPath.replace(/"/g, '\\"');
  const writer =
    'node -e \'const fs=require("fs"); const crypto=require("crypto"); const record={id:crypto.randomUUID(),command:process.argv[1],cwd:process.cwd(),exitCode:Number(process.argv[2]),timestamp:new Date().toISOString()}; fs.appendFileSync(process.env.REASONYOU_HISTORY_PATH, JSON.stringify(record)+"\\n")\'';

  if (shell === "bash") {
    return [
      START,
      `export REASONYOU_HISTORY_PATH="${escapedHistoryPath}"`,
      '__reasonyou_last_command=""',
      "trap '__reasonyou_last_command=\"$BASH_COMMAND\"' DEBUG",
      "__reasonyou_record_failure() {",
      "  local exit_code=$?",
      '  if [ "$exit_code" -ne 0 ] && [ -n "$__reasonyou_last_command" ]; then',
      '    mkdir -p "$(dirname "$REASONYOU_HISTORY_PATH")"',
      `    ${writer} "$__reasonyou_last_command" "$exit_code"`,
      "  fi",
      "}",
      'PROMPT_COMMAND="__reasonyou_record_failure${PROMPT_COMMAND:+;$PROMPT_COMMAND}"',
      END,
    ].join("\n");
  }

  return [
    START,
    `export REASONYOU_HISTORY_PATH="${escapedHistoryPath}"`,
    '__reasonyou_last_command=""',
    '__reasonyou_preexec() { __reasonyou_last_command="$1" }',
    "__reasonyou_precmd() {",
    "  local exit_code=$?",
    '  if [ "$exit_code" -ne 0 ] && [ -n "$__reasonyou_last_command" ]; then',
    '    mkdir -p "$(dirname "$REASONYOU_HISTORY_PATH")"',
    `    ${writer} "$__reasonyou_last_command" "$exit_code"`,
    "  fi",
    "}",
    "autoload -Uz add-zsh-hook",
    "add-zsh-hook preexec __reasonyou_preexec",
    "add-zsh-hook precmd __reasonyou_precmd",
    END,
  ].join("\n");
}

export async function installHook(
  shell: SupportedShell,
  rcPath = rcPathForShell(shell),
): Promise<{ rcPath: string; changed: boolean }> {
  const file = Bun.file(rcPath);
  const existing = (await file.exists()) ? await file.text() : "";
  if (existing.includes(START) && existing.includes(END))
    return { rcPath, changed: false };

  await Bun.$`mkdir -p ${dirname(rcPath)}`.quiet();
  await Bun.write(
    rcPath,
    `${existing}${existing.endsWith("\n") || !existing ? "" : "\n"}\n${hookSnippet(shell)}\n`,
  );
  return { rcPath, changed: true };
}

export function isHookInstalled(
  shell: SupportedShell,
  rcPath = rcPathForShell(shell),
): boolean {
  if (!existsSync(rcPath)) return false;
  return (
    readFileSync(rcPath, "utf8").includes(START) &&
    readFileSync(rcPath, "utf8").includes(END)
  );
}
