import type { Env } from "./env.js";

export type LogOutcome = "success" | "failure" | "cache_hit" | "skipped";

export type AnalysisLogFields = {
  correlation_id: string;
  outcome: LogOutcome;
  failure_stage?: string;
  duration_ms: number;
  service: string;
  version: string;
};

/**
 * Fastify v5: `logger` must be a **configuration object** (not a `pino()` instance).
 * Use this object with `Fastify({ logger: fastifyLoggerOptions(env) })`.
 */
export function fastifyLoggerOptions(env: Env) {
  return {
    level: env.NODE_ENV === "development" ? "debug" : "info",
    base: { service: env.SERVICE_NAME },
  };
}
