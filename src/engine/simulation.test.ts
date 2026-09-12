import { describe, expect, it } from "vitest";

import { scenarioById, scenarios } from "./scenarios";
import {
  createDefaultConfig,
  MarketSimulation,
  runBatchExperiment,
  runCounterfactual,
} from "./simulation";
import type { ScenarioId } from "./types";

describe("scenario registry", () => {
  it("contains ten documented research scenarios", () => {
    expect(scenarios).toHaveLength(10);
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(10);
    expect(scenarioById("flash-crash").shockTick).toBe(70);
    expect(() => scenarioById("missing" as ScenarioId)).toThrow(
      "Unknown scenario",
    );
  });
});

describe("MarketSimulation", () => {
  it("starts with a seeded two-sided book and participant population", () => {
    const simulation = new MarketSimulation(createDefaultConfig());
    const snapshot = simulation.snapshot();
    expect(snapshot.tick).toBe(0);
    expect(snapshot.status).toBe("ready");
    expect(snapshot.book.bids.length).toBeGreaterThan(0);
    expect(snapshot.book.asks.length).toBeGreaterThan(0);
    expect(snapshot.agents).toHaveLength(12);
    expect(snapshot.priceHistory).toHaveLength(1);
  });

  it("is deterministic for identical seeds and differs for another seed", () => {
    const config = {
      ...createDefaultConfig("stable"),
      maxTicks: 80,
      seed: 123,
    };
    const first = new MarketSimulation(config).runToEnd();
    const second = new MarketSimulation(config).runToEnd();
    const third = new MarketSimulation({ ...config, seed: 456 }).runToEnd();
    expect(first.priceHistory).toEqual(second.priceHistory);
    expect(first.priceHistory).not.toEqual(third.priceHistory);
  });

  it("reproduces the canonical event stream hash for an identical seed", () => {
    const config = {
      ...createDefaultConfig("information-shock"),
      maxTicks: 90,
    };
    const first = new MarketSimulation(config).runToEnd();
    const second = new MarketSimulation(config).runToEnd();
    expect(first.eventStreamHash).toBe(second.eventStreamHash);
    expect(first.latestSequenceNumber).toBeGreaterThan(100);
  });

  it("conserves inventory and cash after accounting for exchange fees", () => {
    const final = new MarketSimulation({
      ...createDefaultConfig("flash-crash"),
      maxTicks: 100,
    }).runToEnd();
    expect(final.conservation.inventoryConserved).toBe(true);
    expect(final.conservation.cashConserved).toBe(true);
    expect(final.conservation.currentInventory).toBe(
      final.conservation.initialInventory,
    );
  });

  it.each(scenarios.map((scenario) => scenario.id))(
    "runs %s to completion with finite metrics",
    (scenario) => {
      const simulation = new MarketSimulation({
        ...createDefaultConfig(scenario),
        maxTicks: 130,
      });
      const snapshot = simulation.runToEnd();
      expect(snapshot.status).toBe("complete");
      expect(snapshot.tick).toBe(130);
      expect(
        Object.values(snapshot.metrics)
          .filter((value): value is number => typeof value === "number")
          .every(Number.isFinite),
      ).toBe(true);
      expect(simulation.tradeCount()).toBeGreaterThan(0);
    },
  );

  it("emits scenario-specific crisis alerts", () => {
    const flash = new MarketSimulation({
      ...createDefaultConfig("flash-crash"),
      maxTicks: 80,
    }).runToEnd();
    const drought = new MarketSimulation({
      ...createDefaultConfig("liquidity-drought"),
      maxTicks: 65,
    }).runToEnd();
    const information = new MarketSimulation({
      ...createDefaultConfig("information-shock"),
      maxTicks: 72,
    }).runToEnd();
    const latency = new MarketSimulation({
      ...createDefaultConfig("latency-race"),
      maxTicks: 52,
    }).runToEnd();
    expect(
      flash.alerts.some((alert) => alert.title === "Sell-Side Liquidity Shock"),
    ).toBe(true);
    expect(
      drought.alerts.some((alert) => alert.title === "Liquidity Withdrawal"),
    ).toBe(true);
    expect(
      information.alerts.some(
        (alert) => alert.title === "Fundamental Repricing",
      ),
    ).toBe(true);
    expect(
      latency.alerts.some((alert) => alert.title === "Unequal Reaction Speed"),
    ).toBe(true);
  });

  it("drives the additional scenario mechanisms through canonical events", () => {
    const cases = [
      ["institutional-liquidation", "institutional_parent_order"],
      ["volatility-feedback", "feedback_loop_seed"],
      ["cancellation-surge", "abnormal_cancellation_pattern"],
      ["exchange-outage", "synthetic_exchange_outage"],
      ["tick-size-experiment", "tick_size_changed"],
    ] as const;
    for (const [scenario, reasonCode] of cases) {
      const simulation = new MarketSimulation({
        ...createDefaultConfig(scenario),
        maxTicks: 80,
      });
      simulation.runToEnd();
      expect(
        simulation
          .eventStream()
          .some((event) => event.reasonCode === reasonCode),
      ).toBe(true);
    }
  });

  it("fires the configured circuit-breaker threshold deterministically", () => {
    const base = createDefaultConfig("information-shock");
    const simulation = new MarketSimulation({
      ...base,
      maxTicks: 85,
      policies: { ...base.policies, circuitBreakerThresholdPct: 0.01 },
    });
    simulation.runToEnd();
    expect(
      simulation
        .eventStream()
        .some((event) => event.eventType === "RegulatoryTrigger"),
    ).toBe(true);
  });

  it("accepts manual orders and applies policy updates", () => {
    const simulation = new MarketSimulation(createDefaultConfig("stable"));
    const afterOrder = simulation.submitManualOrder({
      side: "buy",
      type: "market",
      quantity: 5,
    });
    expect(afterOrder.agents.some((agent) => agent.id === "manual")).toBe(true);
    expect(afterOrder.decisions[0]?.reason).toBe("Manual order");
    const policies = { ...createDefaultConfig().policies, speedBumpTicks: 5 };
    const afterPolicy = simulation.setPolicies(policies);
    expect(simulation.config.policies.speedBumpTicks).toBe(5);
    expect(afterPolicy.alerts[0]?.title).toBe("Policy Settings Changed");
  });

  it("applies transmission and exchange latency before retail order arrival", () => {
    const simulation = new MarketSimulation(createDefaultConfig("stable"));
    simulation.submitManualOrder({ side: "buy", type: "market", quantity: 5 });
    expect(
      simulation
        .eventStream()
        .some(
          (event) =>
            event.eventType === "NewOrder" && event.agentId === "manual",
        ),
    ).toBe(false);
    simulation.step();
    simulation.step();
    simulation.step();
    expect(
      simulation
        .eventStream()
        .some(
          (event) =>
            event.eventType === "NewOrder" && event.agentId === "manual",
        ),
    ).toBe(true);
    const decision = simulation
      .decisionsSince(0)
      .find((item) => item.agentId === "manual")!;
    expect(decision.latency).toMatchObject({
      marketDataTicks: 2,
      decisionTicks: 1,
      transmissionTicks: 2,
      exchangeProcessingTicks: 1,
    });
    expect(decision.variables).toHaveProperty("visibleDepth");
  });

  it("rejects an unaffordable manual sell without corrupting state", () => {
    const simulation = new MarketSimulation(createDefaultConfig("stable"));
    const snapshot = simulation.submitManualOrder({
      side: "sell",
      type: "market",
      quantity: 5_000,
    });
    const manual = snapshot.agents.find((agent) => agent.id === "manual")!;
    expect(manual.inventory).toBeGreaterThanOrEqual(0);
    expect(manual.lastDecision).toContain("Manual order");
  });

  it("returns an unchanged snapshot after a completed simulation is stepped", () => {
    const simulation = new MarketSimulation({
      ...createDefaultConfig(),
      maxTicks: 1,
    });
    const completed = simulation.runToEnd();
    expect(simulation.step()).toEqual(completed);
  });

  it("runs paired deterministic policy experiments", () => {
    const result = runCounterfactual({
      ...createDefaultConfig("flash-crash"),
      maxTicks: 100,
      seed: 99,
    });
    expect(result.baseline.label).toBe("Unregulated baseline");
    expect(result.intervention.label).toBe("Policy intervention");
    expect(result.baseline.seed).toBe(result.intervention.seed);
    expect(result.baseline.trades).toBeGreaterThan(14);
    expect(result.intervention.policies.circuitBreaker).toBe(true);
    expect(Object.values(result.improvements).every(Number.isFinite)).toBe(
      true,
    );
  });

  it("aggregates paired seeds into deterministic simulation intervals", () => {
    const config = {
      ...createDefaultConfig("flash-crash"),
      maxTicks: 90,
      seed: 700,
    };
    const first = runBatchExperiment(config, 3);
    const second = runBatchExperiment(config, 3);
    expect(first).toEqual(second);
    expect(first.runs).toBe(3);
    expect(first.summaries).toHaveLength(5);
    expect(
      first.summaries.every(
        (summary) => summary.intervalLow <= summary.intervalHigh,
      ),
    ).toBe(true);
  });
});
