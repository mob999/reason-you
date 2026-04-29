import { homedir } from "node:os";
import { join } from "node:path";

export function homeDir(): string {
  return process.env.REASONYOU_HOME ?? homedir();
}

export function configDir(): string {
  return (
    process.env.REASONYOU_CONFIG_DIR ?? join(homeDir(), ".config", "reasonyou")
  );
}

export function configPath(): string {
  return process.env.REASONYOU_CONFIG_PATH ?? join(configDir(), "config.json");
}

export function stateDir(): string {
  return (
    process.env.REASONYOU_STATE_DIR ??
    join(homeDir(), ".local", "state", "reasonyou")
  );
}

export function historyPath(): string {
  return process.env.REASONYOU_HISTORY_PATH ?? join(stateDir(), "errors.jsonl");
}

export function databasePath(): string {
  return process.env.REASONYOU_DB_PATH ?? join(stateDir(), "reasonyou.db");
}
