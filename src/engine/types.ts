export type Side = "buy" | "sell";
export type OrderType = "limit" | "market";
export type SimulationStatus =
  "ready" | "running" | "paused" | "complete" | "halted";
export type ScenarioId =
  | "stable"
  | "flash-crash"
  | "liquidity-drought"
  | "information-shock"
  | "latency-race";

export type AgentKind =
  "market-maker" | "noise" | "momentum" | "value" | "institutional" | "latency";

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

export interface BookView {
  bids: BookLevel[];
  asks: BookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  midPrice: number | null;
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
}

export interface AgentState {
  id: string;
  kind: AgentKind;
  label: string;
  cash: number;
  inventory: number;
  initialWealth: number;
  submittedQuantity: number;
  executedQuantity: number;
  cancellations: number;
  trades: number;
  latencyTicks: number;
  active: boolean;
  lastDecision: string;
}

export interface AgentView extends AgentState {
  wealth: number;
  pnl: number;
  fillRate: number;
}

export interface DecisionEvent {
  tick: number;
  agentId: string;
  agentKind: AgentKind;
  action: string;
  reason: string;
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

export interface ReplayFile {
  schemaVersion: 1;
  generatedAt: string;
  application: "Market Microstructure Crisis Lab";
  config: SimulationConfig;
  finalSnapshot: MarketSnapshot;
  disclaimer: string;
}
