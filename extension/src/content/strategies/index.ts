import type { SiteStrategy } from "./base-strategy.js";
import { AmazonInStrategy } from "./amazon-strategy.js";
import { BlinkitStrategy } from "./blinkit-strategy.js";
import { MyntraStrategy } from "./myntra-strategy.js";
import { NykaaStrategy } from "./nykaa-strategy.js";
import { ZeptoStrategy } from "./zepto-strategy.js";

const STRATEGIES: SiteStrategy[] = [
  new AmazonInStrategy(),
  new NykaaStrategy(),
  new MyntraStrategy(),
  new BlinkitStrategy(),
  new ZeptoStrategy(),
];

export function resolveStrategy(url: string): SiteStrategy | null {
  const u = new URL(url);
  return STRATEGIES.find((s) => s.canHandle(u)) ?? null;
}

export * from "./base-strategy.js";
