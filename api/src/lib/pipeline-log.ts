import type { FastifyBaseLogger } from "fastify";
import type { PhaseTimingCollector } from "./phase-timing.js";

export type PipelineLog = FastifyBaseLogger;

/** Granular per-step logs (default off in production). Set PIPELINE_VERBOSE_LOGS=true to enable. */
export const pipelineVerboseLogs =
  process.env.PIPELINE_VERBOSE_LOGS === "true" ||
  (process.env.PIPELINE_VERBOSE_LOGS !== "false" && process.env.NODE_ENV !== "production");

export function omitInternalLogFields(base: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  delete (out as { timing_collector?: unknown }).timing_collector;
  return out;
}

/** Structured pipeline timing (pino JSON fields). In production only records timing unless verbose. */
export function logPipelinePhase(
  log: PipelineLog,
  base: Record<string, unknown>,
  phase: string,
  durationMs: number,
  extra?: Record<string, unknown>,
): void {
  const wallNow = Date.now();
  const requestStartedAt = base.request_started_at as number | undefined;
  const elapsedMs =
    typeof requestStartedAt === "number" ? wallNow - requestStartedAt : undefined;
  const collector = base.timing_collector as PhaseTimingCollector | undefined;
  collector?.record(phase, durationMs);

  if (!pipelineVerboseLogs) return;

  const logFields = omitInternalLogFields(base);
  log.debug(
    {
      ...logFields,
      event: "pipeline_phase",
      phase,
      duration_ms: Math.round(durationMs),
      timestamp: new Date(wallNow).toISOString(),
      ...(elapsedMs != null ? { elapsed_ms: elapsedMs } : {}),
      ...extra,
    },
    phase,
  );
}

export function nowMs(): number {
  return performance.now();
}
