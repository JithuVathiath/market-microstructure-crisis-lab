/// <reference lib="webworker" />

import { MarketSimulation } from "./simulation";
import type { OrderRequest, PolicyConfig, SimulationConfig } from "./types";

type IncomingMessage =
  | { type: "initialize"; config: SimulationConfig }
  | { type: "start"; speed: number }
  | { type: "pause" }
  | { type: "step" }
  | { type: "policies"; policies: PolicyConfig }
  | {
      type: "manual-order";
      order: Omit<OrderRequest, "agentId" | "agentKind">;
    };

let simulation: MarketSimulation | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let speed = 1;

const stop = (): void => {
  if (timer !== null) clearInterval(timer);
  timer = null;
};

const publish = (): void => {
  if (!simulation) return;
  self.postMessage({ type: "snapshot", snapshot: simulation.snapshot() });
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

self.onmessage = (event: MessageEvent<IncomingMessage>): void => {
  const message = event.data;
  switch (message.type) {
    case "initialize":
      stop();
      simulation = new MarketSimulation(message.config);
      publish();
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
