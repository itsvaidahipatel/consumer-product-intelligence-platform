#!/usr/bin/env tsx
import { dirname } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../eval/export");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "training-candidates.jsonl");
writeFileSync(out, '{"type":"feedback_export_placeholder","note":"Run against production DB via SQL export"}\n');
// eslint-disable-next-line no-console
console.log(`Wrote ${out}`);
