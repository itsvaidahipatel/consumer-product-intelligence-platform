type Span = { name: string; start: number; attrs?: Record<string, unknown> };

const spans = new Map<string, Span>();

export function startSpan(correlationId: string, name: string, attrs?: Record<string, unknown>): void {
  spans.set(`${correlationId}:${name}`, { name, start: Date.now(), attrs });
}

export function endSpan(correlationId: string, name: string): number {
  const key = `${correlationId}:${name}`;
  const span = spans.get(key);
  if (!span) return 0;
  const durationMs = Date.now() - span.start;
  spans.delete(key);
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        event: "otel_span",
        correlation_id: correlationId,
        name,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
        ...span.attrs,
      }),
    );
  }
  return durationMs;
}

export async function traceLangfuseEvent(args: {
  correlationId: string;
  name: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const pub = process.env.LANGFUSE_PUBLIC_KEY;
  const sec = process.env.LANGFUSE_SECRET_KEY;
  const base = (process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com").replace(/\/$/, "");
  if (!pub || !sec) return;
  try {
    await fetch(`${base}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Basic ${Buffer.from(`${pub}:${sec}`).toString("base64")}`,
      },
      body: JSON.stringify({
        batch: [
          {
            id: `${args.correlationId}-${args.name}`,
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: { id: args.correlationId, name: args.name, metadata: args.metadata },
          },
        ],
      }),
    });
  } catch {
    /* optional telemetry */
  }
}
