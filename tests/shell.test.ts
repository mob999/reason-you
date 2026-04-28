import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hookSnippet, installHook, rcPathForShell } from "../src/shell";

describe("shell hook", () => {
  test("generates a zsh hook that records failed commands", () => {
    const snippet = hookSnippet("zsh", "/tmp/reasonyou/errors.jsonl");
    expect(snippet).toContain("add-zsh-hook preexec");
    expect(snippet).toContain("add-zsh-hook precmd");
    expect(snippet).toContain('tee "$__reasonyou_stderr_file"');
    expect(snippet).toContain("stderr:process.argv[3]||undefined");
    expect(snippet).toContain("/tmp/reasonyou/errors.jsonl");
  });

  test("resolves shell rc paths", () => {
    expect(rcPathForShell("zsh", "/home/test")).toBe("/home/test/.zshrc");
    expect(rcPathForShell("bash", "/home/test")).toBe("/home/test/.bashrc");
  });

  test("updates an existing managed hook block", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reasonyou-shell-"));
    const rcPath = join(tempDir, ".zshrc");
    await writeFile(
      rcPath,
      [
        "before",
        "# >>> reasonyou init >>>",
        "old hook",
        "# <<< reasonyou init <<<",
        "after",
      ].join("\n"),
      "utf8",
    );

    try {
      const result = await installHook("zsh", rcPath);
      const content = await readFile(rcPath, "utf8");

      expect(result.changed).toBe(true);
      expect(content).toContain("before");
      expect(content).toContain("after");
      expect(content).not.toContain("old hook");
      expect(content).toContain("stderr:process.argv[3]||undefined");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
