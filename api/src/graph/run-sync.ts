#!/usr/bin/env tsx
import { loadLocalEnvFiles } from "../load-local-env.js";
import { createDb } from "../db/client.js";
import { syncPostgresToNeo4j } from "./sync.js";
import { loadEnv } from "../env.js";

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const env = loadEnv();
  const { db, close } = createDb(env.DATABASE_URL);
  const n = await syncPostgresToNeo4j(db, env);
  await close();
  // eslint-disable-next-line no-console
  console.log(`Synced ${n} ingredients to Neo4j.`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
