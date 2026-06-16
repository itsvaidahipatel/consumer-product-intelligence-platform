import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { assertParsableDatabaseUrl } from "./database-url.js";
import { createSupabasePostgresSocketFactory, isSupabasePostgresHost } from "./supabase-direct-socket.js";
import { loadLocalEnvFiles } from "../load-local-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../migrations");

export async function runMigrations(databaseUrl: string): Promise<void> {
  assertParsableDatabaseUrl(databaseUrl);
  const isSupabase = /supabase\.co/i.test(databaseUrl);
  const url = new URL(databaseUrl);
  const supabaseSocket = isSupabasePostgresHost(url.hostname)
    ? createSupabasePostgresSocketFactory(url.hostname, Number(url.port || 5432))
    : undefined;

  const client = postgres(databaseUrl, {
    max: 1,
    connect_timeout: isSupabase ? 30 : 15,
    ...(isSupabase ? { ssl: "require" as const } : {}),
    ...(supabaseSocket ? { socket: supabaseSocket } : {}),
  });
  await client`CREATE TABLE IF NOT EXISTS scanner_migrations (
    id SERIAL PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    created_at BIGINT
  )`;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const full = join(MIGRATIONS_DIR, file);
    const body = readFileSync(full, "utf8");
    const existing = await client<{ id: number }[]>`
      SELECT id FROM scanner_migrations WHERE hash = ${file}
    `;
    if (existing.length > 0) continue;
    await client.unsafe(body);
    await client`INSERT INTO scanner_migrations (hash, created_at) VALUES (${file}, ${Date.now()})`;
  }

  await client.end();
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Export it in your shell, or put it in a `.env` file at the repo root or in `api/.env` (see `api/.env.example`).",
    );
  }
  await runMigrations(url);
  // eslint-disable-next-line no-console
  console.log("Migrations complete.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
