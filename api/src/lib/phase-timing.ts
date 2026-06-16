export type PhaseTimingEntry = {
  phase: string;
  durationMs: number;
  timestamp: string;
  elapsedMs: number;
};

export type AnalysisTiming = {
  startedAt: string;
  completedAt: string;
  totalMs: number;
  phases: PhaseTimingEntry[];
};

export type PhaseTimingCollector = {
  requestStartedAt: number;
  phases: PhaseTimingEntry[];
  record(phase: string, durationMs: number): void;
};

export function createPhaseTimingCollector(requestStartedAt = Date.now()): PhaseTimingCollector {
  const phases: PhaseTimingEntry[] = [];
  return {
    requestStartedAt,
    phases,
    record(phase: string, durationMs: number) {
      const now = Date.now();
      phases.push({
        phase,
        durationMs: Math.round(durationMs),
        timestamp: new Date(now).toISOString(),
        elapsedMs: now - requestStartedAt,
      });
    },
  };
}

export function finalizeTiming(collector: PhaseTimingCollector): AnalysisTiming {
  const completedAt = Date.now();
  return {
    startedAt: new Date(collector.requestStartedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    totalMs: completedAt - collector.requestStartedAt,
    phases: collector.phases,
  };
}
