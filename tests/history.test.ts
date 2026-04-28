import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendFailureRecord,
  latestFailureRecord,
  readFailureRecords,
} from "../src/history";

let tempDir: string;
let filePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "reasonyou-history-"));
  filePath = join(tempDir, "errors.jsonl");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("history", () => {
  test("parses records and selects the latest failure", async () => {
    await writeFile(
      filePath,
      [
        JSON.stringify({
          id: "1",
          command: "npm test",
          cwd: "/repo",
          exitCode: 1,
          timestamp: "2026-01-01T00:00:00.000Z",
        }),
        "not json",
        JSON.stringify({
          id: "2",
          command: "tsc",
          cwd: "/repo",
          exitCode: 2,
          timestamp: "2026-01-02T00:00:00.000Z",
          stderr: "Type error",
        }),
      ].join("\n"),
      "utf8",
    );
    const records = await readFailureRecords(filePath);
    const latest = await latestFailureRecord(filePath);
    expect(records).toHaveLength(2);
    expect(latest?.command).toBe("tsc");
    expect(latest?.stderr).toBe("Type error");
  });

  test("keeps only the configured number of records when appending", async () => {
    await appendFailureRecord(
      { id: "1", command: "a", cwd: "/repo", exitCode: 1 },
      filePath,
      2,
    );
    await appendFailureRecord(
      { id: "2", command: "b", cwd: "/repo", exitCode: 1 },
      filePath,
      2,
    );
    await appendFailureRecord(
      { id: "3", command: "c", cwd: "/repo", exitCode: 1 },
      filePath,
      2,
    );
    expect(
      (await readFailureRecords(filePath)).map((record) => record.command),
    ).toEqual(["b", "c"]);
  });
});
