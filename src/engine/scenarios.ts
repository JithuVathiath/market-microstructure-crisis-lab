import type { ScenarioDefinition, ScenarioId } from "./types";

export const scenarios: readonly ScenarioDefinition[] = [
  {
    id: "flash-crash",
    name: "Flash crash and liquidity withdrawal",
    shortName: "Flash crash",
    description:
      "A large sell program arrives as market makers withdraw, amplifying price impact and volatility.",
    learningGoal:
      "Test whether circuit breakers improve recovery without permanently reducing liquidity.",
    shockTick: 70,
    accent: "#ff6b6b",
  },
  {
    id: "liquidity-drought",
    name: "Liquidity drought",
    shortName: "Liquidity drought",
    description:
      "Market makers reduce participation while ordinary order flow continues, widening the spread.",
    learningGoal:
      "Observe how market depth and execution quality deteriorate before price collapses.",
    shockTick: 60,
    accent: "#ffb454",
  },
  {
    id: "information-shock",
    name: "Fundamental information shock",
    shortName: "Information shock",
    description:
      "Fundamental value falls abruptly and heterogeneous agents incorporate the information at different speeds.",
    learningGoal:
      "Separate rapid price discovery from destabilizing overshoot.",
    shockTick: 70,
    accent: "#c084fc",
  },
  {
    id: "latency-race",
    name: "Latency arms race",
    shortName: "Latency race",
    description:
      "A low-latency participant reacts more frequently than slower participants to small valuation changes.",
    learningGoal: "Compare execution quality before and after a speed bump.",
    shockTick: 50,
    accent: "#38bdf8",
  },
  {
    id: "stable",
    name: "Stable market control",
    shortName: "Stable control",
    description:
      "Balanced liquidity and heterogeneous order flow provide a control experiment.",
    learningGoal:
      "Understand normal spread, depth, volatility, and price-discovery behavior.",
    shockTick: null,
    accent: "#4ade80",
  },
] as const;

export const scenarioById = (id: ScenarioId): ScenarioDefinition => {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
};
