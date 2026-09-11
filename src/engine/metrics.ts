import type { AgentState, BookView, MarketMetrics, PricePoint } from "./types";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const average = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;

export interface MetricsInput {
  book: BookView;
  lastPrice: number;
  fundamentalPrice: number;
  priceHistory: PricePoint[];
  agents: AgentState[];
  totalVolume: number;
  retailSlippages: number[];
  recoveryTicks: number | null;
}

export const calculateMetrics = (input: MetricsInput): MarketMetrics => {
  const midPrice = input.book.midPrice ?? input.lastPrice;
  const spreadBps = input.book.spread
    ? (input.book.spread / Math.max(midPrice, 0.01)) * 10_000
    : 0;
  const depth = [
    ...input.book.bids.slice(0, 5),
    ...input.book.asks.slice(0, 5),
  ].reduce((total, level) => total + level.quantity, 0);
  const recent = input.priceHistory.slice(-30);
  const returns = recent.slice(1).map((point, index) => {
    const previous = recent[index]!.price;
    return previous > 0 ? Math.log(point.price / previous) : 0;
  });
  const volatilityBps =
    Math.sqrt(average(returns.map((value) => value * value))) * 10_000;
  const priceErrorBps =
    (Math.abs(midPrice - input.fundamentalPrice) / input.fundamentalPrice) *
    10_000;
  const submitted = input.agents.reduce(
    (total, agent) => total + agent.submittedQuantity,
    0,
  );
  const executed = input.agents.reduce(
    (total, agent) => total + agent.executedQuantity,
    0,
  );
  const cancellations = input.agents.reduce(
    (total, agent) => total + agent.cancellations,
    0,
  );
  const tradeSides = input.agents.reduce(
    (total, agent) => total + agent.trades,
    0,
  );
  const fillRate = submitted === 0 ? 0 : executed / submitted;
  const cancelToTradeRatio = cancellations / Math.max(tradeSides / 2, 1);
  const marketQualityScore = clamp(
    100 - spreadBps * 0.42 - volatilityBps * 0.32 - priceErrorBps * 0.12,
    0,
    100,
  );
  return {
    midPrice,
    lastPrice: input.lastPrice,
    spreadBps,
    depth,
    volatilityBps,
    priceErrorBps,
    fillRate,
    cancelToTradeRatio,
    marketQualityScore,
    totalVolume: input.totalVolume,
    retailSlippageBps: average(input.retailSlippages),
    recoveryTicks: input.recoveryTicks,
  };
};

export const percentageImprovement = (
  baseline: number,
  intervention: number,
): number =>
  baseline === 0 ? 0 : ((baseline - intervention) / Math.abs(baseline)) * 100;
