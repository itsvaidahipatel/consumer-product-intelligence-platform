import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import type { Env } from "../env.js";
import { SERVICE_VERSION } from "../version.js";

/** Avoid hammering remote Postgres on every `/health` poll (e.g. browser extensions). */
const DB_HEALTH_CACHE_MS = 5000;
let dbHealthCache: { ok: boolean; at: number; error?: string } | null = null;

export async function registerHealthRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: Env },
): Promise<void> {
  const visionConfigured = Boolean(deps.env.GOOGLE_VISION_CREDENTIALS_JSON);

  app.get("/health", async (_req, reply) => {
    const now = Date.now();
    let database = false;
    let databaseError: string | undefined;

    if (dbHealthCache && now - dbHealthCache.at < DB_HEALTH_CACHE_MS) {
      database = dbHealthCache.ok;
      databaseError = dbHealthCache.error;
    } else {
      try {
        await deps.db.execute(sql`select 1`);
        database = true;
        dbHealthCache = { ok: true, at: now };
      } catch (err) {
        database = false;
        if (deps.env.NODE_ENV !== "production") {
          databaseError = err instanceof Error ? err.message : String(err);
        }
        dbHealthCache = { ok: false, at: now, error: databaseError };
      }
    }

    const ok = database;
    return reply.send({
      ok,
      checks: {
        database,
        vision_configured: visionConfigured,
      },
      ...(databaseError ? { database_error: databaseError } : {}),
      version: SERVICE_VERSION,
    });
  });

  app.get("/ready", async (_req, reply) => {
    let database = false;
    try {
      await deps.db.execute(sql`select 1`);
      database = true;
    } catch {
      database = false;
    }

    const ready = database;
    return reply.code(ready ? 200 : 503).send({
      ready,
      database,
      version: SERVICE_VERSION,
    });
  });
}
