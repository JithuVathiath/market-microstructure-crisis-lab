import { performance } from "node:perf_hooks";

import {
  createDefaultConfig,
  MarketSimulation,
} from "../src/engine/simulation";
import type { ScenarioId } from "../src/engine/types";

const scenarios: ScenarioId[] = [
  "stable",
  "flash-crash",
  "liquidity-drought",
  "information-shock",
  "latency-race",
];
const repetitions = 50;
const startedAt = performance.now();
let totalTicks = 0;
let totalTrades = 0;

for (let repetition = 0; repetition < repetitions; repetition += 1) {
  for (const scenario of scenarios) {
    const config = {
      ...createDefaultConfig(scenario),
      seed: 10_000 + repetition,
    };
    const simulation = new MarketSimulation(config);
    simulation.runToEnd();
    totalTicks += config.maxTicks;
    totalTrades += simulation.tradeCount();
  }
}

const elapsed = performance.now() - startedAt;
const result = {
  experiments: repetitions * scenarios.length,
  totalTicks,
  totalTrades,
  elapsedMs: Number(elapsed.toFixed(1)),
  ticksPerSecond: Math.round(totalTicks / (elapsed / 1_000)),
};

console.log(JSON.stringify(result, null, 2));
