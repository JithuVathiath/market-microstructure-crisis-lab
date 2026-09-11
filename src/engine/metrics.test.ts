import { describe, expect, it } from "vitest";

import { calculateMetrics, percentageImprovement } from "./metrics";
import type { AgentState, BookView, PricePoint } from "./types";

const agent: AgentState = {
  id: "a",
  kind: "noise",
  label: "Retail",
  cash: 1000,
  inventory: 10,
  initialWealth: 2000,
  submittedQuantity: 100,
  executedQuantity: 50,
  cancellations: 6,
  trades: 4,
  latencyTicks: 0,
  active: true,
  lastDecision: "test",
};

const book: BookView = {
  bids: [{ price: 99.9, quantity: 40, orderCount: 2 }],
  asks: [{ price: 100.1, quantity: 60, orderCount: 3 }],
  bestBid: 99.9,
  bestAsk: 100.1,
  spread: 0.2,
  midPrice: 100,
};

describe("market metrics", () => {
  it("calculates liquidity, execution, pricing, and composite measures", () => {
    const priceHistory: PricePoint[] = [
      { tick: 0, price: 100, fundamental: 100, spreadBps: 20, volume: 0 },
      { tick: 1, price: 101, fundamental: 100.5, spreadBps: 20, volume: 5 },
    ];
    const result = calculateMetrics({
      book,
      lastPrice: 101,
      fundamentalPrice: 100.5,
      priceHistory,
      agents: [agent],
      totalVolume: 5,
      retailSlippages: [2, 4],
      recoveryTicks: 7,
    });
    expect(result).toMatchObject({
      midPrice: 100,
      lastPrice: 101,
      depth: 100,
      fillRate: 0.5,
      cancelToTradeRatio: 3,
      totalVolume: 5,
      retailSlippageBps: 3,
      recoveryTicks: 7,
    });
    expect(result.spreadBps).toBeCloseTo(20);
    expect(result.volatilityBps).toBeGreaterThan(90);
    expect(result.priceErrorBps).toBeCloseTo(49.75, 1);
    expect(result.marketQualityScore).toBeGreaterThanOrEqual(0);
  });

  it("uses last price and safe zero defaults for an empty market", () => {
    const empty: BookView = {
      bids: [],
      asks: [],
      bestBid: null,
      bestAsk: null,
      spread: null,
      midPrice: null,
    };
    const result = calculateMetrics({
      book: empty,
      lastPrice: 12,
      fundamentalPrice: 12,
      priceHistory: [],
      agents: [],
      totalVolume: 0,
      retailSlippages: [],
      recoveryTicks: null,
    });
    expect(result).toMatchObject({
      midPrice: 12,
      spreadBps: 0,
      volatilityBps: 0,
      fillRate: 0,
      cancelToTradeRatio: 0,
      marketQualityScore: 100,
    });
  });

  it("expresses improvement with correct direction and a zero baseline", () => {
    expect(percentageImprovement(100, 80)).toBe(20);
    expect(percentageImprovement(100, 120)).toBe(-20);
    expect(percentageImprovement(0, 4)).toBe(0);
  });
});
