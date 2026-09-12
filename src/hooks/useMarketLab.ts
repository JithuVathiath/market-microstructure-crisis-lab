import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createDefaultConfig } from "../engine/simulation";
import { reconstructBook } from "../engine/eventReplay";
import type {
  CounterfactualResult,
  BatchExperimentResult,
  DecisionEvent,
  MarketSnapshot,
  MarketEvent,
  OrderRequest,
  PolicyConfig,
  ReplayFile,
  ScenarioId,
  SimulationConfig,
} from "../engine/types";

const speedOptions = [0.5, 1, 2, 8] as const;

type WorkerOutput =
  | {
      type: "snapshot";
      snapshot: MarketSnapshot;
      events: MarketEvent[];
      decisions: DecisionEvent[];
    }
  | { type: "comparison"; comparison: CounterfactualResult }
  | { type: "batch"; result: BatchExperimentResult };

export const useMarketLab = () => {
  const workerRef = useRef<Worker | null>(null);
  const [config, setConfig] = useState<SimulationConfig>(() =>
    createDefaultConfig(),
  );
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [history, setHistory] = useState<MarketSnapshot[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [decisions, setDecisions] = useState<DecisionEvent[]>([]);
  const [selectedTick, setSelectedTick] = useState<number | null>(null);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [speed, setSpeed] = useState<(typeof speedOptions)[number]>(2);
  const [playing, setPlaying] = useState(false);
  const [comparison, setComparison] = useState<CounterfactualResult | null>(
    null,
  );
  const [comparing, setComparing] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchExperimentResult | null>(
    null,
  );
  const [batchRunning, setBatchRunning] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL("../engine/worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
      const message = event.data;
      if (message.type === "comparison") {
        setComparison(message.comparison);
        setComparing(false);
        return;
      }
      if (message.type === "batch") {
        setBatchResult(message.result);
        setBatchRunning(false);
        return;
      }
      const next = message.snapshot;
      setEvents((current) => [...current, ...message.events]);
      setDecisions((current) => [...current, ...message.decisions]);
      setSnapshot(next);
      setHistory((current) => {
        const withoutTick = current.filter((item) => item.tick !== next.tick);
        return [...withoutTick, next]
          .sort((left, right) => left.tick - right.tick)
          .slice(-221);
      });
      if (next.status === "complete") setPlaying(false);
    };
    worker.postMessage({ type: "initialize", config });
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // The worker is intentionally created once; resets are sent explicitly below.
  }, []);

  const initialize = useCallback((nextConfig: SimulationConfig) => {
    setConfig(nextConfig);
    setHistory([]);
    setEvents([]);
    setDecisions([]);
    setSnapshot(null);
    setSelectedTick(null);
    setSelectedSequence(null);
    setPlaying(false);
    setComparison(null);
    setBatchResult(null);
    setBatchRunning(false);
    workerRef.current?.postMessage({ type: "initialize", config: nextConfig });
  }, []);

  const toggle = useCallback(() => {
    setSelectedTick(null);
    setSelectedSequence(null);
    setPlaying((current) => {
      workerRef.current?.postMessage({
        type: current ? "pause" : "start",
        speed,
      });
      return !current;
    });
  }, [speed]);

  const step = useCallback(() => {
    setPlaying(false);
    setSelectedTick(null);
    setSelectedSequence(null);
    workerRef.current?.postMessage({ type: "step" });
  }, []);

  const stop = useCallback(() => {
    setPlaying(false);
    workerRef.current?.postMessage({ type: "pause" });
  }, []);

  const reset = useCallback(() => initialize(config), [config, initialize]);

  const updateSpeed = useCallback(
    (nextSpeed: (typeof speedOptions)[number]) => {
      setSpeed(nextSpeed);
      if (playing) {
        workerRef.current?.postMessage({ type: "start", speed: nextSpeed });
      }
    },
    [playing],
  );

  const selectScenario = useCallback(
    (scenario: ScenarioId) => initialize({ ...config, scenario }),
    [config, initialize],
  );

  const launchScenario = useCallback(
    (scenario: ScenarioId) => {
      const next = { ...config, scenario };
      setConfig(next);
      setHistory([]);
      setEvents([]);
      setDecisions([]);
      setSnapshot(null);
      setSelectedTick(null);
      setSelectedSequence(null);
      setComparison(null);
      setBatchResult(null);
      setPlaying(true);
      workerRef.current?.postMessage({
        type: "initialize-and-start",
        config: next,
        speed,
      });
    },
    [config, speed],
  );

  const setSeed = useCallback(
    (seed: number) =>
      initialize({ ...config, seed: Math.max(1, Math.floor(seed)) }),
    [config, initialize],
  );

  const updatePolicies = useCallback(
    (policies: PolicyConfig) => {
      const next = { ...config, policies };
      setConfig(next);
      setComparison(null);
      workerRef.current?.postMessage({ type: "policies", policies });
    },
    [config],
  );

  const submitOrder = useCallback(
    (order: Omit<OrderRequest, "agentId" | "agentKind">) => {
      setSelectedTick(null);
      setSelectedSequence(null);
      workerRef.current?.postMessage({ type: "manual-order", order });
    },
    [],
  );

  const compare = useCallback(() => {
    setComparing(true);
    workerRef.current?.postMessage({ type: "compare", config });
  }, [config]);

  const runBatch = useCallback(
    (runs: number) => {
      setBatchRunning(true);
      workerRef.current?.postMessage({ type: "batch", config, runs });
    },
    [config],
  );

  const displayedSnapshot = useMemo(() => {
    if (!snapshot) return null;
    if (selectedSequence !== null) {
      const selectedEvent = events.find(
        (event) => event.sequenceNumber === selectedSequence,
      );
      if (!selectedEvent) return snapshot;
      const checkpoint =
        history
          .filter((item) => item.tick <= selectedEvent.simulationTimestamp)
          .at(-1) ?? snapshot;
      const book = reconstructBook(events, selectedSequence);
      const fundamental = [...events]
        .reverse()
        .find(
          (event) =>
            event.sequenceNumber <= selectedSequence &&
            event.eventType === "FundamentalValueUpdated",
        );
      const fundamentalPrice = Number(
        fundamental?.metadata.current ?? checkpoint.fundamentalPrice,
      );
      const midPrice = book.midPrice ?? checkpoint.lastPrice;
      const spreadBps = book.spread
        ? (book.spread / Math.max(midPrice, 0.01)) * 10_000
        : 0;
      const depth = [...book.bids.slice(0, 5), ...book.asks.slice(0, 5)].reduce(
        (total, level) => total + level.quantity,
        0,
      );
      const bestBidQuantity = book.bids[0]?.quantity ?? 0;
      const bestAskQuantity = book.asks[0]?.quantity ?? 0;
      const touchQuantity = bestBidQuantity + bestAskQuantity;
      const bookImbalance =
        touchQuantity === 0
          ? 0
          : (bestBidQuantity - bestAskQuantity) / touchQuantity;
      const microprice =
        book.bestBid === null || book.bestAsk === null || touchQuantity === 0
          ? midPrice
          : (book.bestAsk * bestBidQuantity + book.bestBid * bestAskQuantity) /
            touchQuantity;
      return {
        ...checkpoint,
        tick: selectedEvent.simulationTimestamp,
        status: "paused" as const,
        book,
        fundamentalPrice,
        eventLabel: `Event #${selectedSequence} · ${selectedEvent.eventType}`,
        recentEvents: events
          .filter((event) => event.sequenceNumber <= selectedSequence)
          .slice(-30)
          .reverse(),
        priceHistory: checkpoint.priceHistory.filter(
          (point) => point.tick <= selectedEvent.simulationTimestamp,
        ),
        metrics: {
          ...checkpoint.metrics,
          midPrice,
          spreadBps,
          depth,
          bookImbalance,
          microprice,
          priceErrorBps:
            (Math.abs(midPrice - fundamentalPrice) / fundamentalPrice) * 10_000,
        },
      };
    }
    return selectedTick === null
      ? snapshot
      : (history.find((item) => item.tick === selectedTick) ?? snapshot);
  }, [events, history, selectedSequence, selectedTick, snapshot]);

  const selectTick = useCallback((tick: number | null) => {
    setSelectedSequence(null);
    setSelectedTick(tick);
  }, []);

  const selectSequence = useCallback(
    (sequenceNumber: number | null) => {
      setPlaying(false);
      workerRef.current?.postMessage({ type: "pause" });
      setSelectedSequence(sequenceNumber);
      if (sequenceNumber === null) {
        setSelectedTick(null);
        return;
      }
      const selected = events.find(
        (event) => event.sequenceNumber === sequenceNumber,
      );
      setSelectedTick(selected?.simulationTimestamp ?? null);
    },
    [events],
  );

  const loadReplay = useCallback((replay: ReplayFile) => {
    workerRef.current?.postMessage({ type: "pause" });
    setConfig(replay.config);
    setSnapshot(replay.finalSnapshot);
    setHistory([replay.finalSnapshot]);
    setEvents(replay.eventStream);
    setDecisions(replay.decisionLog);
    setSelectedTick(null);
    setSelectedSequence(replay.eventStream.at(-1)?.sequenceNumber ?? null);
    setPlaying(false);
    setComparison(null);
    setBatchResult(null);
    setBatchRunning(false);
  }, []);

  return {
    config,
    snapshot,
    displayedSnapshot,
    history,
    events,
    decisions,
    selectedTick,
    setSelectedTick: selectTick,
    selectedSequence,
    selectSequence,
    speed,
    setSpeed: updateSpeed,
    speedOptions,
    playing,
    toggle,
    stop,
    step,
    reset,
    selectScenario,
    launchScenario,
    setSeed,
    updatePolicies,
    submitOrder,
    comparison,
    comparing,
    compare,
    batchResult,
    batchRunning,
    runBatch,
    loadReplay,
  };
};
