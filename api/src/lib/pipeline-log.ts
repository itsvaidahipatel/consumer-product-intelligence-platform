import type { FastifyBaseLogger } from "fastify";

export type PipelineLog = FastifyBaseLogger;

/** Structured pipeline timing (pino JSON fields). */
export function logPipelinePhase(
  log: PipelineLog,
  base: Record<string, unknown>,
  phase: string,
  durationMs: number,
  extra?: Record<string, unknown>,
): void {
  log.info(
    {
      ...base,
      event: "pipeline_phase",
      phase,
      duration_ms: Math.round(durationMs),
      ...extra,
    },
    `pipeline:${phase}`,
  );
}

export function nowMs(): number {
  return performance.now();
}
