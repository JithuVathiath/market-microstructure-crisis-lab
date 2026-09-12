/// <reference lib="webworker" />

import {
  MarketSimulation,
  runBatchExperiment,
  runCounterfactual,
} from "./simulation";
import type { OrderRequest, PolicyConfig, SimulationConfig } from "./types";
import { initializeExchangeWasm, WasmOrderBook } from "./wasmBook";

type IncomingMessage =
  | { type: "initialize"; config: SimulationConfig }
  | { type: "initialize-and-start"; config: SimulationConfig; speed: number }
  | { type: "start"; speed: number }
  | { type: "pause" }
  | { type: "step" }
  | { type: "compare"; config: SimulationConfig }
  | { type: "batch"; config: SimulationConfig; runs: number }
  | { type: "policies"; policies: PolicyConfig }
  | {
      type: "manual-order";
      order: Omit<OrderRequest, "agentId" | "agentKind">;
    };

let simulation: MarketSimulation | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let speed = 1;
let publishedSequence = 0;
let publishedDecisionSequence = 0;
const wasmReady = initializeExchangeWasm();
const wasmBookFactory = (policies: PolicyConfig) => new WasmOrderBook(policies);

const stop = (): void => {
  if (timer !== null) clearInterval(timer);
  timer = null;
};

const publish = (): void => {
  if (!simulation) return;
  const events = simulation.eventsSince(publishedSequence);
  const decisions = simulation.decisionsSince(publishedDecisionSequence);
  publishedSequence =
    events.at(-1)?.sequenceNumber ?? simulation.snapshot().latestSequenceNumber;
  publishedDecisionSequence =
    decisions.at(-1)?.sequenceNumber ?? publishedDecisionSequence;
  self.postMessage({
    type: "snapshot",
    snapshot: simulation.snapshot(),
    events,
    decisions,
  });
};

const advance = (): void => {
  if (!simulation) return;
  const snapshot = simulation.step();
  if (snapshot.status === "complete") {
    stop();
  }
  publish();
};

const start = (): void => {
  stop();
  const delay = Math.max(35, 420 / Math.max(speed, 0.25));
  timer = setInterval(advance, delay);
};

self.onmessage = async (
  event: MessageEvent<IncomingMessage>,
): Promise<void> => {
  const message = event.data;
  await wasmReady;
  switch (message.type) {
    case "initialize":
      stop();
      publishedSequence = 0;
      publishedDecisionSequence = 0;
      simulation = new MarketSimulation(message.config, wasmBookFactory);
      publish();
      break;
    case "initialize-and-start":
      stop();
      publishedSequence = 0;
      publishedDecisionSequence = 0;
      simulation = new MarketSimulation(message.config, wasmBookFactory);
      speed = message.speed;
      publish();
      start();
      break;
    case "start":
      speed = message.speed;
      start();
      break;
    case "pause":
      stop();
      publish();
      break;
    case "step":
      stop();
      advance();
      break;
    case "compare":
      self.postMessage({
        type: "comparison",
        comparison: runCounterfactual(message.config, wasmBookFactory),
      });
      break;
    case "batch":
      self.postMessage({
        type: "batch",
        result: runBatchExperiment(
          message.config,
          message.runs,
          wasmBookFactory,
        ),
      });
      break;
    case "policies":
      simulation?.setPolicies(message.policies);
      publish();
      break;
    case "manual-order":
      simulation?.submitManualOrder(message.order);
      publish();
      break;
  }
};

export {};
