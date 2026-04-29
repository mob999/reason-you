import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { databasePath } from "./paths";
import type {
  DiagnosticContext,
  DiagnosticResult,
  ReasonYouConfig,
} from "./types";
import { effectiveOpenAIApi } from "./llm";

type DiagnosticRow = {
  summary: string;
  reason: string;
  evidence: string;
  next_steps: string;
  source_command: string;
  exit_code: number;
  redacted: number;
};

export function diagnosticCacheKey(
  context: DiagnosticContext,
  config: ReasonYouConfig,
): string {
  return sha256(
    JSON.stringify({
      command: context.command,
      cwd: context.cwd,
      exitCode: context.exitCode,
      stderr: context.stderr ?? "",
      provider: config.provider ?? "",
      baseUrl: config.baseUrl ?? "",
      model: config.model,
      openaiApi: effectiveOpenAIApi(config),
      language: config.language,
    }),
  );
}

export async function getCachedDiagnostic(
  context: DiagnosticContext,
  config: ReasonYouConfig,
  dbPath = databasePath(),
): Promise<DiagnosticResult | null> {
  const db = await openCache(dbPath);
  try {
    const row = db
      .query<
        DiagnosticRow,
        [string]
      >("select summary, reason, evidence, next_steps, source_command, exit_code, redacted from diagnostics where cache_key = ? limit 1")
      .get(diagnosticCacheKey(context, config));
    if (!row) return null;
    return {
      summary: row.summary,
      reason: row.reason,
      evidence: row.evidence,
      nextSteps: JSON.parse(row.next_steps) as string[],
      sourceCommand: row.source_command,
      exitCode: row.exit_code,
      redacted: Boolean(row.redacted),
    };
  } finally {
    db.close();
  }
}

export async function saveCachedDiagnostic(
  context: DiagnosticContext,
  config: ReasonYouConfig,
  diagnostic: DiagnosticResult,
  dbPath = databasePath(),
): Promise<void> {
  const db = await openCache(dbPath);
  try {
    db.query(
      `insert or replace into diagnostics (
        id, cache_key, provider, base_url, model, openai_api, language,
        command, cwd, exit_code, stderr_hash,
        summary, reason, evidence, next_steps, source_command, redacted, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      diagnosticCacheKey(context, config),
      config.provider ?? "",
      config.baseUrl ?? "",
      config.model,
      effectiveOpenAIApi(config),
      config.language,
      context.command,
      context.cwd,
      context.exitCode,
      sha256(context.stderr ?? ""),
      diagnostic.summary,
      diagnostic.reason,
      diagnostic.evidence,
      JSON.stringify(diagnostic.nextSteps),
      diagnostic.sourceCommand,
      diagnostic.redacted ? 1 : 0,
      new Date().toISOString(),
    );
  } finally {
    db.close();
  }
}

async function openCache(dbPath: string): Promise<Database> {
  await Bun.$`mkdir -p ${dirname(dbPath)}`.quiet();
  const db = new Database(dbPath);
  db.exec(`
    create table if not exists diagnostics (
      id text primary key,
      cache_key text not null unique,
      provider text,
      base_url text,
      model text not null,
      openai_api text not null,
      language text not null,
      command text not null,
      cwd text not null,
      exit_code integer not null,
      stderr_hash text not null,
      summary text not null,
      reason text not null,
      evidence text not null,
      next_steps text not null,
      source_command text not null,
      redacted integer not null,
      created_at text not null
    );
    create index if not exists diagnostics_cache_key_idx on diagnostics(cache_key);
  `);
  return db;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
