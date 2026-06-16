import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { assertParsableDatabaseUrl } from "./database-url.js";
import { createSupabasePostgresSocketFactory, isSupabasePostgresHost } from "./supabase-direct-socket.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(databaseUrl: string): { db: Db; close: () => Promise<void> } {
  assertParsableDatabaseUrl(databaseUrl);
  const isSupabase = /supabase\.co/i.test(databaseUrl);
  const url = new URL(databaseUrl);
  const supabaseSocket = isSupabasePostgresHost(url.hostname)
    ? createSupabasePostgresSocketFactory(url.hostname, Number(url.port || 5432))
    : undefined;

  const client = postgres(databaseUrl, {
    prepare: false,
    max: 10,
    /** Supabase direct `db.*.supabase.co:5432` can be slow to accept; pooler `:6543` is often faster for cloud hosts. */
    connect_timeout: isSupabase ? 30 : 15,
    /** Supabase requires TLS; explicit ssl avoids some local "connection failed" cases. */
    ...(isSupabase ? { ssl: "require" as const } : {}),
    ...(supabaseSocket ? { socket: supabaseSocket } : {}),
  });
  const db = drizzle(client, { schema });
  return {
    db,
    close: () => client.end({ timeout: 5 }),
  };
}
