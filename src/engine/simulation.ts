import { calculateMetrics, percentageImprovement } from "./metrics";
import { defaultPolicies, LimitOrderBook, participantLabel } from "./orderBook";
import { SeededRandom } from "./rng";
import { scenarioById } from "./scenarios";
import type {
  AgentKind,
  AgentState,
  AgentView,
  CounterfactualResult,
  DecisionEvent,
  ExperimentResult,
  MarketAlert,
  MarketMetrics,
  MarketSnapshot,
  OrderRequest,
  PolicyConfig,
  PricePoint,
  ScenarioId,
  SimulationConfig,
  SimulationStatus,
  Trade,
} from "./types";

const round = (value: number, digits = 4): number =>
  Number(value.toFixed(digits));
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const agentBlueprints: readonly [AgentKind, number][] = [
  ["market-maker", 2],
  ["noise", 4],
  ["momentum", 2],
  ["value", 2],
  ["institutional", 1],
  ["latency", 1],
];

export const createDefaultConfig = (
  scenario: ScenarioId = "flash-crash",
): SimulationConfig => ({
  seed: 20_260_911,
  scenario,
  maxTicks: 220,
  initialPrice: 100,
  policies: defaultPolicies(),
});

export class MarketSimulation {
  readonly config: SimulationConfig;
  private readonly random: SeededRandom;
  private readonly book: LimitOrderBook;
  private agents: AgentState[];
  private tick = 0;
  private status: SimulationStatus = "ready";
  private fundamentalPrice: number;
  private lastPrice: number;
  private referencePrice: number;
  private haltUntilTick: number | null = null;
  private eventLabel = "Opening liquidity established";
  private trades: Trade[] = [];
  private decisions: DecisionEvent[] = [];
  private alerts: MarketAlert[] = [];
  private history: PricePoint[] = [];
  private retailSlippages: number[] = [];
  private totalVolume = 0;
  private recoveryTicks: number | null = null;
  private shockObserved = false;
  private crisisDeteriorated = false;

  constructor(config: SimulationConfig) {
    this.config = {
      ...config,
      policies: { ...config.policies },
    };
    this.random = new SeededRandom(config.seed);
    this.book = new LimitOrderBook(config.policies);
    this.fundamentalPrice = config.initialPrice;
    this.lastPrice = config.initialPrice;
    this.referencePrice = config.initialPrice;
    this.agents = this.createAgents();
    this.seedOpeningBook();
    this.captureHistory();
  }

  step(): MarketSnapshot {
    if (this.status === "complete") return this.snapshot();
    this.tick += 1;
    this.book.setTick(this.tick);
    this.status = "running";
    this.eventLabel = "Continuous trading";
    this.evolveFundamental();
    this.applyScenarioState();

    if (this.haltUntilTick !== null && this.tick < this.haltUntilTick) {
      this.status = "halted";
      this.eventLabel = `Circuit breaker: ${this.haltUntilTick - this.tick} ticks remaining`;
    } else {
      if (this.haltUntilTick !== null && this.tick >= this.haltUntilTick) {
        this.alert(
          "success",
          "Trading resumed",
          "The circuit-breaker pause has ended.",
        );
        this.haltUntilTick = null;
      }
      for (const agent of this.agents) this.act(agent);
    }

    this.captureHistory();
    this.checkCircuitBreaker();
    this.checkRecovery();
    if (this.tick >= this.config.maxTicks) this.status = "complete";
    return this.snapshot();
  }

  runToEnd(): MarketSnapshot {
    while (this.status !== "complete") this.step();
    return this.snapshot();
  }

  tradeCount(): number {
    return this.trades.length;
  }

  submitManualOrder(
    request: Omit<OrderRequest, "agentId" | "agentKind">,
  ): MarketSnapshot {
    let manual = this.agents.find((agent) => agent.id === "manual");
    if (!manual) {
      manual = this.makeAgent("manual", "noise", "Manual participant", 0);
      this.agents.push(manual);
    }
    this.submit(
      manual,
      { ...request, agentId: manual.id, agentKind: manual.kind },
      "Manual order",
    );
    return this.snapshot();
  }

  setPolicies(policies: PolicyConfig): MarketSnapshot {
    this.config.policies = { ...policies };
    this.book.setPolicies(this.config.policies);
    this.alert(
      "info",
      "Policy settings changed",
      "New controls apply to subsequent orders.",
    );
    return this.snapshot();
  }

  snapshot(status = this.status): MarketSnapshot {
    const book = this.book.view();
    const metrics = this.metrics(book);
    const price = book.midPrice ?? this.lastPrice;
    const agents: AgentView[] = this.agents
      .filter((agent) => agent.id !== "liquidity-reserve")
      .map((agent) => {
        const wealth = agent.cash + agent.inventory * price;
        return {
          ...agent,
          wealth,
          pnl: wealth - agent.initialWealth,
          fillRate:
            agent.submittedQuantity === 0
              ? 0
              : agent.executedQuantity / agent.submittedQuantity,
        };
      });
    return {
      tick: this.tick,
      status,
      scenario: this.config.scenario,
      seed: this.config.seed,
      book,
      lastPrice: this.lastPrice,
      fundamentalPrice: this.fundamentalPrice,
      metrics,
      recentTrades: this.trades.slice(-14).reverse(),
      agents,
      decisions: this.decisions.slice(-8).reverse(),
      alerts: this.alerts.slice(-8).reverse(),
      priceHistory: this.history.slice(-220),
      haltUntilTick: this.haltUntilTick,
      eventLabel: this.eventLabel,
    };
  }

  private createAgents(): AgentState[] {
    const agents: AgentState[] = [];
    for (const [kind, count] of agentBlueprints) {
      for (let index = 0; index < count; index += 1) {
        agents.push(
          this.makeAgent(
            `${kind}-${index + 1}`,
            kind,
            `${participantLabel(kind)} ${index + 1}`,
            kind === "latency" ? 0 : index % 2,
          ),
        );
      }
    }
    const reserve = this.makeAgent(
      "liquidity-reserve",
      "market-maker",
      "Passive depth reserve",
      0,
    );
    reserve.cash = 1_000_000;
    reserve.inventory = 10_000;
    reserve.initialWealth =
      reserve.cash + reserve.inventory * this.config.initialPrice;
    reserve.active = false;
    agents.push(reserve);
    return agents;
  }

  private makeAgent(
    id: string,
    kind: AgentKind,
    label: string,
    latencyTicks: number,
  ): AgentState {
    const cash = 100_000;
    const inventory = 1_000;
    return {
      id,
      kind,
      label,
      cash,
      inventory,
      initialWealth: cash + inventory * this.config.initialPrice,
      submittedQuantity: 0,
      executedQuantity: 0,
      cancellations: 0,
      trades: 0,
      latencyTicks,
      active: true,
      lastDecision: "Awaiting first decision",
    };
  }

  private seedOpeningBook(): void {
    this.book.setTick(0);
    const makers = this.agents.filter((agent) => agent.kind === "market-maker");
    for (let level = 1; level <= 10; level += 1) {
      const distance = 0.03 * level;
      for (const maker of makers) {
        this.submit(
          maker,
          {
            agentId: maker.id,
            agentKind: maker.kind,
            side: "buy",
            type: "limit",
            price: this.config.initialPrice - distance,
            quantity: 15 + level * 2,
          },
          "Opening bid liquidity",
          false,
        );
        this.submit(
          maker,
          {
            agentId: maker.id,
            agentKind: maker.kind,
            side: "sell",
            type: "limit",
            price: this.config.initialPrice + distance,
            quantity: 15 + level * 2,
          },
          "Opening ask liquidity",
          false,
        );
      }
    }
    const reserve = this.agents.find(
      (agent) => agent.id === "liquidity-reserve",
    )!;
    for (let level = 1; level <= 24; level += 1) {
      const distance = 0.35 * level;
      this.submit(
        reserve,
        {
          agentId: reserve.id,
          agentKind: reserve.kind,
          side: "buy",
          type: "limit",
          price: this.config.initialPrice - distance,
          quantity: 25,
        },
        "Seeded deep bid liquidity",
        false,
      );
      this.submit(
        reserve,
        {
          agentId: reserve.id,
          agentKind: reserve.kind,
          side: "sell",
          type: "limit",
          price: this.config.initialPrice + distance,
          quantity: 25,
        },
        "Seeded deep ask liquidity",
        false,
      );
    }
  }

  private evolveFundamental(): void {
    const drift = this.random.between(-0.00018, 0.00018);
    this.fundamentalPrice = round(this.fundamentalPrice * (1 + drift));
  }

  private applyScenarioState(): void {
    const scenario = this.config.scenario;
    if (scenario === "information-shock" && this.tick === 70) {
      this.fundamentalPrice = round(this.fundamentalPrice * 0.94);
      this.shockObserved = true;
      this.eventLabel = "Negative information shock";
      this.alert(
        "critical",
        "Fundamental repricing",
        "Estimated value fell 6% in one tick.",
      );
    }
    if (scenario === "flash-crash" && this.tick === 70) {
      this.shockObserved = true;
      this.eventLabel = "Institutional sell program activated";
      this.alert(
        "critical",
        "Sell-side liquidity shock",
        "A large execution program arrived as quoted depth declined.",
      );
    }
    if (scenario === "liquidity-drought" && this.tick === 60) {
      this.shockObserved = true;
      this.eventLabel = "Market makers reducing exposure";
      this.alert(
        "warning",
        "Liquidity withdrawal",
        "Displayed market-maker depth is contracting.",
      );
    }
    if (scenario === "latency-race" && this.tick === 50) {
      this.shockObserved = true;
      this.eventLabel = "Latency asymmetry increased";
      this.alert(
        "warning",
        "Unequal reaction speed",
        "Low-latency agents can react before slower participants.",
      );
    }
  }

  private act(agent: AgentState): void {
    if (!agent.active) return;
    if ((this.tick + agent.latencyTicks) % (agent.latencyTicks + 1) !== 0)
      return;
    if (
      agent.kind === "latency" &&
      this.config.policies.speedBumpTicks > 0 &&
      this.tick % (this.config.policies.speedBumpTicks + 1) !== 0
    ) {
      agent.lastDecision = "Speed bump delayed action";
      return;
    }
    switch (agent.kind) {
      case "market-maker":
        this.actMarketMaker(agent);
        break;
      case "noise":
        this.actNoise(agent);
        break;
      case "momentum":
        this.actMomentum(agent);
        break;
      case "value":
        this.actValue(agent);
        break;
      case "institutional":
        this.actInstitutional(agent);
        break;
      case "latency":
        this.actLatency(agent);
        break;
    }
  }

  private actMarketMaker(agent: AgentState): void {
    const withdrawal =
      (this.config.scenario === "flash-crash" &&
        this.tick >= 66 &&
        this.tick <= 86) ||
      (this.config.scenario === "liquidity-drought" &&
        this.tick >= 60 &&
        this.tick <= 120);
    if (withdrawal) {
      this.cancelAgentOrders(
        agent,
        "Risk limits caused quoted liquidity withdrawal",
      );
      agent.lastDecision = "Withdrew quotes as inventory risk rose";
      return;
    }
    if (this.tick % 3 !== 0) return;
    this.cancelAgentOrders(
      agent,
      "Repriced two-sided quote around current fair value",
    );
    const inventorySkew = (agent.inventory - 1_000) * 0.0008;
    const halfSpread = 0.035 + Math.abs(agent.inventory - 1_000) * 0.0001;
    const center = this.fundamentalPrice - inventorySkew;
    const quantity = 22;
    this.submit(
      agent,
      {
        agentId: agent.id,
        agentKind: agent.kind,
        side: "buy",
        type: "limit",
        price: center - halfSpread,
        quantity,
      },
      "Quoted a bid around fair value with inventory skew",
    );
    this.submit(
      agent,
      {
        agentId: agent.id,
        agentKind: agent.kind,
        side: "sell",
        type: "limit",
        price: center + halfSpread,
        quantity,
      },
      "Quoted an ask around fair value with inventory skew",
    );
  }

  private actNoise(agent: AgentState): void {
    if (!this.random.chance(0.24)) return;
    const side = this.random.chance(0.5) ? "buy" : "sell";
    const type = this.random.chance(0.38) ? "market" : "limit";
    const quantity = this.random.integer(2, 10);
    const offset = this.random.between(0.01, 0.12) * (side === "buy" ? -1 : 1);
    this.submit(
      agent,
      {
        agentId: agent.id,
        agentKind: agent.kind,
        side,
        type,
        price: type === "limit" ? this.lastPrice + offset : undefined,
        quantity,
      },
      "Submitted heterogeneous retail-like flow",
    );
  }

  private actMomentum(agent: AgentState): void {
    if (this.tick % 4 !== 0 || this.history.length < 8) return;
    const earlier = this.history.at(-8)!.price;
    const trend = (this.lastPrice - earlier) / earlier;
    if (Math.abs(trend) < 0.0004) return;
    this.submit(
      agent,
      {
        agentId: agent.id,
        agentKind: agent.kind,
        side: trend > 0 ? "buy" : "sell",
        type: "market",
        quantity: clamp(Math.round(Math.abs(trend) * 4_000), 3, 18),
      },
      `Followed ${trend > 0 ? "positive" : "negative"} short-horizon price momentum`,
    );
  }

  private actValue(agent: AgentState): void {
    if (this.tick % 5 !== 0) return;
    const mid = this.book.view().midPrice ?? this.lastPrice;
    const gap = (this.fundamentalPrice - mid) / this.fundamentalPrice;
    if (Math.abs(gap) < 0.0007) return;
    this.submit(
      agent,
      {
        agentId: agent.id,
        agentKind: agent.kind,
        side: gap > 0 ? "buy" : "sell",
        type: "market",
        quantity: clamp(Math.round(Math.abs(gap) * 1_500), 4, 24),
      },
      `Traded toward estimated fundamental value (${round(gap * 10_000, 1)} bps gap)`,
    );
  }

  private actInstitutional(agent: AgentState): void {
    if (
      this.config.scenario === "flash-crash" &&
      this.tick >= 70 &&
      this.tick <= 78
    ) {
      this.submit(
        agent,
        {
          agentId: agent.id,
          agentKind: agent.kind,
          side: "sell",
          type: "market",
          quantity: 220,
        },
        "Executed one child order from a large sell program",
      );
    } else if (this.tick % 18 === 0) {
      const side = this.random.chance(0.5) ? "buy" : "sell";
      this.submit(
        agent,
        {
          agentId: agent.id,
          agentKind: agent.kind,
          side,
          type: "limit",
          price: this.fundamentalPrice + (side === "buy" ? -0.08 : 0.08),
          quantity: 25,
        },
        "Worked a patient institutional limit order",
      );
    }
  }

  private actLatency(agent: AgentState): void {
    if (this.tick % 2 !== 0) return;
    const mid = this.book.view().midPrice ?? this.lastPrice;
    const gap = (this.fundamentalPrice - mid) / this.fundamentalPrice;
    const threshold =
      this.config.scenario === "latency-race" ? 0.00012 : 0.00035;
    if (Math.abs(gap) < threshold) return;
    this.submit(
      agent,
      {
        agentId: agent.id,
        agentKind: agent.kind,
        side: gap > 0 ? "buy" : "sell",
        type: "market",
        quantity: clamp(Math.round(Math.abs(gap) * 2_500), 2, 12),
      },
      "Reacted to a short-lived price-to-value discrepancy",
    );
  }

  private submit(
    agent: AgentState,
    request: OrderRequest,
    reason: string,
    recordDecision = true,
  ): void {
    const quantity = this.affordableQuantity(agent, request);
    if (quantity <= 0) {
      agent.lastDecision = "Order rejected by cash or inventory constraint";
      return;
    }
    const result = this.book.submit({ ...request, quantity });
    if (!result.accepted) {
      agent.lastDecision = result.rejectedReason ?? "Order rejected";
      return;
    }
    agent.submittedQuantity += quantity;
    agent.lastDecision = reason;
    if (recordDecision) {
      this.decisions.push({
        tick: this.tick,
        agentId: agent.id,
        agentKind: agent.kind,
        action: `${request.side.toUpperCase()} ${quantity} ${request.type}`,
        reason,
      });
    }
    for (const trade of result.trades) this.processTrade(trade);
  }

  private affordableQuantity(agent: AgentState, request: OrderRequest): number {
    const open = this.book.getOrders(agent.id);
    if (request.side === "sell") {
      const reserved = open
        .filter((order) => order.side === "sell")
        .reduce((total, order) => total + order.remaining, 0);
      return Math.max(
        0,
        Math.min(request.quantity, Math.floor(agent.inventory - reserved)),
      );
    }
    const reservedCash = open
      .filter((order) => order.side === "buy")
      .reduce((total, order) => total + order.price * order.remaining, 0);
    const expectedPrice =
      request.type === "market"
        ? (this.book.view().bestAsk ?? this.lastPrice * 1.05)
        : request.price!;
    const unitCost =
      expectedPrice *
      (1 + Math.max(this.config.policies.takerFeeBps, 0) / 10_000);
    return Math.max(
      0,
      Math.min(
        request.quantity,
        Math.floor((agent.cash - reservedCash) / unitCost),
      ),
    );
  }

  private processTrade(trade: Trade): void {
    const buyer = this.agents.find((agent) => agent.id === trade.buyerId)!;
    const seller = this.agents.find((agent) => agent.id === trade.sellerId)!;
    const notional = trade.price * trade.quantity;
    buyer.cash = round(buyer.cash - notional - trade.buyerFee);
    buyer.inventory += trade.quantity;
    buyer.executedQuantity += trade.quantity;
    buyer.trades += 1;
    seller.cash = round(seller.cash + notional - trade.sellerFee);
    seller.inventory -= trade.quantity;
    seller.executedQuantity += trade.quantity;
    seller.trades += 1;
    this.lastPrice = trade.price;
    this.totalVolume += trade.quantity;
    this.trades.push(trade);
    if (trade.buyerKind === "noise") {
      this.retailSlippages.push(
        ((trade.price - this.fundamentalPrice) / this.fundamentalPrice) *
          10_000,
      );
    }
    if (trade.sellerKind === "noise") {
      this.retailSlippages.push(
        ((this.fundamentalPrice - trade.price) / this.fundamentalPrice) *
          10_000,
      );
    }
  }

  private cancelAgentOrders(agent: AgentState, reason: string): void {
    const orders = this.book.getOrders(agent.id);
    for (const order of orders) {
      const ratio = agent.cancellations / Math.max(agent.trades, 1);
      if (ratio >= this.config.policies.maxCancelToTradeRatio) {
        agent.lastDecision = "Cancellation throttled by order-to-trade policy";
        return;
      }
      const result = this.book.cancel(order.id, agent.id);
      if (result.cancelled) {
        agent.cancellations += 1;
        agent.lastDecision = reason;
      }
    }
  }

  private captureHistory(): void {
    const book = this.book.view();
    const price = book.midPrice ?? this.lastPrice;
    const spreadBps = book.spread ? (book.spread / price) * 10_000 : 0;
    this.history.push({
      tick: this.tick,
      price,
      fundamental: this.fundamentalPrice,
      spreadBps,
      volume: this.totalVolume,
    });
    if (this.tick % 20 === 0 && this.haltUntilTick === null) {
      this.referencePrice = price;
    }
  }

  private checkCircuitBreaker(): void {
    if (!this.config.policies.circuitBreaker || this.haltUntilTick !== null)
      return;
    const price = this.book.view().midPrice ?? this.lastPrice;
    const movePct =
      (Math.abs(price - this.referencePrice) / this.referencePrice) * 100;
    if (movePct >= this.config.policies.circuitBreakerThresholdPct) {
      this.haltUntilTick = this.tick + this.config.policies.haltTicks;
      this.status = "halted";
      this.eventLabel = "Circuit breaker activated";
      this.alert(
        "critical",
        "Circuit breaker activated",
        `${round(movePct, 2)}% reference-price move exceeded the configured threshold.`,
      );
    }
  }

  private checkRecovery(): void {
    const shockTick = scenarioById(this.config.scenario).shockTick;
    if (
      !this.shockObserved ||
      shockTick === null ||
      this.recoveryTicks !== null
    )
      return;
    const metrics = this.metrics(this.book.view());
    if (
      metrics.priceErrorBps >= 80 ||
      metrics.spreadBps >= 40 ||
      this.haltUntilTick !== null
    ) {
      this.crisisDeteriorated = true;
    }
    if (
      this.crisisDeteriorated &&
      this.tick > shockTick &&
      this.haltUntilTick === null &&
      metrics.priceErrorBps < 80 &&
      metrics.spreadBps < 40
    ) {
      this.recoveryTicks = this.tick - shockTick;
      this.alert(
        "success",
        "Market quality recovered",
        `Price error and spread normalized after ${this.recoveryTicks} ticks.`,
      );
    }
  }

  private metrics(book = this.book.view()): MarketMetrics {
    return calculateMetrics({
      book,
      lastPrice: this.lastPrice,
      fundamentalPrice: this.fundamentalPrice,
      priceHistory: this.history,
      agents: this.agents,
      totalVolume: this.totalVolume,
      retailSlippages: this.retailSlippages,
      recoveryTicks: this.recoveryTicks,
    });
  }

  private alert(
    severity: MarketAlert["severity"],
    title: string,
    detail: string,
  ): void {
    this.alerts.push({
      id: `A${this.alerts.length + 1}`,
      tick: this.tick,
      severity,
      title,
      detail,
    });
  }
}

const experiment = (
  label: string,
  config: SimulationConfig,
  policies: PolicyConfig,
): ExperimentResult => {
  const simulation = new MarketSimulation({
    ...config,
    policies: { ...policies },
  });
  const snapshots: MarketSnapshot[] = [];
  while (snapshots.at(-1)?.status !== "complete") {
    snapshots.push(simulation.step());
  }
  const finalSnapshot = snapshots.at(-1)!;
  const peakSpreadBps = Math.max(
    ...snapshots.map((snapshot) => snapshot.metrics.spreadBps),
  );
  const peakVolatilityBps = Math.max(
    ...snapshots.map((snapshot) => snapshot.metrics.volatilityBps),
  );
  const peakPriceErrorBps = Math.max(
    ...snapshots.map((snapshot) => snapshot.metrics.priceErrorBps),
  );
  const maximumDrawdownPct =
    ((config.initialPrice -
      Math.min(...finalSnapshot.priceHistory.map((point) => point.price))) /
      config.initialPrice) *
    100;
  const worstQualityScore = Math.min(
    ...snapshots.map((snapshot) => snapshot.metrics.marketQualityScore),
  );
  const resilienceScore = clamp(
    100 /
      (1 +
        peakSpreadBps / 250 +
        peakVolatilityBps / 100 +
        peakPriceErrorBps / 300),
    0,
    100,
  );
  return {
    label,
    scenario: config.scenario,
    seed: config.seed,
    policies,
    finalMetrics: finalSnapshot.metrics,
    priceHistory: finalSnapshot.priceHistory,
    alerts: finalSnapshot.alerts,
    trades: simulation.tradeCount(),
    stressMetrics: {
      peakSpreadBps,
      peakVolatilityBps,
      peakPriceErrorBps,
      maximumDrawdownPct,
      worstQualityScore,
      resilienceScore,
    },
  };
};

export const runCounterfactual = (
  config: SimulationConfig,
): CounterfactualResult => {
  const baselinePolicies: PolicyConfig = {
    ...config.policies,
    circuitBreaker: false,
    speedBumpTicks: 0,
    minimumRestingTicks: 0,
    maxCancelToTradeRatio: 1_000,
  };
  const baseline = experiment("Unregulated baseline", config, baselinePolicies);
  const intervention = experiment(
    "Policy intervention",
    config,
    config.policies,
  );
  return {
    baseline,
    intervention,
    improvements: {
      spreadPct: percentageImprovement(
        baseline.stressMetrics.peakSpreadBps,
        intervention.stressMetrics.peakSpreadBps,
      ),
      volatilityPct: percentageImprovement(
        baseline.stressMetrics.peakVolatilityBps,
        intervention.stressMetrics.peakVolatilityBps,
      ),
      priceErrorPct: percentageImprovement(
        baseline.stressMetrics.peakPriceErrorBps,
        intervention.stressMetrics.peakPriceErrorBps,
      ),
      marketQualityPoints:
        intervention.stressMetrics.resilienceScore -
        baseline.stressMetrics.resilienceScore,
    },
  };
};
