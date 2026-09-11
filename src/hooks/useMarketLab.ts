import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createDefaultConfig, runCounterfactual } from "../engine/simulation";
import type {
  CounterfactualResult,
  MarketSnapshot,
  OrderRequest,
  PolicyConfig,
  ScenarioId,
  SimulationConfig,
} from "../engine/types";

const speedOptions = [0.5, 1, 2, 8] as const;

export const useMarketLab = () => {
  const workerRef = useRef<Worker | null>(null);
  const [config, setConfig] = useState<SimulationConfig>(() =>
    createDefaultConfig(),
  );
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [history, setHistory] = useState<MarketSnapshot[]>([]);
  const [selectedTick, setSelectedTick] = useState<number | null>(null);
  const [speed, setSpeed] = useState<(typeof speedOptions)[number]>(2);
  const [playing, setPlaying] = useState(false);
  const [comparison, setComparison] = useState<CounterfactualResult | null>(
    null,
  );
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL("../engine/worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (
      event: MessageEvent<{ type: "snapshot"; snapshot: MarketSnapshot }>,
    ) => {
      if (event.data.type !== "snapshot") return;
      const next = event.data.snapshot;
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
    setSnapshot(null);
    setSelectedTick(null);
    setPlaying(false);
    setComparison(null);
    workerRef.current?.postMessage({ type: "initialize", config: nextConfig });
  }, []);

  const toggle = useCallback(() => {
    setSelectedTick(null);
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
    workerRef.current?.postMessage({ type: "step" });
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
      workerRef.current?.postMessage({ type: "manual-order", order });
    },
    [],
  );

  const compare = useCallback(() => {
    setComparing(true);
    window.setTimeout(() => {
      setComparison(runCounterfactual(config));
      setComparing(false);
    }, 30);
  }, [config]);

  const displayedSnapshot = useMemo(
    () =>
      selectedTick === null
        ? snapshot
        : (history.find((item) => item.tick === selectedTick) ?? snapshot),
    [history, selectedTick, snapshot],
  );

  return {
    config,
    snapshot,
    displayedSnapshot,
    history,
    selectedTick,
    setSelectedTick,
    speed,
    setSpeed: updateSpeed,
    speedOptions,
    playing,
    toggle,
    step,
    reset,
    selectScenario,
    setSeed,
    updatePolicies,
    submitOrder,
    comparison,
    comparing,
    compare,
  };
};
