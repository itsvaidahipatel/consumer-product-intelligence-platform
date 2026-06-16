import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  /** JSON string for a Google Cloud service account with Vision access. */
  GOOGLE_VISION_CREDENTIALS_JSON: z.string().optional(),
  /**
   * Path to a service account JSON file (alternative to GOOGLE_VISION_CREDENTIALS_JSON).
   * Relative paths are resolved from `process.cwd()` (run the API from repo root or set an absolute path).
   */
  GOOGLE_VISION_CREDENTIALS_FILE: z.string().optional(),
  /** Comma-separated API keys accepted from the extension via `x-api-key`. */
  INGREDIENT_SCANNER_API_KEYS: z.string().optional(),
  SERVICE_NAME: z.string().default("ingredient-scanner-api"),
  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_MODEL_FAST: z.string().optional(),
  OLLAMA_MODEL_REASONING: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(["hash", "ollama"]).optional(),
  EMBEDDING_MODEL: z.string().optional(),
  EMBEDDING_DIMS: z.coerce.number().optional(),
  NEO4J_URI: z.string().optional(),
  NEO4J_USER: z.string().optional(),
  NEO4J_PASSWORD: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  /** `auto` = skip LLM when all ingredients match; `always` = always call Ollama; `off` = deterministic only */
  LLM_SUMMARY: z.enum(["auto", "always", "off"]).default("auto"),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type Env = z.infer<typeof envSchema>;

/** Railway/dashboard pastes often include trailing newlines — breaks DNS bind (HOST) and DB URLs. */
function trimProcessEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(trimProcessEnv(process.env));
  if (!parsed.success) {
    const hint =
      process.env.DATABASE_URL === undefined
        ? " Set DATABASE_URL in the environment or in a `.env` file at the repo root or in `api/.env`."
        : "";
    throw new Error(`Invalid environment: ${parsed.error.message}.${hint}`);
  }

  const data = parsed.data;
  let visionJson = data.GOOGLE_VISION_CREDENTIALS_JSON?.trim();
  const visionFile = data.GOOGLE_VISION_CREDENTIALS_FILE?.trim();

  if (!visionJson && visionFile) {
    const absolute = isAbsolute(visionFile) ? visionFile : resolve(process.cwd(), visionFile);
    visionJson = readFileSync(absolute, "utf8").trim();
  }

  return {
    ...data,
    HOST: data.HOST.trim() || "0.0.0.0",
    DATABASE_URL: data.DATABASE_URL.trim(),
    GOOGLE_VISION_CREDENTIALS_JSON: visionJson || undefined,
  };
}
