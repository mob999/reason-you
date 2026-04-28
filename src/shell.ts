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
    'node -e \'const fs=require("fs"); const crypto=require("crypto"); const record={id:crypto.randomUUID(),command:process.argv[1],cwd:process.cwd(),exitCode:Number(process.argv[2]),timestamp:new Date().toISOString(),stderr:process.argv[3]||undefined}; fs.appendFileSync(process.env.REASONYOU_HISTORY_PATH, JSON.stringify(record)+"\\n")\'';

  if (shell === "bash") {
    return [
      START,
      `export REASONYOU_HISTORY_PATH="${escapedHistoryPath}"`,
      '__reasonyou_last_command=""',
      '__reasonyou_stderr_file=""',
      "__reasonyou_stderr_fd_open=0",
      "trap '__reasonyou_last_command=\"$BASH_COMMAND\"' DEBUG",
      "__reasonyou_start_capture() {",
      '  __reasonyou_stderr_file="$(mktemp "${TMPDIR:-/tmp}/reasonyou-stderr.XXXXXX")"',
      "  exec 9>&2",
      "  __reasonyou_stderr_fd_open=1",
      '  exec 2> >(tee "$__reasonyou_stderr_file" >&9)',
      "}",
      "__reasonyou_record_failure() {",
      "  local exit_code=$?",
      '  if [ "$__reasonyou_stderr_fd_open" = "1" ]; then',
      "    exec 2>&9",
      "    exec 9>&-",
      "    __reasonyou_stderr_fd_open=0",
      "  fi",
      '  if [ "$exit_code" -ne 0 ] && [ -n "$__reasonyou_last_command" ]; then',
      '    mkdir -p "$(dirname "$REASONYOU_HISTORY_PATH")"',
      '    local stderr_text=""',
      '    if [ -n "$__reasonyou_stderr_file" ] && [ -f "$__reasonyou_stderr_file" ]; then',
      '      stderr_text="$(tail -c 20000 "$__reasonyou_stderr_file")"',
      "    fi",
      `    ${writer} "$__reasonyou_last_command" "$exit_code" "$stderr_text"`,
      "  fi",
      '  [ -n "$__reasonyou_stderr_file" ] && rm -f "$__reasonyou_stderr_file"',
      '  __reasonyou_stderr_file=""',
      "}",
      'PROMPT_COMMAND="__reasonyou_record_failure;__reasonyou_start_capture${PROMPT_COMMAND:+;$PROMPT_COMMAND}"',
      END,
    ].join("\n");
  }

  return [
    START,
    `export REASONYOU_HISTORY_PATH="${escapedHistoryPath}"`,
    '__reasonyou_last_command=""',
    '__reasonyou_stderr_file=""',
    "__reasonyou_stderr_fd=",
    "__reasonyou_start_capture() {",
    '  __reasonyou_stderr_file="$(mktemp "${TMPDIR:-/tmp}/reasonyou-stderr.XXXXXX")"',
    "  exec {__reasonyou_stderr_fd}>&2",
    '  exec 2> >(tee "$__reasonyou_stderr_file" >&$__reasonyou_stderr_fd)',
    "}",
    "__reasonyou_stop_capture() {",
    '  if [ -n "$__reasonyou_stderr_fd" ]; then',
    "    exec 2>&$__reasonyou_stderr_fd",
    "    exec {__reasonyou_stderr_fd}>&-",
    "    __reasonyou_stderr_fd=",
    "  fi",
    "}",
    "__reasonyou_preexec() {",
    '  __reasonyou_last_command="$1"',
    "  __reasonyou_start_capture",
    "}",
    "__reasonyou_precmd() {",
    "  local exit_code=$?",
    "  __reasonyou_stop_capture",
    '  if [ "$exit_code" -ne 0 ] && [ -n "$__reasonyou_last_command" ]; then',
    '    mkdir -p "$(dirname "$REASONYOU_HISTORY_PATH")"',
    '    local stderr_text=""',
    '    if [ -n "$__reasonyou_stderr_file" ] && [ -f "$__reasonyou_stderr_file" ]; then',
    '      stderr_text="$(tail -c 20000 "$__reasonyou_stderr_file")"',
    "    fi",
    `    ${writer} "$__reasonyou_last_command" "$exit_code" "$stderr_text"`,
    "  fi",
    '  [ -n "$__reasonyou_stderr_file" ] && rm -f "$__reasonyou_stderr_file"',
    '  __reasonyou_stderr_file=""',
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
  const snippet = hookSnippet(shell);
  if (existing.includes(START) && existing.includes(END)) {
    const next = existing.replace(
      new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`),
      snippet,
    );
    if (next === existing) return { rcPath, changed: false };
    await Bun.write(rcPath, next);
    return { rcPath, changed: true };
  }

  await Bun.$`mkdir -p ${dirname(rcPath)}`.quiet();
  await Bun.write(
    rcPath,
    `${existing}${existing.endsWith("\n") || !existing ? "" : "\n"}\n${snippet}\n`,
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
