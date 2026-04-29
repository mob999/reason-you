import { describe, expect, test } from "bun:test";
import { buildProgram } from "../src/cli";
import { VERSION } from "../src/version";

describe("cli", () => {
  test("registers the expected command surface", () => {
    const help = buildProgram().helpInformation();

    expect(help).toContain("Usage: reasonyou [options] [command]");
    expect(help).toContain("init");
    expect(help).toContain("doctor");
    expect(help).toContain("config");
    expect(help).toContain("--rerun");
    expect(help).toContain("--base-url <url>");
    expect(help).toContain("--openai-api <mode>");
    expect(help).toContain("--no-redact");
  });

  test("prints the package version", () => {
    expect(buildProgram().version()).toBe(VERSION);
  });

  test("registers init shell options through commander", () => {
    const initCommand = buildProgram().commands.find(
      (command) => command.name() === "init",
    );

    expect(initCommand?.helpInformation()).toContain("--shell <shell>");
  });
});
