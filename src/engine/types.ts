export type Side = "buy" | "sell";
export type OrderType = "limit" | "market";
export type SimulationStatus =
  "ready" | "running" | "paused" | "complete" | "halted";
export type ScenarioId =
  | "stable"
  | "flash-crash"
  | "liquidity-drought"
  | "institutional-liquidation"
  | "information-shock"
  | "latency-race"
  | "volatility-feedback"
  | "cancellation-surge"
  | "exchange-outage"
  | "tick-size-experiment";

export type AgentKind =
  "market-maker" | "noise" | "momentum" | "value" | "institutional" | "latency";

export interface LatencyProfile {
  label: string;
  marketDataTicks: number;
  decisionTicks: number;
  transmissionTicks: number;
  exchangeProcessingTicks: number;
}

export interface OrderRequest {
  agentId: string;
  agentKind: AgentKind;
  side: Side;
  type: OrderType;
  price?: number;
  quantity: number;
}

export interface Order extends OrderRequest {
  id: string;
  price: number;
  remaining: number;
  sequence: number;
  createdTick: number;
}

export interface Trade {
  id: string;
  tick: number;
  price: number;
  quantity: number;
  makerOrderId: string;
  takerOrderId: string;
  makerSide: Side;
  buyerId: string;
  sellerId: string;
  buyerKind: AgentKind;
  sellerKind: AgentKind;
  buyerFee: number;
  sellerFee: number;
}

export interface BookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface QueueEntry {
  orderId: string;
  agentId: string;
  agentKind: AgentKind;
  side: Side;
  price: number;
  remaining: number;
  queuePosition: number;
  createdTick: number;
  ageTicks: number;
}

export interface BookView {
  bids: BookLevel[];
  asks: BookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  midPrice: number | null;
  bidQueue: QueueEntry[];
  askQueue: QueueEntry[];
}

export interface CoreExchangeEvent {
  sequenceNumber: number;
  simulationTimestamp: number;
  eventType: string;
  agentId: string | null;
  orderId: string | null;
  parentOrderId: string | null;
  side: Side | null;
  price: number | null;
  quantity: number | null;
  remainingQuantity: number | null;
  reasonCode: string;
  metadata: Record<string, unknown>;
}

export type MarketEventType =
  | "NewOrder"
  | "CancelOrder"
  | "ReplaceOrder"
  | "Trade"
  | "PartialFill"
  | "OrderExpired"
  | "TradingHalt"
  | "TradingResume"
  | "RegulatoryTrigger"
  | "AgentStateChange"
  | "ShockTriggered"
  | "QuoteUpdated"
  | "FundamentalValueUpdated"
  | "PolicyChanged"
  | "SurveillanceAlert";

export interface MarketEvent {
  sequenceNumber: number;
  simulationTimestamp: number;
  exchangeTimestamp: number;
  eventType: MarketEventType;
  agentId: string | null;
  orderId: string | null;
  parentOrderId: string | null;
  side: Side | null;
  price: number | null;
  quantity: number | null;
  remainingQuantity: number | null;
  reasonCode: string;
  metadata: Record<string, unknown>;
}

export interface CausalStep {
  sequenceNumber: number;
  tick: number;
  label: string;
  evidence: string;
}

export interface PolicyConfig {
  circuitBreaker: boolean;
  circuitBreakerThresholdPct: number;
  haltTicks: number;
  speedBumpTicks: number;
  minimumRestingTicks: number;
  maxCancelToTradeRatio: number;
  tickSize: number;
  makerFeeBps: number;
  takerFeeBps: number;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  shortName: string;
  description: string;
  learningGoal: string;
  shockTick: number | null;
  accent: string;
  suggestedMetrics: string[];
  limitations: string;
}

export interface AgentState {
  id: string;
  kind: AgentKind;
  label: string;
  cash: number;
  inventory: number;
  inventoryLimit: number;
  riskTolerance: number;
  observedPrice: number;
  privateValuation: number;
  initialWealth: number;
  submittedQuantity: number;
  executedQuantity: number;
  cancellations: number;
  trades: number;
  latency: LatencyProfile;
  active: boolean;
  lastDecision: string;
  currentObjective: string;
}

export interface AgentView extends AgentState {
  wealth: number;
  pnl: number;
  fillRate: number;
}

export interface DecisionEvent {
  sequenceNumber: number;
  tick: number;
  agentId: string;
  agentKind: AgentKind;
  action: string;
  reason: string;
  observedPrice: number;
  fundamentalEstimate: number;
  inventory: number;
  inventoryLimit: number;
  riskUtilization: number;
  latency: LatencyProfile;
  objective: string;
  variables: Record<string, number | string | boolean>;
}

export type AlertSeverity = "info" | "warning" | "critical" | "success";

export interface MarketAlert {
  id: string;
  tick: number;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface MarketMetrics {
  midPrice: number;
  lastPrice: number;
  spreadBps: number;
  depth: number;
  volatilityBps: number;
  priceErrorBps: number;
  fillRate: number;
  cancelToTradeRatio: number;
  marketQualityScore: number;
  totalVolume: number;
  retailSlippageBps: number;
  institutionalShortfallBps: number;
  marketImpactBps: number;
  microprice: number;
  bookImbalance: number;
  marketMakerInventoryRisk: number;
  cancellationIntensity: number;
  recoveryTicks: number | null;
}

export interface PricePoint {
  tick: number;
  price: number;
  fundamental: number;
  spreadBps: number;
  volume: number;
}

export interface MarketSnapshot {
  tick: number;
  status: SimulationStatus;
  scenario: ScenarioId;
  seed: number;
  book: BookView;
  lastPrice: number;
  fundamentalPrice: number;
  metrics: MarketMetrics;
  recentTrades: Trade[];
  agents: AgentView[];
  decisions: DecisionEvent[];
  alerts: MarketAlert[];
  priceHistory: PricePoint[];
  haltUntilTick: number | null;
  eventLabel: string;
  latestSequenceNumber: number;
  eventStreamHash: string;
  recentEvents: MarketEvent[];
  causalChain: CausalStep[];
  conservation: {
    initialCash: number;
    currentCash: number;
    exchangeFeeRevenue: number;
    initialInventory: number;
    currentInventory: number;
    cashConserved: boolean;
    inventoryConserved: boolean;
  };
}

export interface SimulationConfig {
  seed: number;
  scenario: ScenarioId;
  maxTicks: number;
  initialPrice: number;
  policies: PolicyConfig;
}

export interface ExperimentResult {
  label: string;
  scenario: ScenarioId;
  seed: number;
  policies: PolicyConfig;
  finalMetrics: MarketMetrics;
  priceHistory: PricePoint[];
  alerts: MarketAlert[];
  trades: number;
  stressMetrics: {
    peakSpreadBps: number;
    peakVolatilityBps: number;
    peakPriceErrorBps: number;
    maximumDrawdownPct: number;
    worstQualityScore: number;
    resilienceScore: number;
  };
}

export interface CounterfactualResult {
  baseline: ExperimentResult;
  intervention: ExperimentResult;
  improvements: {
    spreadPct: number;
    volatilityPct: number;
    priceErrorPct: number;
    marketQualityPoints: number;
  };
}

export interface BatchMetricSummary {
  metric: string;
  unit: string;
  baselineMean: number;
  interventionMean: number;
  medianImprovement: number;
  intervalLow: number;
  intervalHigh: number;
  improvementFrequency: number;
}

export interface BatchExperimentResult {
  runs: number;
  firstSeed: number;
  lastSeed: number;
  scenario: ScenarioId;
  summaries: BatchMetricSummary[];
}

export interface ReplayFile {
  schemaVersion: 2;
  generatedAt: string;
  applicationVersion: "2.0.0";
  application: "Market Microstructure Crisis Lab";
  engine: "rust-wasm";
  config: SimulationConfig;
  eventStream: MarketEvent[];
  decisionLog: DecisionEvent[];
  eventStreamHash: string;
  finalSnapshot: MarketSnapshot;
  disclaimer: string;
}
