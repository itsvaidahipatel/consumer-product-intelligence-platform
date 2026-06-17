import { createHash } from "node:crypto";

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const MAX_CONCURRENCY = 3;

async function fetchWithLimits(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
  if (/amazon\.|media-amazon\.com|ssl-images-amazon/i.test(url)) {
    headers.Referer = "https://www.amazon.in/";
  }
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers });
    if (!res.ok) {
      throw new Error(`Image fetch failed (${res.status})`);
    }
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MAX_BYTES) {
      throw new Error("Image too large");
    }
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      throw new Error("Image too large");
    }
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchImagesBounded(urls: string[]): Promise<Buffer[]> {
  /** Same length as `urls` so Vision indices stay aligned with ranked URLs; empty buffer = fetch failed. */
  const out: Buffer[] = new Array(urls.length).fill(null).map(() => Buffer.alloc(0));
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < urls.length) {
      const current = idx++;
      const url = urls[current];
      if (!url) continue;
      try {
        out[current] = await fetchWithLimits(url);
      } catch {
        out[current] = Buffer.alloc(0);
      }
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, Math.max(1, urls.length)) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return out;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
