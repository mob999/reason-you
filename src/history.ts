import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { historyPath } from "./paths";
import type { FailureRecord } from "./types";

export async function readFailureRecords(
  filePath = historyPath(),
): Promise<FailureRecord[]> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return [];

  return (await file.text())
    .split("\n")
    .filter(Boolean)
    .map(parseRecordLine)
    .filter((record): record is FailureRecord => record !== null)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export async function latestFailureRecord(
  filePath = historyPath(),
): Promise<FailureRecord | null> {
  return (await readFailureRecords(filePath)).at(-1) ?? null;
}

export async function appendFailureRecord(
  record: Omit<FailureRecord, "id" | "timestamp"> &
    Partial<Pick<FailureRecord, "id" | "timestamp">>,
  filePath = historyPath(),
  limit = 50,
): Promise<FailureRecord> {
  const next: FailureRecord = {
    id: record.id ?? randomUUID(),
    command: record.command,
    cwd: record.cwd,
    exitCode: record.exitCode,
    timestamp: record.timestamp ?? new Date().toISOString(),
    stderr: record.stderr,
  };

  await Bun.$`mkdir -p ${dirname(filePath)}`.quiet();
  const records = [...(await readFailureRecords(filePath)), next].slice(-limit);
  await Bun.write(
    filePath,
    `${records.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );
  return next;
}

export function hasUsefulStderr(record: FailureRecord): boolean {
  return Boolean(record.stderr?.trim());
}

function parseRecordLine(line: string): FailureRecord | null {
  try {
    const parsed = JSON.parse(line) as Partial<FailureRecord>;
    if (
      !parsed.command ||
      !parsed.cwd ||
      typeof parsed.exitCode !== "number" ||
      !parsed.timestamp
    )
      return null;
    return {
      id: parsed.id ?? randomUUID(),
      command: parsed.command,
      cwd: parsed.cwd,
      exitCode: parsed.exitCode,
      timestamp: parsed.timestamp,
      stderr: parsed.stderr,
    };
  } catch {
    return null;
  }
}
