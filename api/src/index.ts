import "./dns-bootstrap.js";
import Fastify from "fastify";
import { sql } from "drizzle-orm";
import cors from "@fastify/cors";
import { loadLocalEnvFiles } from "./load-local-env.js";
import { loadEnv } from "./env.js";
import { fastifyLoggerOptions } from "./logger.js";
import { createDb } from "./db/client.js";
import { createVisionFromEnv } from "./services/vision.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAnalyzeProductRoutes } from "./routes/analyze-product.js";
import { SERVICE_VERSION } from "./version.js";

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const env = loadEnv();
  const { db, close } = createDb(env.DATABASE_URL);
  try {
    await db.execute(sql`select 1`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error(`[ingredient-scanner-api] DATABASE_URL startup probe failed:\n${msg}`);
    await close().catch(() => {});
    process.exit(1);
  }
  const vision = createVisionFromEnv(env.GOOGLE_VISION_CREDENTIALS_JSON);

  const app = Fastify({
    logger: fastifyLoggerOptions(env),
    disableRequestLogging: env.NODE_ENV === "production",
  });

  await app.register(cors, { origin: true });

  await registerHealthRoutes(app, { db, env });
  await registerAnalyzeProductRoutes(app, { db, env, vision });

  app.get("/", async () => ({
    service: env.SERVICE_NAME,
    version: SERVICE_VERSION,
  }));

  await app.listen({ port: env.PORT, host: env.HOST });

  const shutdown = async () => {
    await app.close();
    await close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
