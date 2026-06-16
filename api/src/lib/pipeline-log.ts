import type { FastifyBaseLogger } from "fastify";
import type { PhaseTimingCollector } from "./phase-timing.js";

export type PipelineLog = FastifyBaseLogger;

export function omitInternalLogFields(base: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  delete (out as { timing_collector?: unknown }).timing_collector;
  return out;
}

/** Structured pipeline timing (pino JSON fields). */
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

  const logFields = omitInternalLogFields(base);
  log.info(
    {
      ...logFields,
      event: "pipeline_phase",
      phase,
      duration_ms: Math.round(durationMs),
      timestamp: new Date(wallNow).toISOString(),
      ...(elapsedMs != null ? { elapsed_ms: elapsedMs } : {}),
      ...extra,
    },
    `pipeline:${phase}`,
  );
}

export function nowMs(): number {
  return performance.now();
}
