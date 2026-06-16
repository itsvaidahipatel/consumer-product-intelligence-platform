#!/usr/bin/env tsx
import { loadLocalEnvFiles } from "../../load-local-env.js";
import { createDb } from "../../db/client.js";
import { seedDocumentChunksFromEncyclopedia } from "./seed.js";
import { loadEnv } from "../../env.js";

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const env = loadEnv();
  const { db, close } = createDb(env.DATABASE_URL);
  const n = await seedDocumentChunksFromEncyclopedia(db, env);
  await close();
  // eslint-disable-next-line no-console
  console.log(`Seeded ${n} document chunks.`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
