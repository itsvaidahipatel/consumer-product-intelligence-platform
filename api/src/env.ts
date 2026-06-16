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
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
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
    GOOGLE_VISION_CREDENTIALS_JSON: visionJson || undefined,
  };
}
