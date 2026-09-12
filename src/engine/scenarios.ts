import type { ScenarioDefinition, ScenarioId } from "./types";

export const scenarios: readonly ScenarioDefinition[] = [
  {
    id: "flash-crash",
    name: "Flash Crash and Liquidity Withdrawal",
    shortName: "Flash Crash",
    description:
      "A large sell programme arrives as market makers withdraw, amplifying price impact and volatility.",
    learningGoal:
      "Test whether circuit breakers improve recovery without permanently reducing liquidity.",
    shockTick: 70,
    accent: "#ff6b6b",
    suggestedMetrics: ["Maximum drawdown", "Depth", "Recovery time"],
    limitations: "The sell programme and withdrawal rules are stylised.",
  },
  {
    id: "liquidity-drought",
    name: "Liquidity Drought",
    shortName: "Liquidity Drought",
    description:
      "Market makers reduce participation while ordinary order flow continues, widening the spread.",
    learningGoal:
      "Observe how market depth and execution quality deteriorate before price collapses.",
    shockTick: 60,
    accent: "#ffb454",
    suggestedMetrics: ["Spread", "Depth", "Fill rate"],
    limitations: "Dealer risk constraints are simplified.",
  },
  {
    id: "institutional-liquidation",
    name: "Institutional Liquidation",
    shortName: "Institutional Sell",
    description:
      "A parent sell order is split into repeated child orders against otherwise active liquidity.",
    learningGoal:
      "Measure implementation pressure and distinguish execution impact from quote withdrawal.",
    shockTick: 65,
    accent: "#fb7185",
    suggestedMetrics: ["Market impact", "Slippage", "Fill rate"],
    limitations:
      "The parent order uses a fixed synthetic schedule, not an optimiser.",
  },
  {
    id: "information-shock",
    name: "Fundamental Information Shock",
    shortName: "Information Shock",
    description:
      "Fundamental value falls abruptly and heterogeneous agents incorporate the information at different speeds.",
    learningGoal:
      "Separate rapid price discovery from destabilising overshoot.",
    shockTick: 70,
    accent: "#c084fc",
    suggestedMetrics: ["Price-discovery error", "Volatility", "Overshoot"],
    limitations:
      "Information arrival is exogenous and common after latency delays.",
  },
  {
    id: "latency-race",
    name: "Latency Arms Race",
    shortName: "Latency Race",
    description:
      "A low-latency participant reacts more frequently than slower participants to small valuation changes.",
    learningGoal: "Compare execution quality before and after a speed bump.",
    shockTick: 50,
    accent: "#38bdf8",
    suggestedMetrics: ["Queue position", "Fill probability", "Retail slippage"],
    limitations:
      "Ticks are logical units of time, not calibrated milliseconds.",
  },
  {
    id: "volatility-feedback",
    name: "Volatility Feedback Loop",
    shortName: "Volatility Feedback",
    description:
      "A modest value shock is amplified by short-horizon momentum responses and changing liquidity.",
    learningGoal:
      "Trace when endogenous flow magnifies an exogenous repricing.",
    shockTick: 60,
    accent: "#f97316",
    suggestedMetrics: ["Volatility", "Price error", "Market quality"],
    limitations:
      "Momentum rules are transparent stylisations of feedback trading.",
  },
  {
    id: "cancellation-surge",
    name: "Cancellation-Surge Surveillance",
    shortName: "Cancellation Surge",
    description:
      "A burst of quote withdrawals creates an abnormal cancellation signature for surveillance review.",
    learningGoal:
      "Inspect cancellation intensity without asserting manipulative intent.",
    shockTick: 55,
    accent: "#facc15",
    suggestedMetrics: ["Cancel-to-trade ratio", "Order age", "Depth"],
    limitations:
      "The detector identifies a pattern, not misconduct or legal intent.",
  },
  {
    id: "exchange-outage",
    name: "Synthetic Exchange Outage",
    shortName: "Exchange Outage",
    description:
      "Order acceptance pauses for ten logical ticks before deterministic resumption.",
    learningGoal:
      "Study queued flow, restart conditions, and post-outage liquidity.",
    shockTick: 65,
    accent: "#94a3b8",
    suggestedMetrics: ["Execution delay", "Spread", "Recovery time"],
    limitations: "Network topology and failover venues are outside the model.",
  },
  {
    id: "tick-size-experiment",
    name: "Tick-Size Regime Change",
    shortName: "Tick-Size Test",
    description:
      "The minimum price increment widens during the run while the same agents continue trading.",
    learningGoal:
      "Observe the trade-off between quoted spread and queue aggregation.",
    shockTick: 70,
    accent: "#22d3ee",
    suggestedMetrics: ["Spread", "Queue depth", "Fill rate"],
    limitations: "Existing resting orders retain their original valid price.",
  },
  {
    id: "stable",
    name: "Stable Market Control",
    shortName: "Stable Control",
    description:
      "Balanced liquidity and heterogeneous order flow provide a control experiment.",
    learningGoal:
      "Understand normal spread, depth, volatility, and price-discovery behaviour.",
    shockTick: null,
    accent: "#4ade80",
    suggestedMetrics: ["Spread", "Depth", "Price-discovery error"],
    limitations: "This is a synthetic control, not a calibrated real market.",
  },
] as const;

export const scenarioById = (id: ScenarioId): ScenarioDefinition => {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
};
