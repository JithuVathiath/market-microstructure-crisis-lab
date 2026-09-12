import { calculateMetrics, percentageImprovement } from "./metrics";
import { EventStore } from "./eventStore";
import {
  defaultPolicies,
  type ExchangeBook,
  LimitOrderBook,
  participantLabel,
} from "./orderBook";
import { SeededRandom } from "./rng";
import { scenarioById } from "./scenarios";
import type {
  AgentKind,
  AgentState,
  AgentView,
  BatchExperimentResult,
  BookView,
  CounterfactualResult,
  CausalStep,
  DecisionEvent,
  ExperimentResult,
  LatencyProfile,
  MarketAlert,
  MarketEvent,
  MarketEventType,
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

interface PendingOrder {
  dueTick: number;
  agentId: string;
  request: OrderRequest;
  reason: string;
}

export const createDefaultConfig = (
  scenario: ScenarioId = "flash-crash",
): SimulationConfig => ({
  seed: 20_260_911,
  scenario,
  maxTicks: 220,
  initialPrice: 100,
  policies: defaultPolicies(),
});

export type BookFactory = (policies: PolicyConfig) => ExchangeBook;

const defaultBookFactory: BookFactory = (policies) =>
  new LimitOrderBook(policies);

export class MarketSimulation {
  readonly config: SimulationConfig;
  private readonly random: SeededRandom;
  private readonly book: ExchangeBook;
  private readonly eventStore = new EventStore();
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
  private institutionalShortfalls: number[] = [];
  private totalVolume = 0;
  private recoveryTicks: number | null = null;
  private shockObserved = false;
  private crisisDeteriorated = false;
  private pendingOrders: PendingOrder[] = [];
  private exchangeFeeRevenue = 0;
  private initialCash = 0;
  private initialInventory = 0;

  constructor(
    config: SimulationConfig,
    bookFactory: BookFactory = defaultBookFactory,
  ) {
    this.config = {
      ...config,
      policies: { ...config.policies },
    };
    this.random = new SeededRandom(config.seed);
    this.book = bookFactory(config.policies);
    this.fundamentalPrice = config.initialPrice;
    this.lastPrice = config.initialPrice;
    this.referencePrice = config.initialPrice;
    this.agents = this.createAgents();
    this.initialCash = this.agents.reduce(
      (total, agent) => total + agent.cash,
      0,
    );
    this.initialInventory = this.agents.reduce(
      (total, agent) => total + agent.inventory,
      0,
    );
    this.seedOpeningBook();
    this.captureHistory();
  }

  step(): MarketSnapshot {
    this.advanceState();
    return this.snapshot();
  }

  advanceForAnalysis(): {
    status: SimulationStatus;
    metrics: MarketMetrics;
  } {
    const metrics = this.advanceState() ?? this.metrics();
    return { status: this.status, metrics };
  }

  private advanceState(): MarketMetrics | null {
    if (this.status === "complete") return null;
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
        this.book.resume("circuit_breaker_elapsed");
        this.collectCoreEvents();
      }
      this.flushPendingOrders();
      for (const agent of this.agents) this.act(agent);
    }

    const book = this.book.view();
    this.captureHistory(book);
    const metrics = this.metrics(book);
    this.checkCircuitBreaker(book);
    this.checkRecovery(metrics);
    if (this.tick >= this.config.maxTicks) this.status = "complete";
    return metrics;
  }

  runToEnd(): MarketSnapshot {
    while (this.status !== "complete") this.step();
    return this.snapshot();
  }

  tradeCount(): number {
    return this.trades.length;
  }

  eventStream(): MarketEvent[] {
    return this.eventStore.all();
  }

  eventsSince(sequenceNumber: number): MarketEvent[] {
    return this.eventStore.since(sequenceNumber);
  }

  decisionsSince(sequenceNumber: number): DecisionEvent[] {
    return this.decisions
      .filter((decision) => decision.sequenceNumber > sequenceNumber)
      .map((decision) => ({
        ...decision,
        latency: { ...decision.latency },
        variables: { ...decision.variables },
      }));
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
    this.recordEvent("PolicyChanged", "interactive_policy_update", {
      policies: { ...policies },
    });
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
      latestSequenceNumber: this.eventStore.latestSequenceNumber(),
      eventStreamHash: this.eventStore.hash(),
      recentEvents: this.eventStore.recent(30).reverse(),
      causalChain: this.causalChain(),
      conservation: this.conservationAudit(),
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
            index,
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
    profileIndex: number,
  ): AgentState {
    const cash = 100_000;
    const inventory = 1_000;
    return {
      id,
      kind,
      label,
      cash,
      inventory,
      inventoryLimit: kind === "institutional" ? 3_000 : 1_600,
      riskTolerance: kind === "market-maker" ? 0.72 : 0.86,
      observedPrice: this.config.initialPrice,
      privateValuation: this.config.initialPrice,
      initialWealth: cash + inventory * this.config.initialPrice,
      submittedQuantity: 0,
      executedQuantity: 0,
      cancellations: 0,
      trades: 0,
      latency: this.latencyProfile(kind, profileIndex),
      active: true,
      lastDecision: "Awaiting first decision",
      currentObjective: this.objectiveFor(kind),
    };
  }

  private latencyProfile(kind: AgentKind, index: number): LatencyProfile {
    if (kind === "latency" || kind === "market-maker") {
      return {
        label: index === 0 ? "Co-located algorithm" : "Low-latency institution",
        marketDataTicks: 0,
        decisionTicks: index,
        transmissionTicks: 0,
        exchangeProcessingTicks: 0,
      };
    }
    if (kind === "noise") {
      return {
        label: index % 2 === 0 ? "Retail broker" : "Retail participant",
        marketDataTicks: 2 + (index % 2),
        decisionTicks: 1 + (index % 2),
        transmissionTicks: 2 + (index % 2),
        exchangeProcessingTicks: 1,
      };
    }
    return {
      label: "Institutional participant",
      marketDataTicks: 1,
      decisionTicks: index % 2,
      transmissionTicks: 1,
      exchangeProcessingTicks: 1,
    };
  }

  private objectiveFor(kind: AgentKind): string {
    return {
      "market-maker": "Earn spread while controlling inventory exposure",
      noise: "Execute a heterogeneous liquidity demand",
      momentum: "Capture short-horizon price continuation",
      value: "Trade market price toward estimated fundamental value",
      institutional: "Complete the parent order with controlled market impact",
      latency: "Capture transient price-to-value discrepancies",
    }[kind];
  }

  private observedMarket(agent: AgentState): {
    price: number;
    fundamental: number;
  } {
    const index = Math.max(
      0,
      this.history.length - 1 - agent.latency.marketDataTicks,
    );
    const point = this.history[index];
    return {
      price: point?.price ?? this.lastPrice,
      fundamental: point?.fundamental ?? this.fundamentalPrice,
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
    const previous = this.fundamentalPrice;
    const drift = this.random.between(-0.00018, 0.00018);
    this.fundamentalPrice = round(this.fundamentalPrice * (1 + drift));
    this.recordEvent("FundamentalValueUpdated", "seeded_value_process", {
      previous,
      current: this.fundamentalPrice,
      drift,
    });
  }

  private applyScenarioState(): void {
    const scenario = this.config.scenario;
    if (scenario === "information-shock" && this.tick === 70) {
      this.fundamentalPrice = round(this.fundamentalPrice * 0.94);
      this.shockObserved = true;
      this.eventLabel = "Negative information shock";
      this.recordEvent("ShockTriggered", "negative_information_arrival", {
        fundamentalMovePct: -6,
      });
      this.alert(
        "critical",
        "Fundamental repricing",
        "Estimated value fell 6% in one tick.",
      );
    }
    if (scenario === "flash-crash" && this.tick === 70) {
      this.shockObserved = true;
      this.eventLabel = "Institutional sell program activated";
      this.recordEvent("ShockTriggered", "institutional_sell_program", {
        childOrderQuantity: 220,
        scheduledEndTick: 78,
      });
      this.alert(
        "critical",
        "Sell-side liquidity shock",
        "A large execution program arrived as quoted depth declined.",
      );
    }
    if (scenario === "liquidity-drought" && this.tick === 60) {
      this.shockObserved = true;
      this.eventLabel = "Market makers reducing exposure";
      this.recordEvent("ShockTriggered", "market_maker_risk_reduction", {
        scheduledEndTick: 120,
      });
      this.alert(
        "warning",
        "Liquidity withdrawal",
        "Displayed market-maker depth is contracting.",
      );
    }
    if (scenario === "latency-race" && this.tick === 50) {
      this.shockObserved = true;
      this.eventLabel = "Latency asymmetry increased";
      this.recordEvent("ShockTriggered", "latency_asymmetry", {
        lowLatencyAgent: "latency-1",
      });
      this.alert(
        "warning",
        "Unequal reaction speed",
        "Low-latency agents can react before slower participants.",
      );
    }
    if (scenario === "institutional-liquidation" && this.tick === 65) {
      this.shockObserved = true;
      this.eventLabel = "Institutional parent order activated";
      this.recordEvent("ShockTriggered", "institutional_parent_order", {
        childOrderQuantity: 145,
        scheduledEndTick: 78,
      });
      this.alert(
        "critical",
        "Institutional liquidation",
        "A scheduled parent sell order began releasing child orders.",
      );
    }
    if (scenario === "volatility-feedback" && this.tick === 60) {
      this.fundamentalPrice = round(this.fundamentalPrice * 0.98);
      this.shockObserved = true;
      this.eventLabel = "Volatility feedback shock";
      this.recordEvent("ShockTriggered", "feedback_loop_seed", {
        fundamentalMovePct: -2,
      });
      this.alert(
        "warning",
        "Feedback loop initiated",
        "A modest value shock activated stronger momentum responses.",
      );
    }
    if (scenario === "cancellation-surge" && this.tick === 55) {
      this.shockObserved = true;
      this.eventLabel = "Abnormal cancellation burst";
      this.recordEvent("ShockTriggered", "quote_cancellation_surge", {
        scheduledEndTick: 74,
      });
      this.alert(
        "warning",
        "Cancellation surge",
        "Displayed liquidity began disappearing unusually quickly.",
      );
    }
    if (scenario === "cancellation-surge" && this.tick === 60) {
      this.recordEvent("SurveillanceAlert", "abnormal_cancellation_pattern", {
        label: "Potential layering-like pattern detected",
        legalConclusion: false,
      });
      this.alert(
        "critical",
        "Potential layering-like pattern detected",
        "Synthetic cancellation activity crossed the configured surveillance pattern threshold; this is not a legal conclusion.",
      );
    }
    if (scenario === "exchange-outage" && this.tick === 65) {
      this.shockObserved = true;
      this.haltUntilTick = 75;
      this.book.halt("synthetic_exchange_outage");
      this.collectCoreEvents();
      this.recordEvent("ShockTriggered", "synthetic_exchange_outage", {
        resumeTick: 75,
      });
      this.alert(
        "critical",
        "Exchange outage",
        "The synthetic venue stopped accepting orders for ten logical ticks.",
      );
    }
    if (scenario === "tick-size-experiment" && this.tick === 70) {
      this.shockObserved = true;
      const previousTickSize = this.config.policies.tickSize;
      this.config.policies.tickSize = 0.05;
      this.book.setPolicies(this.config.policies);
      this.recordEvent("ShockTriggered", "tick_size_regime_change", {
        previousTickSize,
        newTickSize: 0.05,
      });
      this.recordEvent("PolicyChanged", "tick_size_changed", {
        tickSize: 0.05,
      });
      this.alert(
        "info",
        "Tick size changed",
        "New orders now use a $0.05 minimum price increment.",
      );
    }
  }

  private act(agent: AgentState): void {
    if (!agent.active) return;
    if (
      (this.tick + agent.latency.decisionTicks) %
        (agent.latency.decisionTicks + 1) !==
      0
    )
      return;
    const observed = this.observedMarket(agent);
    agent.observedPrice = observed.price;
    agent.privateValuation = observed.fundamental;
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
        this.tick <= 120) ||
      (this.config.scenario === "cancellation-surge" &&
        this.tick >= 55 &&
        this.tick <= 74);
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
    const center = agent.privateValuation - inventorySkew;
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
        price: type === "limit" ? agent.observedPrice + offset : undefined,
        quantity,
      },
      "Submitted heterogeneous retail-like flow",
    );
  }

  private actMomentum(agent: AgentState): void {
    if (this.tick % 4 !== 0 || this.history.length < 8) return;
    const earlier = this.history.at(-8)!.price;
    const trend = (agent.observedPrice - earlier) / earlier;
    if (Math.abs(trend) < 0.0004) return;
    this.submit(
      agent,
      {
        agentId: agent.id,
        agentKind: agent.kind,
        side: trend > 0 ? "buy" : "sell",
        type: "market",
        quantity: clamp(
          Math.round(
            Math.abs(trend) *
              (this.config.scenario === "volatility-feedback" ? 7_000 : 4_000),
          ),
          3,
          this.config.scenario === "volatility-feedback" ? 30 : 18,
        ),
      },
      `Followed ${trend > 0 ? "positive" : "negative"} short-horizon price momentum`,
    );
  }

  private actValue(agent: AgentState): void {
    if (this.tick % 5 !== 0) return;
    const gap =
      (agent.privateValuation - agent.observedPrice) / agent.privateValuation;
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
      (this.config.scenario === "flash-crash" &&
        this.tick >= 70 &&
        this.tick <= 78) ||
      (this.config.scenario === "institutional-liquidation" &&
        this.tick >= 65 &&
        this.tick <= 78)
    ) {
      this.submit(
        agent,
        {
          agentId: agent.id,
          agentKind: agent.kind,
          side: "sell",
          type: "market",
          quantity:
            this.config.scenario === "institutional-liquidation" ? 145 : 220,
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
          price: agent.privateValuation + (side === "buy" ? -0.08 : 0.08),
          quantity: 25,
        },
        "Worked a patient institutional limit order",
      );
    }
  }

  private actLatency(agent: AgentState): void {
    if (this.tick % 2 !== 0) return;
    const gap =
      (agent.privateValuation - agent.observedPrice) / agent.privateValuation;
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
    bypassLatency = false,
  ): void {
    const quantity = this.affordableQuantity(agent, request);
    if (quantity <= 0) {
      agent.lastDecision = "Order rejected by cash or inventory constraint";
      return;
    }
    const adjustedRequest = { ...request, quantity };
    if (recordDecision)
      this.recordAgentDecision(agent, adjustedRequest, reason);

    const deliveryTicks =
      agent.latency.transmissionTicks + agent.latency.exchangeProcessingTicks;
    if (!bypassLatency && recordDecision && deliveryTicks > 0) {
      const dueTick = this.tick + deliveryTicks;
      this.pendingOrders.push({
        dueTick,
        agentId: agent.id,
        request: adjustedRequest,
        reason,
      });
      agent.lastDecision = `${reason} · queued for exchange arrival at T${dueTick}`;
      return;
    }

    const result = this.book.submit(adjustedRequest);
    this.collectCoreEvents();
    if (!result.accepted) {
      agent.lastDecision = result.rejectedReason ?? "Order rejected";
      return;
    }
    agent.submittedQuantity += quantity;
    agent.lastDecision = reason;
    for (const trade of result.trades) this.processTrade(trade);
  }

  private flushPendingOrders(): void {
    const due = this.pendingOrders.filter(
      (order) => order.dueTick <= this.tick,
    );
    this.pendingOrders = this.pendingOrders.filter(
      (order) => order.dueTick > this.tick,
    );
    for (const pending of due) {
      const agent = this.agents.find(
        (candidate) => candidate.id === pending.agentId,
      );
      if (!agent) continue;
      this.submit(agent, pending.request, pending.reason, false, true);
    }
  }

  private recordAgentDecision(
    agent: AgentState,
    request: OrderRequest,
    reason: string,
  ): void {
    const metrics = this.metrics();
    const riskUtilization =
      Math.abs(agent.inventory - 1_000) /
      Math.max(1, agent.inventoryLimit - 1_000);
    const event = this.eventStore.append({
      simulationTimestamp: this.tick,
      eventType: "AgentStateChange",
      agentId: agent.id,
      orderId: null,
      parentOrderId: null,
      side: request.side,
      price: request.price ?? null,
      quantity: request.quantity,
      remainingQuantity: request.quantity,
      reasonCode: "strategy_decision",
      metadata: {
        agentKind: agent.kind,
        action: request.type,
        objective: agent.currentObjective,
        observedPrice: agent.observedPrice,
        fundamentalEstimate: agent.privateValuation,
        inventory: agent.inventory,
        inventoryLimit: agent.inventoryLimit,
        riskUtilization: round(riskUtilization, 4),
        latency: { ...agent.latency },
        reason,
        variables: {
          spreadBps: round(metrics.spreadBps, 2),
          volatilityBps: round(metrics.volatilityBps, 2),
          priceGapBps: round(
            ((agent.privateValuation - agent.observedPrice) /
              agent.privateValuation) *
              10_000,
            2,
          ),
          visibleDepth: metrics.depth,
        },
      },
    });
    this.decisions.push({
      sequenceNumber: event.sequenceNumber,
      tick: this.tick,
      agentId: agent.id,
      agentKind: agent.kind,
      action: `${request.side.toUpperCase()} ${request.quantity} ${request.type}${
        request.price === undefined ? "" : ` @ $${request.price.toFixed(2)}`
      }`,
      reason,
      observedPrice: agent.observedPrice,
      fundamentalEstimate: agent.privateValuation,
      inventory: agent.inventory,
      inventoryLimit: agent.inventoryLimit,
      riskUtilization: round(riskUtilization, 4),
      latency: { ...agent.latency },
      objective: agent.currentObjective,
      variables: {
        spreadBps: round(metrics.spreadBps, 2),
        volatilityBps: round(metrics.volatilityBps, 2),
        priceGapBps: round(
          ((agent.privateValuation - agent.observedPrice) /
            agent.privateValuation) *
            10_000,
          2,
        ),
        visibleDepth: metrics.depth,
      },
    });
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
    this.exchangeFeeRevenue = round(
      this.exchangeFeeRevenue + trade.buyerFee + trade.sellerFee,
    );
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
    if (trade.buyerKind === "institutional") {
      this.institutionalShortfalls.push(
        ((trade.price - this.fundamentalPrice) / this.fundamentalPrice) *
          10_000,
      );
    }
    if (trade.sellerKind === "institutional") {
      this.institutionalShortfalls.push(
        ((this.fundamentalPrice - trade.price) / this.fundamentalPrice) *
          10_000,
      );
    }
  }

  private cancelAgentOrders(agent: AgentState, reason: string): void {
    const orders = this.book.getOrders(agent.id);
    const decisionMetrics = orders.length > 0 ? this.metrics() : null;
    for (const order of orders) {
      const ratio = agent.cancellations / Math.max(agent.trades, 1);
      if (ratio >= this.config.policies.maxCancelToTradeRatio) {
        agent.lastDecision = "Cancellation throttled by order-to-trade policy";
        return;
      }
      const result = this.book.cancel(order.id, agent.id);
      this.collectCoreEvents();
      if (result.cancelled) {
        agent.cancellations += 1;
        agent.lastDecision = reason;
        const event = this.eventStore.append({
          simulationTimestamp: this.tick,
          eventType: "AgentStateChange",
          agentId: agent.id,
          orderId: order.id,
          parentOrderId: null,
          side: order.side,
          price: order.price,
          quantity: order.remaining,
          remainingQuantity: order.remaining,
          reasonCode: "strategy_cancellation",
          metadata: {
            agentKind: agent.kind,
            objective: agent.currentObjective,
          },
        });
        this.decisions.push({
          sequenceNumber: event.sequenceNumber,
          tick: this.tick,
          agentId: agent.id,
          agentKind: agent.kind,
          action: `CANCEL ${order.side.toUpperCase()} ${order.remaining} @ $${order.price.toFixed(2)}`,
          reason,
          observedPrice: agent.observedPrice,
          fundamentalEstimate: agent.privateValuation,
          inventory: agent.inventory,
          inventoryLimit: agent.inventoryLimit,
          riskUtilization: round(
            Math.abs(agent.inventory - 1_000) /
              Math.max(1, agent.inventoryLimit - 1_000),
            4,
          ),
          latency: { ...agent.latency },
          objective: agent.currentObjective,
          variables: {
            spreadBps: round(decisionMetrics?.spreadBps ?? 0, 2),
            volatilityBps: round(decisionMetrics?.volatilityBps ?? 0, 2),
            queueAgeTicks: this.tick - order.createdTick,
            cancellations: agent.cancellations,
          },
        });
      }
    }
  }

  private captureHistory(book: BookView = this.book.view()): void {
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

  private checkCircuitBreaker(book: BookView = this.book.view()): void {
    if (!this.config.policies.circuitBreaker || this.haltUntilTick !== null)
      return;
    const price = book.midPrice ?? this.lastPrice;
    const movePct =
      (Math.abs(price - this.referencePrice) / this.referencePrice) * 100;
    if (movePct >= this.config.policies.circuitBreakerThresholdPct) {
      this.haltUntilTick = this.tick + this.config.policies.haltTicks;
      this.book.halt("reference_price_threshold");
      this.collectCoreEvents();
      this.recordEvent("RegulatoryTrigger", "circuit_breaker_threshold", {
        movePct: round(movePct, 4),
        thresholdPct: this.config.policies.circuitBreakerThresholdPct,
        haltUntilTick: this.haltUntilTick,
      });
      this.status = "halted";
      this.eventLabel = "Circuit breaker activated";
      this.alert(
        "critical",
        "Circuit breaker activated",
        `${round(movePct, 2)}% reference-price move exceeded the configured threshold.`,
      );
    }
  }

  private checkRecovery(metrics: MarketMetrics = this.metrics()): void {
    const shockTick = scenarioById(this.config.scenario).shockTick;
    if (
      !this.shockObserved ||
      shockTick === null ||
      this.recoveryTicks !== null
    )
      return;
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
      institutionalShortfalls: this.institutionalShortfalls,
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

  private collectCoreEvents(): void {
    this.eventStore.ingestCore(this.book.drainCoreEvents());
  }

  private recordEvent(
    eventType: MarketEventType,
    reasonCode: string,
    metadata: Record<string, unknown> = {},
  ): MarketEvent {
    return this.eventStore.append({
      simulationTimestamp: this.tick,
      eventType,
      agentId: null,
      orderId: null,
      parentOrderId: null,
      side: null,
      price: null,
      quantity: null,
      remainingQuantity: null,
      reasonCode,
      metadata,
    });
  }

  private conservationAudit(): MarketSnapshot["conservation"] {
    const currentCash = round(
      this.agents.reduce((total, agent) => total + agent.cash, 0),
    );
    const currentInventory = this.agents.reduce(
      (total, agent) => total + agent.inventory,
      0,
    );
    return {
      initialCash: this.initialCash,
      currentCash,
      exchangeFeeRevenue: this.exchangeFeeRevenue,
      initialInventory: this.initialInventory,
      currentInventory,
      cashConserved:
        Math.abs(currentCash + this.exchangeFeeRevenue - this.initialCash) <
        0.02,
      inventoryConserved: currentInventory === this.initialInventory,
    };
  }

  private causalChain(): CausalStep[] {
    const events = this.eventStore.all();
    const shock = events.find((event) => event.eventType === "ShockTriggered");
    if (!shock) return [];
    const candidates = [
      events.find(
        (event) =>
          event.eventType === "CancelOrder" &&
          event.agentId?.startsWith("market-maker") &&
          event.simulationTimestamp >= shock.simulationTimestamp - 10,
      ),
      shock,
      events.find(
        (event) =>
          event.sequenceNumber > shock.sequenceNumber &&
          event.eventType === "NewOrder" &&
          event.metadata.agentKind === "institutional",
      ),
      events.find(
        (event) =>
          event.sequenceNumber > shock.sequenceNumber &&
          (event.eventType === "Trade" || event.eventType === "PartialFill") &&
          event.side === "sell",
      ),
      events.find(
        (event) =>
          event.sequenceNumber > shock.sequenceNumber &&
          event.eventType === "RegulatoryTrigger",
      ),
      events.find(
        (event) =>
          event.sequenceNumber > shock.sequenceNumber &&
          event.eventType === "TradingResume",
      ),
    ].filter((event): event is MarketEvent => event !== undefined);

    const label = (event: MarketEvent): string => {
      if (event.eventType === "CancelOrder")
        return "Quoted liquidity withdrawn";
      if (event.eventType === "ShockTriggered")
        return "Scenario shock activated";
      if (event.eventType === "NewOrder")
        return "Institutional child order arrived";
      if (event.eventType === "Trade" || event.eventType === "PartialFill") {
        return "Bid-side liquidity consumed";
      }
      if (event.eventType === "RegulatoryTrigger")
        return "Market safeguard triggered";
      return "Continuous trading resumed";
    };
    const evidence = (event: MarketEvent): string => {
      if (event.eventType === "NewOrder") {
        return `${event.side ?? "order"} order ${event.orderId ?? ""} for ${event.quantity ?? 0} units`;
      }
      if (event.eventType === "Trade" || event.eventType === "PartialFill") {
        return `${event.quantity ?? 0} units executed at $${event.price?.toFixed(2) ?? "—"}`;
      }
      if (event.eventType === "RegulatoryTrigger") {
        return `${String(event.metadata.movePct)}% move exceeded ${String(event.metadata.thresholdPct)}% threshold`;
      }
      return event.reasonCode.replaceAll("_", " ");
    };
    return candidates.map((event) => ({
      sequenceNumber: event.sequenceNumber,
      tick: event.simulationTimestamp,
      label: label(event),
      evidence: evidence(event),
    }));
  }
}

const experiment = (
  label: string,
  config: SimulationConfig,
  policies: PolicyConfig,
  bookFactory: BookFactory,
): ExperimentResult => {
  const simulation = new MarketSimulation(
    {
      ...config,
      policies: { ...policies },
    },
    bookFactory,
  );
  const samples: MarketMetrics[] = [];
  let status: SimulationStatus = "ready";
  while (status !== "complete") {
    const sample = simulation.advanceForAnalysis();
    status = sample.status;
    samples.push(sample.metrics);
  }
  const finalSnapshot = simulation.snapshot();
  const peakSpreadBps = Math.max(
    ...samples.map((metrics) => metrics.spreadBps),
  );
  const peakVolatilityBps = Math.max(
    ...samples.map((metrics) => metrics.volatilityBps),
  );
  const peakPriceErrorBps = Math.max(
    ...samples.map((metrics) => metrics.priceErrorBps),
  );
  const maximumDrawdownPct =
    ((config.initialPrice -
      Math.min(...finalSnapshot.priceHistory.map((point) => point.price))) /
      config.initialPrice) *
    100;
  const worstQualityScore = Math.min(
    ...samples.map((metrics) => metrics.marketQualityScore),
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
  bookFactory: BookFactory = defaultBookFactory,
): CounterfactualResult => {
  const baselinePolicies: PolicyConfig = {
    ...config.policies,
    circuitBreaker: false,
    speedBumpTicks: 0,
    minimumRestingTicks: 0,
    maxCancelToTradeRatio: 1_000,
  };
  const baseline = experiment(
    "Unregulated baseline",
    config,
    baselinePolicies,
    bookFactory,
  );
  const intervention = experiment(
    "Policy intervention",
    config,
    config.policies,
    bookFactory,
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

const average = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0) /
  Math.max(values.length, 1);

const quantile = (values: number[], probability: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const weight = position - lower;
  return sorted[lower + 1] === undefined
    ? sorted[lower]!
    : sorted[lower]! * (1 - weight) + sorted[lower + 1]! * weight;
};

export const runBatchExperiment = (
  config: SimulationConfig,
  runs: number,
  bookFactory: BookFactory = defaultBookFactory,
): BatchExperimentResult => {
  const count = clamp(Math.floor(runs), 2, 100);
  const paired = Array.from({ length: count }, (_, index) =>
    runCounterfactual({ ...config, seed: config.seed + index }, bookFactory),
  );
  const metrics = [
    {
      metric: "Peak quoted spread",
      unit: "bps",
      baseline: (run: CounterfactualResult) =>
        run.baseline.stressMetrics.peakSpreadBps,
      intervention: (run: CounterfactualResult) =>
        run.intervention.stressMetrics.peakSpreadBps,
      improvement: (baseline: number, intervention: number) =>
        baseline - intervention,
    },
    {
      metric: "Peak volatility",
      unit: "bps",
      baseline: (run: CounterfactualResult) =>
        run.baseline.stressMetrics.peakVolatilityBps,
      intervention: (run: CounterfactualResult) =>
        run.intervention.stressMetrics.peakVolatilityBps,
      improvement: (baseline: number, intervention: number) =>
        baseline - intervention,
    },
    {
      metric: "Peak price-discovery error",
      unit: "bps",
      baseline: (run: CounterfactualResult) =>
        run.baseline.stressMetrics.peakPriceErrorBps,
      intervention: (run: CounterfactualResult) =>
        run.intervention.stressMetrics.peakPriceErrorBps,
      improvement: (baseline: number, intervention: number) =>
        baseline - intervention,
    },
    {
      metric: "Maximum drawdown",
      unit: "%",
      baseline: (run: CounterfactualResult) =>
        run.baseline.stressMetrics.maximumDrawdownPct,
      intervention: (run: CounterfactualResult) =>
        run.intervention.stressMetrics.maximumDrawdownPct,
      improvement: (baseline: number, intervention: number) =>
        baseline - intervention,
    },
    {
      metric: "Resilience score",
      unit: "points",
      baseline: (run: CounterfactualResult) =>
        run.baseline.stressMetrics.resilienceScore,
      intervention: (run: CounterfactualResult) =>
        run.intervention.stressMetrics.resilienceScore,
      improvement: (baseline: number, intervention: number) =>
        intervention - baseline,
    },
  ];
  return {
    runs: count,
    firstSeed: config.seed,
    lastSeed: config.seed + count - 1,
    scenario: config.scenario,
    summaries: metrics.map((metric) => {
      const baseline = paired.map(metric.baseline);
      const intervention = paired.map(metric.intervention);
      const improvements = baseline.map((value, index) =>
        metric.improvement(value, intervention[index]!),
      );
      return {
        metric: metric.metric,
        unit: metric.unit,
        baselineMean: average(baseline),
        interventionMean: average(intervention),
        medianImprovement: quantile(improvements, 0.5),
        intervalLow: quantile(improvements, 0.025),
        intervalHigh: quantile(improvements, 0.975),
        improvementFrequency:
          improvements.filter((value) => value > 0).length / count,
      };
    }),
  };
};
