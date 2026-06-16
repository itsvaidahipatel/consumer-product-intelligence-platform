import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

/**
 * Load `api/.env` first, then monorepo root `.env` for any keys not already set
 * (including keys already exported in the shell — those are never overwritten).
 * `pnpm --filter @ingredient-scanner/api dev` runs with `cwd` = `api/`.
 */
export function loadLocalEnvFiles(): void {
  const apiEnv = resolve(process.cwd(), ".env");
  const rootEnv = resolve(process.cwd(), "..", ".env");
  if (existsSync(apiEnv)) {
    config({ path: apiEnv });
  }
  if (existsSync(rootEnv)) {
    config({ path: rootEnv });
  }
}
