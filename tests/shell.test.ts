import { describe, expect, test } from "bun:test";
import { hookSnippet, rcPathForShell } from "../src/shell";

describe("shell hook", () => {
  test("generates a zsh hook that records failed commands", () => {
    const snippet = hookSnippet("zsh", "/tmp/reasonyou/errors.jsonl");
    expect(snippet).toContain("add-zsh-hook preexec");
    expect(snippet).toContain("add-zsh-hook precmd");
    expect(snippet).toContain("/tmp/reasonyou/errors.jsonl");
  });

  test("resolves shell rc paths", () => {
    expect(rcPathForShell("zsh", "/home/test")).toBe("/home/test/.zshrc");
    expect(rcPathForShell("bash", "/home/test")).toBe("/home/test/.bashrc");
  });
});
